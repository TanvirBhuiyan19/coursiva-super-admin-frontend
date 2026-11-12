import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type {
  BackupActivity,
  BackupPoint,
  BackupSettings,
  BackupSummary,
  ExportDownload,
  ExportFormat,
  Restore,
  StageRestoreInput,
  TenantExport,
} from './types';

export const backupKeys = {
  all: ['backup'] as const,
  summary: () => [...backupKeys.all, 'summary'] as const,
  points: (page = 1) => [...backupKeys.all, 'points', page] as const,
  restores: (page = 1) => [...backupKeys.all, 'restores', page] as const,
  settings: () => [...backupKeys.all, 'settings'] as const,
  exports: () => [...backupKeys.all, 'exports'] as const,
  exportList: (params: { page: number; tenant?: string; perPage: number }) => [...backupKeys.exports(), 'list', params] as const,
  export: (id: string) => [...backupKeys.exports(), 'detail', id] as const,
  activity: (page = 1) => [...backupKeys.all, 'activity', page] as const,
};

/** Backup writes touch the summary, activity log and audit log. */
function invalidateBackup(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: backupKeys.all });
  void qc.invalidateQueries({ queryKey: ['audit'] });
}

// ---------- Queries ----------
export const useBackupSummary = () =>
  useQuery({
    queryKey: backupKeys.summary(),
    queryFn: ({ signal }) => api.get<Resource<BackupSummary>>('/backup', { signal }).then((r) => r.data),
  });

export const POINTS_PER_PAGE = 20;
export const RESTORES_PER_PAGE = 10;
export const EXPORTS_PER_PAGE = 10;
export const ACTIVITY_PER_PAGE = 10;

const isActive = (r: Restore) => ['staged', 'approved', 'running'].includes(r.status);

export const useBackupPoints = (page = 1) =>
  useQuery<Paginated<BackupPoint>>({
    queryKey: backupKeys.points(page),
    queryFn: ({ signal }) => api.get<Paginated<BackupPoint>>('/backup/points', { query: { page, perPage: POINTS_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
  });

/** One page of restores, newest first. Polls while one is staged or running so approvals and progress show up. */
export const useRestores = (page = 1) =>
  useQuery<Paginated<Restore>>({
    queryKey: backupKeys.restores(page),
    queryFn: ({ signal }) => api.get<Paginated<Restore>>('/backup/restores', { query: { page, perPage: RESTORES_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.data.some(isActive) ? 15_000 : false),
  });

export const useBackupSettings = () =>
  useQuery({
    queryKey: backupKeys.settings(),
    queryFn: ({ signal }) => api.get<Resource<BackupSettings>>('/backup/settings', { signal }).then((r) => r.data),
  });

/** School exports, newest first, one page at a time; `tenant` narrows to one school (its latest export is the first row). */
export const useTenantExports = (params: { page: number; tenant?: string; perPage?: number }, enabled = true) => {
  const p = { page: params.page, tenant: params.tenant, perPage: params.perPage ?? EXPORTS_PER_PAGE };
  return useQuery<Paginated<TenantExport>>({
    queryKey: backupKeys.exportList(p),
    queryFn: ({ signal }) => api.get<Paginated<TenantExport>>('/backup/exports', { query: { ...p }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
};

/** One export by id (the "Your data export is ready" email links to it), wherever it falls in the list. */
export const useTenantExport = (id: string) =>
  useQuery({
    queryKey: backupKeys.export(id),
    queryFn: ({ signal }) => api.get<Resource<TenantExport>>(`/backup/exports/${encodeURIComponent(id)}`, { signal }).then((r) => r.data),
    retry: false,
  });

export const useBackupActivity = (page = 1) =>
  useQuery<Paginated<BackupActivity>>({
    queryKey: backupKeys.activity(page),
    queryFn: ({ signal }) =>
      api.get<Paginated<BackupActivity>>('/backup/activity', { query: { page, perPage: ACTIVITY_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
  });

// ---------- Mutations ----------
export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) => api.post<Resource<BackupPoint>>('/backup/run', { label: label ?? null }).then((r) => r.data),
    onSuccess: () => invalidateBackup(qc),
  });
}

export function useRunDrill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Resource<BackupSummary>>('/backup/drills').then((r) => r.data),
    onSuccess: (summary) => {
      qc.setQueryData(backupKeys.summary(), summary);
      invalidateBackup(qc);
    },
  });
}

export function useStageRestore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StageRestoreInput) => api.post<Resource<Restore>>('/backup/restores', input).then((r) => r.data),
    onSuccess: () => invalidateBackup(qc),
    meta: { errorToast: false },
  });
}

export function useRestoreAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'cancel' }) =>
      api.post<Resource<Restore>>(`/backup/restores/${id}/${action}`).then((r) => r.data),
    onSettled: () => invalidateBackup(qc),
  });
}

/** Policy changes. Toggles apply optimistically and roll back on failure. */
export function useUpdateBackupSettings() {
  const qc = useQueryClient();
  const key = backupKeys.settings();
  return useMutation({
    mutationFn: (patch: Partial<BackupSettings>) => api.patch<Resource<BackupSettings>>('/backup/settings', patch).then((r) => r.data),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BackupSettings>(key);
      if (prev) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (next) => {
      qc.setQueryData(key, next);
      invalidateBackup(qc);
    },
    meta: { errorToast: false },
  });
}

/**
 * A short-lived signed URL for a ready export (`GET /backup/exports/{id}/download`, audited). The browser then
 * downloads the archive straight from storage. 409 while not ready or once expired.
 */
export function useExportDownload() {
  return useMutation({
    mutationFn: (exportId: string) =>
      api.get<Resource<ExportDownload>>(`/backup/exports/${encodeURIComponent(exportId)}/download`).then((r) => r.data),
    // The URL answers `Content-Disposition: attachment`, so opening it in this tab downloads without leaving the console.
    onSuccess: ({ url }) => void window.open(url, '_self'),
  });
}

export function useQueueExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { tenantId: string; format: ExportFormat; includeMedia: boolean }) =>
      api.post<Resource<TenantExport>>('/backup/exports', body).then((r) => r.data),
    onSuccess: () => invalidateBackup(qc),
  });
}
