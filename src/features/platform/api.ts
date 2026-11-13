import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { shellKeys } from '@/features/shell/api';
import { tenantKeys } from '@/features/tenants/api';
import { api } from '@/lib/api/client';
import { live } from '@/lib/queryClient';
import type { Paginated, PaginationMeta, Resource } from '@/lib/api/types';
import type {
  ApiKey,
  Availability,
  AvailabilityUpdate,
  Capability,
  ConnectionInput,
  ConnectionTestResult,
  PlatformConnection,
  ApiKeyInput,
  Certificate,
  CertificateParams,
  CertificateSummary,
  CreatedApiKey,
  Deliverability,
  DedicatedIpRequest,
  FeatureFlag,
  ProvisionInput,
  SendingIp,
  SendingIpInput,
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
  sendingIps: () => [...platformKeys.all, 'sending-ips'] as const,
  dedicatedIps: (page: number) => [...platformKeys.all, 'dedicated-ips', page] as const,
  certificates: () => [...platformKeys.all, 'certificates'] as const,
  certificateList: (params: CertificateParams) => [...platformKeys.certificates(), 'list', params] as const,
  certificateSummary: () => [...platformKeys.certificates(), 'summary'] as const,
  policies: () => [...platformKeys.all, 'certificate-policies'] as const,
  standards: () => [...platformKeys.all, 'standards'] as const,
  apiKeys: () => [...platformKeys.all, 'api-keys'] as const,
  webhooks: () => [...platformKeys.all, 'webhooks'] as const,
  connections: () => [...platformKeys.all, 'connections'] as const,
  availability: () => [...platformKeys.all, 'availability'] as const,
};

const invalidateAudit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['audit'] });

// ---------- Queries ----------
const get =
  <T>(path: string) =>
  ({ signal }: { signal: AbortSignal }) =>
    api.get<Resource<T>>(path, { signal }).then((r) => r.data);

export const useFeatureFlags = () => useQuery({ queryKey: platformKeys.flags(), queryFn: get<FeatureFlag[]>('/platform/flags') });
/**
 * The system status section refreshes itself every minute while it is the section on screen (see `live`). `visible`
 * false (another Flags section is open; the panel stays mounted to keep its state) turns the query off: no polling, no
 * focus refetches. Cached data keeps showing, and switching back refetches it if stale.
 */
export const useSystemStatus = ({ visible = true }: { visible?: boolean } = {}) =>
  useQuery({ queryKey: platformKeys.system(), queryFn: get<SystemStatus>('/platform/system'), ...live, enabled: visible });
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
/** A resource whose list part is one page: `meta` pages it. */
type Paged<T> = Resource<T> & { meta: PaginationMeta };
export const FAILED_PER_PAGE = 25;
/** Standards; `failedImports` is one page (25) of the open failed imports, newest first — `meta` pages it. */
export const useStandards = (page = 1) =>
  useQuery<Paged<Standards>>({
    queryKey: [...platformKeys.standards(), page],
    queryFn: ({ signal }) => api.get<Paged<Standards>>('/platform/standards', { query: { page, perPage: FAILED_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
  });
/** One page of platform API keys (25 a page) — the list pages instead of silently stopping at 100. */
export const useApiKeys = (page = 1) =>
  useQuery<Paginated<ApiKey>>({
    queryKey: [...platformKeys.apiKeys(), page],
    queryFn: ({ signal }) => api.get<Paginated<ApiKey>>('/platform/api-keys', { query: { page, perPage: 25 }, signal }),
    placeholderData: keepPreviousData,
  });
/** Endpoints, and one page (25) of the failed deliveries of the last 24 hours, newest first — `meta` pages them. */
export const useWebhooks = (page = 1) =>
  useQuery<Paged<Webhooks>>({
    queryKey: [...platformKeys.webhooks(), page],
    queryFn: ({ signal }) => api.get<Paged<Webhooks>>('/platform/webhooks', { query: { page, perPage: FAILED_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
  });

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

// ---------- Sender reputation ----------
export const useSendingIps = () => useQuery({ queryKey: platformKeys.sendingIps(), queryFn: get<SendingIp[]>('/platform/sending-ips') });
export const useDedicatedIpRequests = (page = 1) =>
  useQuery<Paginated<DedicatedIpRequest>>({
    queryKey: platformKeys.dedicatedIps(page),
    queryFn: ({ signal }) => api.get<Paginated<DedicatedIpRequest>>('/platform/dedicated-ips', { signal, query: { page, perPage: 20 } }),
    placeholderData: keepPreviousData,
  });

const onReputation = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: platformKeys.sendingIps() });
  void qc.invalidateQueries({ queryKey: [...platformKeys.all, 'dedicated-ips'] });
  void qc.invalidateQueries({ queryKey: platformKeys.deliverability() });
  invalidateAudit(qc);
};

export function useAddSendingIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: SendingIpInput) => api.post<Resource<SendingIp>>('/platform/sending-ips', v).then((r) => r.data),
    onSuccess: () => onReputation(qc),
    meta: { errorToast: false },
  });
}

export function useRemoveSendingIp() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/platform/sending-ips/${id}`), onSuccess: () => onReputation(qc) });
}

/** Provision (sealed token, recent password), decline or release a school's dedicated IP. */
export function useDedicatedIpAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      v:
        | { id: string; action: 'provision'; input: ProvisionInput }
        | { id: string; action: 'reject'; reason: string }
        | { id: string; action: 'release' },
    ) =>
      api
        .post<Resource<DedicatedIpRequest>>(
          `/platform/dedicated-ips/${v.id}/${v.action}`,
          v.action === 'provision' ? v.input : v.action === 'reject' ? { reason: v.reason } : undefined,
        )
        .then((r) => r.data),
    onSuccess: () => onReputation(qc),
    meta: { errorToast: false },
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

// ---------- Connections ----------
/** Every connected service (credentials pasted in the console). */
export const usePlatformConnections = () =>
  useQuery({ queryKey: platformKeys.connections(), queryFn: get<PlatformConnection[]>('/platform/connections') });

/** Connect & verify, or replace credentials. The server verifies with the provider before saving; errors show inline. */
export function useSaveConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, credentials }: ConnectionInput & { key: string }) =>
      api.put<Resource<PlatformConnection>>(`/platform/connections/${key}`, { credentials }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.connections() });
      // A capability is only available while its connections are connected.
      void qc.invalidateQueries({ queryKey: platformKeys.availability() });
      invalidateAudit(qc);
    },
    meta: { errorToast: false },
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.delete<Resource<PlatformConnection>>(`/platform/connections/${key}`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: platformKeys.connections() });
      // A capability is only available while its connections are connected.
      void qc.invalidateQueries({ queryKey: platformKeys.availability() });
      invalidateAudit(qc);
    },
  });
}

/** Re-verifies stored credentials with the provider. */
export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.post<Resource<ConnectionTestResult>>(`/platform/connections/${key}/test`).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: platformKeys.connections() }),
  });
}

// ---------- Feature availability ----------
/** Every capability with its switch, connection state and reach. */
export const useAvailability = () =>
  useQuery({ queryKey: platformKeys.availability(), queryFn: get<Availability>('/platform/availability') });

/**
 * Turns a capability on or off for every school. Turning off needs a recent password (423 → the step-up prompt).
 * The switch moves at once — on this screen and on its connections' cards — and rolls back if the request fails or
 * the prompt is cancelled.
 */
export function useSetAvailability() {
  const qc = useQueryClient();
  const keys = [platformKeys.availability(), platformKeys.connections()];
  return useMutation({
    mutationFn: ({ key, on }: AvailabilityUpdate & { key: string }) =>
      api.put<Resource<Capability>>(`/platform/availability/${key}`, { on }).then((r) => r.data),
    onMutate: async ({ key, on }) => {
      await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));
      const availability = qc.getQueryData<Availability>(platformKeys.availability());
      const connections = qc.getQueryData<PlatformConnection[]>(platformKeys.connections());
      const flip = <T extends { key: string; on: boolean }>(c: T) => (c.key === key ? { ...c, on } : c);
      if (availability)
        qc.setQueryData<Availability>(platformKeys.availability(), { ...availability, capabilities: availability.capabilities.map(flip) });
      if (connections)
        qc.setQueryData<PlatformConnection[]>(
          platformKeys.connections(),
          connections.map((c) => ({ ...c, capabilities: c.capabilities.map(flip) })),
        );
      return { availability, connections };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.availability) qc.setQueryData(platformKeys.availability(), ctx.availability);
      if (ctx?.connections) qc.setQueryData(platformKeys.connections(), ctx.connections);
    },
    onSettled: () => {
      keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
      invalidateAudit(qc);
    },
  });
}
