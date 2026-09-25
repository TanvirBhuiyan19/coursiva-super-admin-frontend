import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import type { IntegrationSettings, PlatformSettings, PlatformSettingsUpdate, TaxSettings, TaxSettingsUpdate } from './types';

export const settingsKeys = {
  all: ['settings'] as const,
  platform: () => [...settingsKeys.all, 'platform'] as const,
  integrations: () => [...settingsKeys.all, 'integrations'] as const,
  tax: () => [...settingsKeys.all, 'tax'] as const,
};

const invalidateAudit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['audit'] });

// ---------- Platform settings ----------
export const usePlatformSettings = () =>
  useQuery({
    queryKey: settingsKeys.platform(),
    queryFn: ({ signal }) => api.get<Resource<PlatformSettings>>('/settings', { signal }).then((r) => r.data),
  });

export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PlatformSettingsUpdate) => api.patch<Resource<PlatformSettings>>('/settings', patch).then((r) => r.data),
    onSuccess: (next) => {
      qc.setQueryData(settingsKeys.platform(), next);
      invalidateAudit(qc);
      // The staff screen warns about accounts without 2FA based on the platform requirement.
      void qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: { errorToast: false },
  });
}

// ---------- Integration marketplace ----------
export const useIntegrationSettings = () =>
  useQuery({
    queryKey: settingsKeys.integrations(),
    queryFn: ({ signal }) => api.get<Resource<IntegrationSettings>>('/settings/integrations', { signal }).then((r) => r.data),
  });

/** Optimistically patches the cached integration settings, rolling back on failure. */
function useOptimisticIntegrations<V>(
  request: (v: V) => Promise<Resource<IntegrationSettings>>,
  apply: (d: IntegrationSettings, v: V) => IntegrationSettings,
) {
  const qc = useQueryClient();
  const key = settingsKeys.integrations();
  return useMutation({
    mutationFn: (v: V) => request(v).then((r) => r.data),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<IntegrationSettings>(key);
      if (prev) qc.setQueryData(key, apply(prev, v));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (next) => {
      qc.setQueryData(key, next);
      invalidateAudit(qc);
    },
  });
}

export const useSetIntegrationPolicy = () =>
  useOptimisticIntegrations<{ key: string; enabled: boolean }>(
    ({ key, enabled }) => api.put(`/settings/integrations/policies/${key}`, { enabled }),
    (d, { key, enabled }) => ({ ...d, policies: d.policies.map((p) => (p.key === key ? { ...p, enabled } : p)) }),
  );

export const useAddToRoadmap = () =>
  useOptimisticIntegrations<string>(
    (id) => api.post(`/settings/integrations/requests/${id}/roadmap`),
    (d, id) => ({ ...d, requests: d.requests.map((r) => (r.id === id ? { ...r, onRoadmap: true } : r)) }),
  );

// ---------- Tax & invoicing ----------
export const useTaxSettings = () =>
  useQuery({
    queryKey: settingsKeys.tax(),
    queryFn: ({ signal }) => api.get<Resource<TaxSettings>>('/settings/tax', { signal }).then((r) => r.data),
  });

/** Toggles (Stripe Tax, tax-inclusive) apply optimistically; numbering errors show inline (errorToast off). */
export function useUpdateTaxSettings() {
  const qc = useQueryClient();
  const key = settingsKeys.tax();
  return useMutation({
    mutationFn: (patch: TaxSettingsUpdate) => api.patch<Resource<TaxSettings>>('/settings/tax', patch).then((r) => r.data),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TaxSettings>(key);
      if (prev && (patch.stripeTax !== undefined || patch.taxInclusive !== undefined)) qc.setQueryData(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (next) => {
      qc.setQueryData(key, next);
      invalidateAudit(qc);
    },
    meta: { errorToast: false },
  });
}

export function useRemoveTaxRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/settings/tax/regions/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.tax() });
      invalidateAudit(qc);
    },
  });
}
