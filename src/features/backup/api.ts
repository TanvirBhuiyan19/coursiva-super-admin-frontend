import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type {
  BackupActivity,
  BackupPoint,
  BackupSettings,
  BackupSummary,
  ExportFormat,
  Restore,
  StageRestoreInput,
  TenantExport,
} from './types';

export const backupKeys = {
  all: ['backup'] as const,
  summary: () => [...backupKeys.all, 'summary'] as const,
  points: () => [...backupKeys.all, 'points'] as const,
  restores: () => [...backupKeys.all, 'restores'] as const,
  settings: () => [...backupKeys.all, 'settings'] as const,
  exports: () => [...backupKeys.all, 'exports'] as const,
  activity: () => [...backupKeys.all, 'activity'] as const,
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

export const useBackupPoints = () =>
  useQuery({
    queryKey: backupKeys.points(),
    queryFn: ({ signal }) => api.get<Paginated<BackupPoint>>('/backup/points', { query: { perPage: 20 }, signal }).then((r) => r.data),
  });

/** Restores, newest first. Polls while one is staged or running so approvals and progress show up. */
export const useRestores = () =>
  useQuery({
    queryKey: backupKeys.restores(),
    queryFn: ({ signal }) => api.get<Paginated<Restore>>('/backup/restores', { query: { perPage: 10 }, signal }).then((r) => r.data),
    refetchInterval: (q) => (q.state.data?.some((r) => ['staged', 'approved', 'running'].includes(r.status)) ? 15_000 : false),
  });

export const useBackupSettings = () =>
  useQuery({
    queryKey: backupKeys.settings(),
    queryFn: ({ signal }) => api.get<Resource<BackupSettings>>('/backup/settings', { signal }).then((r) => r.data),
  });

export const useTenantExports = () =>
  useQuery({
    queryKey: backupKeys.exports(),
    queryFn: ({ signal }) => api.get<Paginated<TenantExport>>('/backup/exports', { query: { perPage: 50 }, signal }).then((r) => r.data),
  });

export const useBackupActivity = () =>
  useQuery({
    queryKey: backupKeys.activity(),
    queryFn: ({ signal }) => api.get<Paginated<BackupActivity>>('/backup/activity', { query: { perPage: 8 }, signal }).then((r) => r.data),
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

export function useQueueExport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { tenantId: string; format: ExportFormat; includeMedia: boolean }) =>
      api.post<Resource<TenantExport>>('/backup/exports', body).then((r) => r.data),
    onSuccess: () => invalidateBackup(qc),
  });
}
