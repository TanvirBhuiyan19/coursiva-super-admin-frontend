import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, PaginationMeta, Resource } from '@/lib/api/types';
import type { Plan, Region } from '@/lib/domain';
import { invalidateTenantData, useUpdateTenant } from '@/features/tenants/api';
import type { TenantDetail } from '@/features/tenants/types';
import type {
  AbuseSignal,
  BlockedIp,
  ComplianceSummary,
  Dsar,
  DsarStatus,
  ModerationDecision,
  ModerationReport,
  ModerationSummary,
  PolicyAcceptance,
  PolicyDocument,
  PolicyOverview,
  RateLimit,
  RegionSummary,
  ReportListMeta,
  ReportListParams,
  RetentionPeriod,
  RetentionSetting,
  SubProcessor,
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
  policies: [...root, 'policies'] as const,
  acceptance: (documentId: string) => [...root, 'policies', 'acceptance', documentId] as const,
  regions: [...root, 'regions'] as const,
  abuse: [...root, 'abuse'] as const,
  signals: [...root, 'abuse', 'signals'] as const,
  rateLimits: [...root, 'abuse', 'rate-limits'] as const,
  blockedIps: [...root, 'abuse', 'blocked-ips'] as const,
};

const audit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['audit'] });
const get = <T>(path: string, signal: AbortSignal, query?: Record<string, string | number | undefined>) =>
  api.get<Resource<T>>(path, { signal, ...(query ? { query } : {}) }).then((r) => r.data);

// ---------- Compliance & privacy ----------
export const useComplianceSummary = () =>
  useQuery({ queryKey: governanceKeys.compliance, queryFn: ({ signal }) => get<ComplianceSummary>('/governance/compliance', signal) });

export const useDsars = (status?: DsarStatus) =>
  useQuery<Paginated<Dsar>>({
    queryKey: governanceKeys.dsars(status),
    queryFn: ({ signal }) => api.get<Paginated<Dsar>>('/governance/dsars', { query: { status, perPage: 100 }, signal }),
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

export const useStrikes = () =>
  useQuery({ queryKey: governanceKeys.strikes, queryFn: ({ signal }) => get<TenantStrikes[]>('/governance/moderation/strikes', signal) });

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

export const usePolicyAcceptance = (documentId: string | undefined) =>
  useQuery({
    queryKey: governanceKeys.acceptance(documentId ?? ''),
    queryFn: ({ signal }) => get<PolicyAcceptance[]>(`/governance/policies/${documentId ?? ''}/acceptance`, signal),
    enabled: !!documentId,
  });

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
      qc.setQueryData<PolicyAcceptance[]>(governanceKeys.acceptance(documentId), (rows) =>
        rows?.map((r) => (r.tenantId === row.tenantId ? row : r)),
      );
      audit(qc);
    },
  });
}

// ---------- Data residency ----------
export const useRegions = () =>
  useQuery({ queryKey: governanceKeys.regions, queryFn: ({ signal }) => get<RegionSummary>('/governance/regions', signal) });

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
export const useAbuseSignals = () =>
  useQuery({ queryKey: governanceKeys.signals, queryFn: ({ signal }) => get<AbuseSignal[]>('/governance/abuse-signals', signal) });

export function useResolveSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, how }: { id: string; how: 'action' | 'dismiss' }) =>
      how === 'action'
        ? api.post<Resource<{ signalId: string; outcome: string }>>(`/governance/abuse-signals/${id}/action`).then((r) => r.data)
        : api.post(`/governance/abuse-signals/${id}/dismiss`).then(() => null),
    onSuccess: (res, { id }) => {
      qc.setQueryData<AbuseSignal[]>(governanceKeys.signals, (rows) => rows?.filter((s) => s.id !== id));
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

export const useBlockedIps = () =>
  useQuery({ queryKey: governanceKeys.blockedIps, queryFn: ({ signal }) => get<BlockedIp[]>('/governance/blocked-ips', signal) });

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
      qc.setQueryData<BlockedIp[]>(governanceKeys.blockedIps, (rows) => rows?.filter((b) => b.id !== id));
      void qc.invalidateQueries({ queryKey: governanceKeys.blockedIps });
      audit(qc);
    },
  });
}
