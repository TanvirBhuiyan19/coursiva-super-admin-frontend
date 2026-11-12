import { keepPreviousData, type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type {
  AiSettingsInput,
  AiTenantUsage,
  AiUsage,
  Experiments,
  Growth,
  Health,
  HealthScore,
  JobQueue,
  LiveUsage,
  Usage,
} from './types';

export const analyticsKeys = {
  all: ['analytics'] as const,
  growth: ['analytics', 'growth'] as const,
  healthScores: (page: number) => ['analytics', 'growth', 'health-scores', page] as const,
  usage: ['analytics', 'usage'] as const,
  live: (period: string) => ['analytics', 'live', period || 'current'] as const,
  health: ['analytics', 'health'] as const,
  ai: ['analytics', 'ai'] as const,
  aiTenants: (page: number) => ['analytics', 'ai', 'tenants', page] as const,
  experiments: ['analytics', 'experiments'] as const,
};

const get = <T>(path: string, signal: AbortSignal) => api.get<Resource<T>>(path, { signal }).then((r) => r.data);

export const analyticsQueries = {
  growth: () => queryOptions({ queryKey: analyticsKeys.growth, queryFn: ({ signal }) => get<Growth>('/analytics/growth', signal) }),
};

export const useGrowth = () => useQuery(analyticsQueries.growth());
/** Rows per page of the full lists behind the growth and AI screens' top-10 cards. */
export const FULL_LIST_PER_PAGE = 25;

/** One page of every school's health score, best first (the growth screen's "View all"). */
export const useHealthScores = (page: number, enabled = true) =>
  useQuery<Paginated<HealthScore>>({
    queryKey: analyticsKeys.healthScores(page),
    queryFn: ({ signal }) =>
      api.get<Paginated<HealthScore>>('/analytics/growth/health-scores', { query: { page, perPage: FULL_LIST_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });

/** One page of every tenant with AI usage this month, heaviest first (the AI screen's "View all"). */
export const useAiTenants = (page: number, enabled = true) =>
  useQuery<Paginated<AiTenantUsage>>({
    queryKey: analyticsKeys.aiTenants(page),
    queryFn: ({ signal }) =>
      api.get<Paginated<AiTenantUsage>>('/analytics/ai/tenants', { query: { page, perPage: FULL_LIST_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useUsage = () => useQuery({ queryKey: analyticsKeys.usage, queryFn: ({ signal }) => get<Usage>('/analytics/usage', signal) });
/** Live usage for a month (`YYYY-MM`; empty = this month). */
export const useLiveUsage = (period: string) =>
  useQuery({
    ...queryOptions({
      queryKey: analyticsKeys.live(period),
      queryFn: ({ signal }) => get<LiveUsage>(period ? `/analytics/live?period=${encodeURIComponent(period)}` : '/analytics/live', signal),
    }),
    placeholderData: keepPreviousData,
  });
export const useHealth = () =>
  useQuery({ queryKey: analyticsKeys.health, queryFn: ({ signal }) => get<Health>('/analytics/health', signal) });
export const useAiUsage = () => useQuery({ queryKey: analyticsKeys.ai, queryFn: ({ signal }) => get<AiUsage>('/analytics/ai', signal) });
export const useExperiments = () =>
  useQuery({ queryKey: analyticsKeys.experiments, queryFn: ({ signal }) => get<Experiments>('/analytics/experiments', signal) });

const invalidateAudit = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: ['audit'] });

// ---------- Health ----------
export function useRetryQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (queue: string) =>
      api
        .post<Resource<{ requeued: number; queue: JobQueue }>>(`/analytics/health/queues/${encodeURIComponent(queue)}/retry`)
        .then((r) => r.data),
    onSuccess: ({ queue }) => {
      qc.setQueryData<Health>(analyticsKeys.health, (prev) =>
        prev ? { ...prev, queues: prev.queues.map((q) => (q.name === queue.name ? queue : q)) } : prev,
      );
      void qc.invalidateQueries({ queryKey: analyticsKeys.health });
      invalidateAudit(qc);
    },
  });
}

// ---------- AI ----------
export function useUpdateAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AiSettingsInput) => api.put<Resource<AiUsage>>('/analytics/ai/settings', input).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(analyticsKeys.ai, data);
      invalidateAudit(qc);
    },
  });
}

/** Throttle / unthrottle a tenant. Optimistic, rolled back on failure. */
export function useSetAiThrottle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tenantId, throttled }: { tenantId: string; throttled: boolean }) => {
      const path = `/analytics/ai/tenants/${encodeURIComponent(tenantId)}/throttle`;
      return (throttled ? api.post<Resource<AiUsage>>(path) : api.delete<Resource<AiUsage>>(path)).then((r) => r.data);
    },
    onMutate: async ({ tenantId, throttled }) => {
      await qc.cancelQueries({ queryKey: analyticsKeys.ai });
      const prev = qc.getQueryData<AiUsage>(analyticsKeys.ai);
      const pages = qc.getQueriesData<Paginated<AiTenantUsage>>({ queryKey: [...analyticsKeys.ai, 'tenants'] });
      qc.setQueriesData<Paginated<AiTenantUsage>>({ queryKey: [...analyticsKeys.ai, 'tenants'] }, (old) =>
        old ? { ...old, data: old.data.map((t) => (t.tenantId === tenantId ? { ...t, throttled } : t)) } : old,
      );
      if (prev) {
        const list = prev.tenants.map((t) => (t.tenantId === tenantId ? { ...t, throttled } : t));
        qc.setQueryData<AiUsage>(analyticsKeys.ai, {
          ...prev,
          tenants: list,
          totals: { ...prev.totals, throttled: list.filter((t) => t.throttled).length },
        });
      }
      return { prev, pages };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(analyticsKeys.ai, ctx.prev);
      for (const [k, v] of ctx?.pages ?? []) qc.setQueryData(k, v);
    },
    onSuccess: (data) => {
      qc.setQueryData(analyticsKeys.ai, data);
      void qc.invalidateQueries({ queryKey: [...analyticsKeys.ai, 'tenants'] });
      invalidateAudit(qc);
    },
  });
}

// ---------- Experiments ----------
export function useExperimentAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'promote' | 'stop' }) =>
      api.post<Resource<Experiments>>(`/analytics/experiments/${encodeURIComponent(id)}/${action}`).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(analyticsKeys.experiments, data);
      // Promoting flips the experiment's feature flag to 100%.
      void qc.invalidateQueries({ queryKey: ['flags'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'flags'] });
      invalidateAudit(qc);
    },
  });
}
