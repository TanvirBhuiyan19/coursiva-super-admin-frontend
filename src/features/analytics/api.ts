import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import type { AiSettingsInput, AiUsage, Experiments, Growth, Health, JobQueue, Usage } from './types';

export const analyticsKeys = {
  all: ['analytics'] as const,
  growth: ['analytics', 'growth'] as const,
  usage: ['analytics', 'usage'] as const,
  health: ['analytics', 'health'] as const,
  ai: ['analytics', 'ai'] as const,
  experiments: ['analytics', 'experiments'] as const,
};

const get = <T>(path: string, signal: AbortSignal) => api.get<Resource<T>>(path, { signal }).then((r) => r.data);

export const analyticsQueries = {
  growth: () => queryOptions({ queryKey: analyticsKeys.growth, queryFn: ({ signal }) => get<Growth>('/analytics/growth', signal) }),
};

export const useGrowth = () => useQuery(analyticsQueries.growth());
export const useUsage = () => useQuery({ queryKey: analyticsKeys.usage, queryFn: ({ signal }) => get<Usage>('/analytics/usage', signal) });
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
      if (prev) {
        const list = prev.tenants.map((t) => (t.tenantId === tenantId ? { ...t, throttled } : t));
        qc.setQueryData<AiUsage>(analyticsKeys.ai, {
          ...prev,
          tenants: list,
          totals: { ...prev.totals, throttled: list.filter((t) => t.throttled).length },
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(analyticsKeys.ai, ctx.prev);
    },
    onSuccess: (data) => {
      qc.setQueryData(analyticsKeys.ai, data);
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
