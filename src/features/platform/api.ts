import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { shellKeys } from '@/features/shell/api';
import { tenantKeys } from '@/features/tenants/api';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type {
  ApiKey,
  ApiKeyInput,
  Certificate,
  CertificateParams,
  CertificateSummary,
  CreatedApiKey,
  Deliverability,
  FeatureFlag,
  FlagUpdate,
  PostIncidentInput,
  RegistryPolicy,
  ReprocessResult,
  RetryResult,
  SenderDomain,
  Standards,
  SystemStatus,
  Webhooks,
} from './types';

export const platformKeys = {
  all: ['platform'] as const,
  flags: () => [...platformKeys.all, 'flags'] as const,
  system: () => [...platformKeys.all, 'system'] as const,
  deliverability: () => [...platformKeys.all, 'deliverability'] as const,
  certificates: () => [...platformKeys.all, 'certificates'] as const,
  certificateList: (params: CertificateParams) => [...platformKeys.certificates(), 'list', params] as const,
  certificateSummary: () => [...platformKeys.certificates(), 'summary'] as const,
  policies: () => [...platformKeys.all, 'certificate-policies'] as const,
  standards: () => [...platformKeys.all, 'standards'] as const,
  apiKeys: () => [...platformKeys.all, 'api-keys'] as const,
  webhooks: () => [...platformKeys.all, 'webhooks'] as const,
};

const invalidateAudit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['audit'] });

// ---------- Queries ----------
const get =
  <T>(path: string) =>
  ({ signal }: { signal: AbortSignal }) =>
    api.get<Resource<T>>(path, { signal }).then((r) => r.data);

export const useFeatureFlags = () => useQuery({ queryKey: platformKeys.flags(), queryFn: get<FeatureFlag[]>('/platform/flags') });
export const useSystemStatus = () => useQuery({ queryKey: platformKeys.system(), queryFn: get<SystemStatus>('/platform/system') });
export const useDeliverability = () =>
  useQuery({ queryKey: platformKeys.deliverability(), queryFn: get<Deliverability>('/platform/deliverability') });
export const useCertificateSummary = () =>
  useQuery({ queryKey: platformKeys.certificateSummary(), queryFn: get<CertificateSummary>('/platform/certificates/summary') });
export const useCertificates = (params: CertificateParams) =>
  useQuery<Paginated<Certificate>>({
    queryKey: platformKeys.certificateList(params),
    queryFn: ({ signal }) => api.get<Paginated<Certificate>>('/platform/certificates', { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });
export const useRegistryPolicies = () =>
  useQuery({ queryKey: platformKeys.policies(), queryFn: get<RegistryPolicy[]>('/platform/certificate-policies') });
export const useStandards = () => useQuery({ queryKey: platformKeys.standards(), queryFn: get<Standards>('/platform/standards') });
export const useApiKeys = () =>
  useQuery({
    queryKey: platformKeys.apiKeys(),
    queryFn: ({ signal }) => api.get<Paginated<ApiKey>>('/platform/api-keys', { query: { perPage: 100 }, signal }).then((r) => r.data),
  });
export const useWebhooks = () => useQuery({ queryKey: platformKeys.webhooks(), queryFn: get<Webhooks>('/platform/webhooks') });

// ---------- Mutations ----------
/**
 * Optimistic mutation over a cached query: applies `apply` immediately, rolls back on error,
 * then refetches the query and the audit log once the server answers.
 */
function useOptimisticList<TCache, TVars, TResult>({
  key,
  request,
  apply,
  onSuccess,
}: {
  key: QueryKey;
  request: (vars: TVars) => Promise<TResult>;
  apply: (cache: TCache, vars: TVars) => TCache;
  onSuccess?: (qc: QueryClient) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TCache>(key);
      if (prev !== undefined) qc.setQueryData<TCache>(key, apply(prev, vars));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: () => onSuccess?.(qc),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      invalidateAudit(qc);
    },
  });
}

// ---------- Flags & status ----------
export const useUpdateFlag = () =>
  useOptimisticList<FeatureFlag[], { key: string } & FlagUpdate, FeatureFlag>({
    key: platformKeys.flags(),
    request: ({ key, ...patch }) => api.patch<Resource<FeatureFlag>>(`/platform/flags/${key}`, patch).then((r) => r.data),
    apply: (rows, { key, ...patch }) => rows.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    // Tenant details show effective flag values, so they must refetch.
    onSuccess: (qc) => void qc.invalidateQueries({ queryKey: tenantKeys.all }),
  });

function onStatusChange(qc: QueryClient, status: SystemStatus) {
  qc.setQueryData(platformKeys.system(), status);
  void qc.invalidateQueries({ queryKey: shellKeys.status });
  invalidateAudit(qc);
}

export function usePostIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PostIncidentInput) => api.post<Resource<SystemStatus>>('/platform/incident', input).then((r) => r.data),
    onSuccess: (status) => onStatusChange(qc, status),
    meta: { errorToast: false },
  });
}

export function useResolveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<Resource<SystemStatus>>('/platform/incident').then((r) => r.data),
    onSuccess: (status) => onStatusChange(qc, status),
  });
}

// ---------- Deliverability ----------
export const usePauseSending = () =>
  useOptimisticList<Deliverability, { id: string; paused: boolean }, SenderDomain>({
    key: platformKeys.deliverability(),
    request: ({ id, paused }) =>
      api.post<Resource<SenderDomain>>(`/platform/sender-domains/${id}/${paused ? 'pause' : 'resume'}`).then((r) => r.data),
    apply: (d, { id, paused }) => ({ ...d, domains: d.domains.map((x) => (x.id === id ? { ...x, paused } : x)) }),
  });

export function useRecheckDns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Resource<SenderDomain>>(`/platform/sender-domains/${id}/dns-check`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.deliverability() });
      invalidateAudit(qc);
    },
  });
}

// ---------- Certificates ----------
export function useCertificateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'revoke' | 'reinstate' }) =>
      api.post<Resource<Certificate>>(`/platform/certificates/${encodeURIComponent(id)}/${action}`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.certificates() });
      invalidateAudit(qc);
    },
  });
}

export const useSetRegistryPolicy = () =>
  useOptimisticList<RegistryPolicy[], { key: string; enabled: boolean }, RegistryPolicy>({
    key: platformKeys.policies(),
    request: ({ key, enabled }) =>
      api.put<Resource<RegistryPolicy>>(`/platform/certificate-policies/${key}`, { enabled }).then((r) => r.data),
    apply: (rows, { key, enabled }) => rows.map((p) => (p.key === key ? { ...p, enabled } : p)),
  });

// ---------- Standards ----------
export function useReprocessImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Resource<ReprocessResult>>(`/platform/imports/${id}/reprocess`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.standards() });
      invalidateAudit(qc);
    },
  });
}

// ---------- API keys & webhooks ----------
export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    // The response carries the full secret exactly once. It is handed to the caller and never cached.
    mutationFn: (input: ApiKeyInput) => api.post<Resource<CreatedApiKey>>('/platform/api-keys', input).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.apiKeys() });
      invalidateAudit(qc);
    },
    meta: { errorToast: false },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Resource<ApiKey>>(`/platform/api-keys/${id}/revoke`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.apiKeys() });
      invalidateAudit(qc);
    },
  });
}

export function useRetryDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Resource<RetryResult>>(`/platform/webhook-deliveries/${id}/retry`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.webhooks() });
      invalidateAudit(qc);
    },
  });
}
