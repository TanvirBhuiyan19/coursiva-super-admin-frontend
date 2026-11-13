import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, PaginationMeta, Resource } from '@/lib/api/types';
import type { Plan, Region } from '@/lib/domain';
import { invalidateTenantData, useUpdateTenant } from '@/features/tenants/api';
import type { TenantDetail } from '@/features/tenants/types';
import type {
  AbuseActionResult,
  AbuseSignal,
  BlockedIp,
  ComplianceSummary,
  Dsar,
  DsarStatus,
  ModerationDecision,
  ModerationReport,
  ModerationSummary,
  PolicyAcceptance,
  PolicyAcceptanceMeta,
  PolicyDocument,
  PolicyDraftInput,
  PolicyOverview,
  RateLimit,
  RegionSummary,
  ReportListMeta,
  ReportListParams,
  RetentionPeriod,
  RetentionSetting,
  SubProcessor,
  TenantResidency,
  TenantStrikes,
} from './types';

const root = ['governance'] as const;
export const governanceKeys = {
  all: root,
  compliance: [...root, 'compliance'] as const,
  dsars: (status?: DsarStatus) => [...root, 'compliance', 'dsars', status ?? 'all'] as const,
  retention: [...root, 'compliance', 'retention'] as const,
  subProcessors: [...root, 'sub-processors'] as const,
  moderation: [...root, 'moderation'] as const,
  reports: (params: ReportListParams) => [...root, 'moderation', 'reports', params] as const,
  strikes: [...root, 'moderation', 'strikes'] as const,
  strikesPage: (page: number) => [...governanceKeys.strikes, page] as const,
  policies: [...root, 'policies'] as const,
  acceptance: (documentId: string) => [...root, 'policies', 'acceptance', documentId] as const,
  acceptancePage: (documentId: string, params: AcceptanceParams) => [...governanceKeys.acceptance(documentId), params] as const,
  regions: [...root, 'regions'] as const,
  regionTenants: (params: RegionTenantParams) => [...governanceKeys.regions, 'tenants', params] as const,
  abuse: [...root, 'abuse'] as const,
  signals: [...root, 'abuse', 'signals'] as const,
  signalsPage: (page: number) => [...governanceKeys.signals, page] as const,
  rateLimits: [...root, 'abuse', 'rate-limits'] as const,
  blockedIps: [...root, 'abuse', 'blocked-ips'] as const,
  blockedIpsPage: (params: BlockedIpParams) => [...governanceKeys.blockedIps, params] as const,
};

/** Page size of the governance work lists (acceptance, residency, signals, blocked IPs, strikes). */
export const GOVERNANCE_PER_PAGE = 25;

export interface AcceptanceParams {
  page: number;
  search?: string;
}
export interface RegionTenantParams {
  page: number;
  search?: string;
  region?: Region;
}
export interface BlockedIpParams {
  page: number;
  search?: string;
}
export type AcceptancePage = Paginated<PolicyAcceptance> & { meta: PaginationMeta & PolicyAcceptanceMeta };

const audit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['audit'] });
const get = <T>(path: string, signal: AbortSignal, query?: Record<string, string | number | undefined>) =>
  api.get<Resource<T>>(path, { signal, ...(query ? { query } : {}) }).then((r) => r.data);

// ---------- Compliance & privacy ----------
export const useComplianceSummary = () =>
  useQuery({ queryKey: governanceKeys.compliance, queryFn: ({ signal }) => get<ComplianceSummary>('/governance/compliance', signal) });

/** One page of DSARs (25 a page) — the list pages instead of silently stopping at 100. */
export const useDsars = (status?: DsarStatus, page = 1) =>
  useQuery<Paginated<Dsar>>({
    queryKey: [...governanceKeys.dsars(status), page],
    queryFn: ({ signal }) => api.get<Paginated<Dsar>>('/governance/dsars', { query: { status, page, perPage: 25 }, signal }),
    placeholderData: keepPreviousData,
  });

/** Fulfils a DSAR; for a Deletion request this erases the subject's data. */
export function useFulfilDsar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Resource<Dsar>>(`/governance/dsars/${id}/fulfil`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: governanceKeys.compliance });
      // The overview action queue counts privacy requests due soon.
      void qc.invalidateQueries({ queryKey: ['overview'] });
      audit(qc);
    },
  });
}

export const useRetention = () =>
  useQuery({ queryKey: governanceKeys.retention, queryFn: ({ signal }) => get<RetentionSetting[]>('/governance/retention', signal) });

export function useSetRetention() {
  const qc = useQueryClient();
  const key = governanceKeys.retention;
  return useMutation({
    mutationFn: ({ key: dataClass, period }: { key: string; period: RetentionPeriod }) =>
      api.put<Resource<RetentionSetting>>(`/governance/retention/${dataClass}`, { period }).then((r) => r.data),
    onMutate: async ({ key: dataClass, period }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RetentionSetting[]>(key);
      if (prev)
        qc.setQueryData(
          key,
          prev.map((s) => (s.key === dataClass ? { ...s, period } : s)),
        );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      audit(qc);
    },
  });
}

/** One list, used by Compliance and Data residency. */
export const useSubProcessors = () =>
  useQuery({ queryKey: governanceKeys.subProcessors, queryFn: ({ signal }) => get<SubProcessor[]>('/governance/sub-processors', signal) });

// ---------- Trust & moderation ----------
export const useModerationSummary = () =>
  useQuery({ queryKey: governanceKeys.moderation, queryFn: ({ signal }) => get<ModerationSummary>('/governance/moderation', signal) });

export type ReportPage = Paginated<ModerationReport> & { meta: PaginationMeta & ReportListMeta };

export const useReports = (params: ReportListParams) =>
  useQuery<ReportPage>({
    queryKey: governanceKeys.reports(params),
    queryFn: ({ signal }) => api.get<ReportPage>('/governance/reports', { query: { perPage: 50, ...params }, signal }),
    placeholderData: keepPreviousData,
  });

/** One page of schools with strikes, most first. */
export const useStrikes = (page = 1) =>
  useQuery<Paginated<TenantStrikes>>({
    queryKey: governanceKeys.strikesPage(page),
    queryFn: ({ signal }) =>
      api.get<Paginated<TenantStrikes>>('/governance/moderation/strikes', { query: { page, perPage: GOVERNANCE_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
  });

export function useDecideReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: ModerationDecision }) =>
      api.post<Resource<ModerationReport>>(`/governance/reports/${id}/decision`, { decision }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: governanceKeys.moderation });
      audit(qc);
    },
  });
}

// ---------- Policies & terms ----------
export const usePolicies = () =>
  useQuery({ queryKey: governanceKeys.policies, queryFn: ({ signal }) => get<PolicyOverview>('/governance/policies', signal) });

/** One page of the live document's acceptance (pending first); `meta.accepted`/`meta.pending` count every school. */
export const usePolicyAcceptance = (documentId: string | undefined, params: AcceptanceParams) =>
  useQuery<AcceptancePage>({
    queryKey: governanceKeys.acceptancePage(documentId ?? '', params),
    queryFn: ({ signal }) =>
      api.get<AcceptancePage>(`/governance/policies/${documentId ?? ''}/acceptance`, {
        query: { page: params.page, perPage: GOVERNANCE_PER_PAGE, search: params.search || undefined },
        signal,
      }),
    enabled: !!documentId,
    placeholderData: keepPreviousData,
  });

export function useDraftPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PolicyDraftInput) => api.post<Resource<PolicyDocument>>('/governance/policies', input).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: governanceKeys.policies });
      audit(qc);
    },
    meta: { errorToast: false },
  });
}

export function usePublishPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Resource<PolicyDocument>>(`/governance/policies/${id}/publish`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: governanceKeys.policies });
      // The live DPA's acceptance feeds "DPAs signed" on Compliance.
      void qc.invalidateQueries({ queryKey: governanceKeys.compliance });
      audit(qc);
    },
  });
}

export function useRemindTenant(documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) =>
      api.post<Resource<PolicyAcceptance>>(`/governance/policies/${documentId}/reminders`, { tenantId }).then((r) => r.data),
    onSuccess: (row) => {
      qc.setQueriesData<AcceptancePage>({ queryKey: governanceKeys.acceptance(documentId) }, (old) =>
        old ? { ...old, data: old.data.map((r) => (r.tenantId === row.tenantId ? row : r)) } : old,
      );
      audit(qc);
    },
  });
}

// ---------- Data residency ----------
export const useRegions = () =>
  useQuery({ queryKey: governanceKeys.regions, queryFn: ({ signal }) => get<RegionSummary>('/governance/regions', signal) });

/** One page of the schools' data regions, by name (search by name, filter by region). */
export const useRegionTenants = (params: RegionTenantParams) =>
  useQuery<Paginated<TenantResidency>>({
    queryKey: governanceKeys.regionTenants(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<TenantResidency>>('/governance/regions/tenants', {
        query: { page: params.page, perPage: GOVERNANCE_PER_PAGE, search: params.search || undefined, region: params.region },
        signal,
      }),
    placeholderData: keepPreviousData,
  });

/**
 * Moves a tenant's data region. The region is the tenant's own field, so this reuses
 * PATCH /tenants/:id (tenants.manage) and refreshes the residency summary afterwards.
 */
export function useMoveTenantRegion(tenantId: string) {
  const qc = useQueryClient();
  const update = useUpdateTenant(tenantId);
  return {
    isPending: update.isPending,
    pendingRegion: update.isPending ? update.variables.region : undefined,
    move: (region: Region, onSuccess?: (t: TenantDetail) => void) =>
      update.mutate(
        { region },
        {
          onSuccess: (t) => {
            void qc.invalidateQueries({ queryKey: governanceKeys.regions });
            onSuccess?.(t);
          },
        },
      ),
  };
}

// ---------- Abuse & limits ----------
/** One page of the open abuse signals, by severity then newest. */
export const useAbuseSignals = (page = 1) =>
  useQuery<Paginated<AbuseSignal>>({
    queryKey: governanceKeys.signalsPage(page),
    queryFn: ({ signal }) =>
      api.get<Paginated<AbuseSignal>>('/governance/abuse-signals', { query: { page, perPage: GOVERNANCE_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
  });

export function useResolveSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, how }: { id: string; how: 'action' | 'dismiss' }) =>
      how === 'action'
        ? api.post<Resource<AbuseActionResult>>(`/governance/abuse-signals/${id}/action`).then((r) => r.data)
        : api.post(`/governance/abuse-signals/${id}/dismiss`).then(() => null),
    onSuccess: (res, { id }) => {
      qc.setQueriesData<Paginated<AbuseSignal>>({ queryKey: governanceKeys.signals }, (old) =>
        old ? { ...old, data: old.data.filter((s) => s.id !== id) } : old,
      );
      void qc.invalidateQueries({ queryKey: governanceKeys.signals });
      // "Raise limit" changes the tenant's API limit override.
      if (res) invalidateTenantData(qc);
      else audit(qc);
    },
  });
}

export const useRateLimits = () =>
  useQuery({ queryKey: governanceKeys.rateLimits, queryFn: ({ signal }) => get<RateLimit[]>('/governance/rate-limits', signal) });

export function useSetRateLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limits: { plan: Plan; perMinute: number }[]) =>
      api.put<Resource<RateLimit[]>>('/governance/rate-limits', { limits }).then((r) => r.data),
    onSuccess: (rows) => {
      qc.setQueryData(governanceKeys.rateLimits, rows);
      audit(qc);
    },
    meta: { errorToast: false },
  });
}

/** One page of blocked addresses, newest first (search matches the address or range). */
export const useBlockedIps = (params: BlockedIpParams) =>
  useQuery<Paginated<BlockedIp>>({
    queryKey: governanceKeys.blockedIpsPage(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<BlockedIp>>('/governance/blocked-ips', {
        query: { page: params.page, perPage: GOVERNANCE_PER_PAGE, search: params.search || undefined },
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export function useBlockIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ip: string; reason?: string }) =>
      api.post<Resource<BlockedIp>>('/governance/blocked-ips', body).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: governanceKeys.blockedIps });
      audit(qc);
    },
    meta: { errorToast: false },
  });
}

export function useUnblockIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/governance/blocked-ips/${id}`),
    onSuccess: (_r, id) => {
      qc.setQueriesData<Paginated<BlockedIp>>({ queryKey: governanceKeys.blockedIps }, (old) =>
        old ? { ...old, data: old.data.filter((b) => b.id !== id) } : old,
      );
      void qc.invalidateQueries({ queryKey: governanceKeys.blockedIps });
      audit(qc);
    },
  });
}
