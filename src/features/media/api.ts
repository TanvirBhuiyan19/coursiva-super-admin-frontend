import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateTenantData } from '@/features/tenants/api';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import type {
  Connection,
  CredentialsInput,
  DrmSettings,
  DrmUpdate,
  LiveRoomSettings,
  LiveRoomUpdate,
  StorageSettings,
  StorageUpdate,
} from './types';

export const mediaKeys = {
  all: ['media'] as const,
  liveRooms: () => [...mediaKeys.all, 'live-rooms'] as const,
  drm: () => [...mediaKeys.all, 'drm'] as const,
  storage: () => [...mediaKeys.all, 'storage'] as const,
};

// ---------- Queries ----------
export const useLiveRooms = () =>
  useQuery({
    queryKey: mediaKeys.liveRooms(),
    queryFn: ({ signal }) => api.get<Resource<LiveRoomSettings>>('/media/live-rooms', { signal }).then((r) => r.data),
  });

export const useDrm = () =>
  useQuery({
    queryKey: mediaKeys.drm(),
    queryFn: ({ signal }) => api.get<Resource<DrmSettings>>('/media/drm', { signal }).then((r) => r.data),
  });

export const useStorage = () =>
  useQuery({
    queryKey: mediaKeys.storage(),
    queryFn: ({ signal }) => api.get<Resource<StorageSettings>>('/media/storage', { signal }).then((r) => r.data),
  });

// ---------- Mutations ----------
/** Settings PATCH with an optimistic merge of toggle lists, rolled back on failure. */
function useSettingsPatch<S, P>(key: readonly unknown[], path: string, apply: (s: S, p: P) => S, after?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: P) => api.patch<Resource<S>>(path, patch).then((r) => r.data),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<S>(key);
      if (prev) qc.setQueryData(key, apply(prev, patch));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (s) => qc.setQueryData(key, s),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['audit'] });
      after?.();
    },
  });
}

const mergeToggles = <T extends { key: string; enabled: boolean }>(list: T[], patch?: { key: string; enabled: boolean }[]) =>
  patch ? list.map((x) => ({ ...x, enabled: patch.find((p) => p.key === x.key)?.enabled ?? x.enabled })) : list;

/** Live-room policies and per-plan allowances. Allowances feed every tenant's `liveRoomMinutes` limit. */
export function useUpdateLiveRooms() {
  const qc = useQueryClient();
  return useSettingsPatch<LiveRoomSettings, LiveRoomUpdate>(
    mediaKeys.liveRooms(),
    '/media/live-rooms',
    (s, p) => ({
      ...s,
      policies: mergeToggles(s.policies, p.policies),
      allowances: s.allowances.map((a) => ({ ...a, minutes: p.allowances?.find((x) => x.plan === a.plan)?.minutes ?? a.minutes })),
    }),
    () => {
      invalidateTenantData(qc);
      void qc.invalidateQueries({ queryKey: ['entitlements'] }); // plan limits table
    },
  );
}

export const useUpdateDrm = () =>
  useSettingsPatch<DrmSettings, DrmUpdate>(mediaKeys.drm(), '/media/drm', (s, p) => ({
    ...s,
    ...p,
    protections: mergeToggles(s.protections, p.protections),
  }));

export const useUpdateStorage = () =>
  useSettingsPatch<StorageSettings, StorageUpdate>(mediaKeys.storage(), '/media/storage', (s, p) => ({ ...s, ...p }));

export function useRotateDrmKeys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Resource<DrmSettings>>('/media/drm/rotate-keys').then((r) => r.data),
    onSuccess: (s) => {
      qc.setQueryData(mediaKeys.drm(), s);
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export type ConnectionKind = 'drm' | 'storage';
const connectionPath = (kind: ConnectionKind, key: string) =>
  kind === 'drm' ? `/media/drm/providers/${key}` : `/media/storage/backends/${key}`;

/** Connect & verify (or replace credentials). Field errors are shown inline. */
export function useConnect(kind: ConnectionKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, credentials }: CredentialsInput & { key: string }) =>
      api.put<Resource<Connection>>(connectionPath(kind, key), { credentials }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: kind === 'drm' ? mediaKeys.drm() : mediaKeys.storage() });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
    meta: { errorToast: false },
  });
}

export function useDisconnect(kind: ConnectionKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.delete<Resource<Connection>>(connectionPath(kind, key)).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: kind === 'drm' ? mediaKeys.drm() : mediaKeys.storage() });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
