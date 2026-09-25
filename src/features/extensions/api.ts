import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { invalidateTenantData } from '@/features/tenants/api';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type { Plan } from '@/lib/domain';
import type { Extension, ExtensionSettings, ExtensionSettingsUpdate, ExtensionSummary, ExtensionUpdate } from './types';

export const extensionKeys = {
  all: ['extensions'] as const,
  list: () => [...extensionKeys.all, 'list'] as const,
  summary: () => [...extensionKeys.all, 'summary'] as const,
  settings: () => [...extensionKeys.all, 'settings'] as const,
};

/** Catalogue changes move MRR and the bundle comparison price. */
function invalidateCatalogue(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: extensionKeys.all });
  void qc.invalidateQueries({ queryKey: ['audit'] });
}

// ---------- Queries ----------
export const useExtensions = () =>
  useQuery({
    queryKey: extensionKeys.list(),
    queryFn: ({ signal }) => api.get<Paginated<Extension>>('/extensions', { query: { perPage: 100 }, signal }).then((r) => r.data),
  });

export const useExtensionSummary = () =>
  useQuery({
    queryKey: extensionKeys.summary(),
    queryFn: ({ signal }) => api.get<Resource<ExtensionSummary>>('/extensions/summary', { signal }).then((r) => r.data),
  });

export const useExtensionSettings = () =>
  useQuery({
    queryKey: extensionKeys.settings(),
    queryFn: ({ signal }) => api.get<Resource<ExtensionSettings>>('/extensions/settings', { signal }).then((r) => r.data),
  });

// ---------- Mutations ----------
/** Optimistically patches one catalogue row, rolling back if the request fails. */
function useOptimisticRow<V extends { key: string }>(
  request: (v: V) => Promise<Extension>,
  apply: (row: Extension, v: V) => Extension,
  alsoInvalidate?: (qc: QueryClient) => void,
) {
  const qc = useQueryClient();
  const key = extensionKeys.list();
  return useMutation({
    mutationFn: request,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Extension[]>(key);
      if (prev)
        qc.setQueryData(
          key,
          prev.map((r) => (r.key === v.key ? apply(r, v) : r)),
        );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (row) => {
      qc.setQueryData<Extension[]>(key, (list) => list?.map((r) => (r.key === row.key ? row : r)));
    },
    onSettled: () => {
      invalidateCatalogue(qc);
      alsoInvalidate?.(qc);
    },
  });
}

export const useUpdateExtension = () =>
  useOptimisticRow<ExtensionUpdate & { key: string }>(
    ({ key, ...patch }) => api.patch<Resource<Extension>>(`/extensions/${key}`, patch).then((r) => r.data),
    (row, { key: _k, ...patch }) => ({
      ...row,
      ...patch,
      ...(patch.hidden !== undefined ? { status: patch.hidden ? 'Hidden' : row.status === 'Hidden' ? 'Live' : row.status } : {}),
    }),
    // Plan entitlements shows each extension's price.
    (qc) => void qc.invalidateQueries({ queryKey: ['entitlements'] }),
  );

/** Sets which plans get an extension free. Drives Plan entitlements and every tenant's extension list. */
export const useSetExtensionPlans = () =>
  useOptimisticRow<{ key: string; plans: Plan[] }>(
    ({ key, plans }) => api.put<Resource<Extension>>(`/extensions/${key}/plans`, { plans }).then((r) => r.data),
    (row, { plans }) => ({ ...row, includedPlans: plans }),
    (qc) => {
      void qc.invalidateQueries({ queryKey: ['entitlements'] });
      invalidateTenantData(qc);
    },
  );

export function useUpdateExtensionSettings() {
  const qc = useQueryClient();
  const key = extensionKeys.settings();
  return useMutation({
    mutationFn: (patch: ExtensionSettingsUpdate) =>
      api.patch<Resource<ExtensionSettings>>('/extensions/settings', patch).then((r) => r.data),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ExtensionSettings>(key);
      if (prev && patch.rules) {
        const next = patch.rules;
        qc.setQueryData<ExtensionSettings>(key, {
          ...prev,
          rules: prev.rules.map((r) => ({ ...r, enabled: next.find((x) => x.key === r.key)?.enabled ?? r.enabled })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (s) => qc.setQueryData(key, s),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['audit'] }),
  });
}
