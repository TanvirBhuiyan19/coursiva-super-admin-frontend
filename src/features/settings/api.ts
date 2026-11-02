import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { authKeys } from '@/features/auth/api';
import type { Branding } from '@/features/auth/types';
import { api } from '@/lib/api/client';
import { toCamel } from '@/lib/api/case';
import type { Resource } from '@/lib/api/types';
import type {
  BrandAsset,
  BrandAssetSlot,
  EmailTestResult,
  IntegrationSettings,
  PlatformSettings,
  PlatformSettingsUpdate,
  SettingKey,
  SettingsMeta,
  SettingsMetaWire,
  SettingsSection,
  TaxSettings,
  TaxSettingsUpdate,
} from './types';

export const settingsKeys = {
  all: ['settings'] as const,
  platform: () => [...settingsKeys.all, 'platform'] as const,
  meta: () => [...settingsKeys.all, 'meta'] as const,
  integrations: () => [...settingsKeys.all, 'integrations'] as const,
  tax: () => [...settingsKeys.all, 'tax'] as const,
};

const invalidateAudit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['audit'] });

/**
 * Updates the cached public branding (sidebar logo, tab icon) from a settings response. Written directly instead of
 * refetched: `GET /platform/branding` is HTTP-cached for 5 minutes, so a refetch could return the old images.
 */
function patchBranding(qc: QueryClient, next: Pick<PlatformSettings, 'brandAssets'> & Partial<Pick<PlatformSettings, 'platformName'>>) {
  const url = (slot: BrandAssetSlot) => next.brandAssets.find((a) => a.slot === slot)?.url ?? null;
  qc.setQueryData<Branding>(authKeys.branding, (prev) =>
    prev
      ? {
          name: next.platformName ?? prev.name,
          logoUrl: url('logo'),
          logoDarkUrl: url('logo_dark'),
          faviconUrl: url('favicon'),
        }
      : prev,
  );
}

// ---------- Platform settings ----------
/** `enabled: false` for viewers without `platform.view` (the API would answer 403). */
export const usePlatformSettings = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    enabled,
    queryKey: settingsKeys.platform(),
    queryFn: ({ signal }) => api.get<Resource<PlatformSettings>>('/settings', { signal }).then((r) => r.data),
  });

export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PlatformSettingsUpdate) => api.patch<Resource<PlatformSettings>>('/settings', patch).then((r) => r.data),
    onSuccess: (next) => onSettingsChanged(qc, next),
    meta: { errorToast: false },
  });
}

/** Everything a platform-settings change can affect elsewhere in the console. */
function onSettingsChanged(qc: QueryClient, next: PlatformSettings) {
  qc.setQueryData(settingsKeys.platform(), next);
  patchBranding(qc, next);
  invalidateAudit(qc);
  // The staff screen warns about accounts without 2FA based on the platform requirement; /auth/me carries the idle lock;
  // billing shows the trial length and dunning rules.
  void qc.invalidateQueries({ queryKey: ['staff'] });
  void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
  void qc.invalidateQueries({ queryKey: ['billing'] });
}

/** Shipped defaults and "where these values are read" — static per deploy. */
export const useSettingsMeta = () =>
  useQuery({
    queryKey: settingsKeys.meta(),
    queryFn: ({ signal }) =>
      api
        .get<Resource<SettingsMetaWire>>('/settings/meta', { signal })
        .then((r): SettingsMeta => ({ fields: r.data.fields.map((f) => ({ ...f, key: toCamel(f.key) as SettingKey })) })),
    staleTime: Infinity,
  });

export function useResetSettingsSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (section: SettingsSection) =>
      api.post<Resource<PlatformSettings>>(`/settings/sections/${section}/reset`).then((r) => r.data),
    onSuccess: (next) => onSettingsChanged(qc, next),
  });
}

/** Brand assets live on the settings resource; uploads replace the cached list. Errors show inline. */
function useBrandAssetMutation<V>(request: (v: V) => Promise<Resource<BrandAsset[]>>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => request(v).then((r) => r.data),
    onSuccess: (brandAssets) => {
      qc.setQueryData<PlatformSettings>(settingsKeys.platform(), (prev) => (prev ? { ...prev, brandAssets } : prev));
      patchBranding(qc, { brandAssets });
      invalidateAudit(qc);
    },
    meta: { errorToast: false },
  });
}

export const useUploadBrandAsset = () =>
  useBrandAssetMutation<{ slot: BrandAssetSlot; file: File }>(({ slot, file }) => {
    const body = new FormData();
    body.append('file', file);
    return api.post(`/settings/brand-assets/${slot}`, body);
  });

export const useRemoveBrandAsset = () => useBrandAssetMutation<BrandAssetSlot>((slot) => api.delete(`/settings/brand-assets/${slot}`));

export function useSendTestEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Resource<EmailTestResult>>('/settings/email/test').then((r) => r.data),
    onSuccess: () => invalidateAudit(qc),
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
