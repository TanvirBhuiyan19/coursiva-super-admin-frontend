import { keepPreviousData, type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { live } from '@/lib/queryClient';
import type { Paginated, Resource } from '@/lib/api/types';
import type { LimitKey, Plan } from '@/lib/domain';
import type {
  BulkTenantAction,
  ExtendTrialInput,
  Impersonation,
  ImpersonationInput,
  PlanKey,
  ProvisionTenantInput,
  Tenant,
  TenantAction,
  TenantActivity,
  TenantDetail,
  TenantListParams,
  TenantSummary,
  TenantUpdate,
} from './types';

export const tenantKeys = {
  all: ['tenants'] as const,
  lists: () => [...tenantKeys.all, 'list'] as const,
  list: (params: TenantListParams) => [...tenantKeys.lists(), params] as const,
  summary: () => [...tenantKeys.all, 'summary'] as const,
  detail: (id: string) => [...tenantKeys.all, 'detail', id] as const,
  activity: (id: string, page: number) => [...tenantKeys.all, 'detail', id, 'activity', page] as const,
};

/** Everything a tenant change can affect elsewhere in the console. */
export function invalidateTenantData(qc: QueryClient, id?: string) {
  void qc.invalidateQueries({ queryKey: id ? tenantKeys.detail(id) : tenantKeys.all });
  if (id) void qc.invalidateQueries({ queryKey: tenantKeys.lists() });
  if (id) void qc.invalidateQueries({ queryKey: tenantKeys.summary() });
  void qc.invalidateQueries({ queryKey: ['overview'] });
  void qc.invalidateQueries({ queryKey: ['audit'] });
  void qc.invalidateQueries({ queryKey: ['search'] });
}

// ---------- Queries ----------
/** Default directory query (page 1, no filters) — shared by the page and its prefetcher. */
export const TENANT_LIST_DEFAULTS: TenantListParams = { page: 1, perPage: 25 };

/** Query definitions shared by hooks and prefetchers (one source of truth for keys + fetchers). */
export const tenantQueries = {
  list: (params: TenantListParams) =>
    queryOptions({
      queryKey: tenantKeys.list(params),
      queryFn: ({ signal }) => api.get<Paginated<Tenant>>('/tenants', { query: { ...params }, signal }),
    }),
  summary: () =>
    queryOptions({
      queryKey: tenantKeys.summary(),
      queryFn: ({ signal }) => api.get<Resource<TenantSummary>>('/tenants/summary', { signal }).then((r) => r.data),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: tenantKeys.detail(id),
      queryFn: ({ signal }) => api.get<Resource<TenantDetail>>(`/tenants/${id}`, { signal }).then((r) => r.data),
    }),
};

/** `live`: refresh every minute while visible — only for the console home's recent sign-ups. */
export const useTenants = (params: TenantListParams, opts: { live?: boolean } = {}) =>
  useQuery({ ...tenantQueries.list(params), placeholderData: keepPreviousData, ...(opts.live ? live : {}) });

/** Tenant pickers: how many matches a search shows. */
export const TENANT_PICKER_SIZE = 20;

/** Tenant pickers: the schools matching `search`, A–Z, searched server-side (so every school is pickable). */
export const useTenantSearch = (search: string, enabled = true) =>
  useQuery({
    ...tenantQueries.list({ search: search.trim() || undefined, perPage: TENANT_PICKER_SIZE, sort: 'name' }),
    placeholderData: keepPreviousData,
    enabled,
  });

/** Tenant pickers: the saved selection's schools (any page of the directory), by id — at most 100. */
export const useTenantsByIds = (ids: readonly string[]) =>
  useQuery({
    ...tenantQueries.list({ ids: [...ids].sort().slice(0, 100).join(','), perPage: 100, sort: 'name' }),
    enabled: ids.length > 0,
  });

export const useTenantSummary = () => useQuery(tenantQueries.summary());

/** One page of the school's activity, newest first. Keyed under the detail, so every tenant mutation refreshes it. */
export const ACTIVITY_PER_PAGE = 10;
export const useTenantActivity = (id: string, page: number) =>
  useQuery<Paginated<TenantActivity>>({
    queryKey: tenantKeys.activity(id, page),
    queryFn: ({ signal }) =>
      api.get<Paginated<TenantActivity>>(`/tenants/${id}/activity`, { query: { page, perPage: ACTIVITY_PER_PAGE }, signal }),
    placeholderData: keepPreviousData,
  });

export const useTenant = (id: string | undefined) =>
  useQuery({
    ...tenantQueries.detail(id ?? ''),
    enabled: !!id,
  });

// ---------- Mutations ----------
export function useProvisionTenant() {
  const qc = useQueryClient();
  return useMutation({
    // The form works with display names (`Launch`); the wire takes the lowercase plan key.
    mutationFn: (input: Omit<ProvisionTenantInput, 'plan'> & { plan: Plan }) => {
      const body: ProvisionTenantInput = { ...input, plan: input.plan.toLowerCase() as PlanKey };
      return api.post<Resource<Tenant>>('/tenants', body).then((r) => r.data);
    },
    onSuccess: () => invalidateTenantData(qc),
    meta: { errorToast: false },
  });
}

export function useUpdateTenant(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TenantUpdate) => api.patch<Resource<TenantDetail>>(`/tenants/${id}`, patch).then((r) => r.data),
    onSuccess: (detail) => {
      qc.setQueryData(tenantKeys.detail(id), detail);
      invalidateTenantData(qc, id);
    },
  });
}

export function useUpdateTenantLimits(id: string) {
  const qc = useQueryClient();
  return useMutation({
    /** `null` resets a limit to the plan default. */
    mutationFn: (limits: Partial<Record<LimitKey, number | null>>) =>
      api.put<Resource<TenantDetail>>(`/tenants/${id}/limits`, { limits }).then((r) => r.data),
    onSuccess: (detail) => {
      qc.setQueryData(tenantKeys.detail(id), detail);
      invalidateTenantData(qc, id);
    },
    meta: { errorToast: false },
  });
}

/** Optimistically patches the cached detail, rolling back if the request fails. */
function useOptimisticDetail<V>(
  id: string,
  request: (v: V) => Promise<Resource<TenantDetail>>,
  apply: (d: TenantDetail, v: V) => TenantDetail,
) {
  const qc = useQueryClient();
  const key = tenantKeys.detail(id);
  return useMutation({
    mutationFn: (v: V) => request(v).then((r) => r.data),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TenantDetail>(key);
      if (prev) qc.setQueryData(key, apply(prev, v));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (detail) => {
      qc.setQueryData(key, detail);
      invalidateTenantData(qc, id);
    },
  });
}

export const useSetTenantModule = (id: string) =>
  useOptimisticDetail<{ moduleId: string; enabled: boolean | null }>(
    id,
    ({ moduleId, enabled }) => api.put(`/tenants/${id}/modules/${moduleId}`, { enabled }),
    (d, { moduleId, enabled }) => ({
      ...d,
      modules: d.modules.map((m) =>
        m.id === moduleId ? { ...m, enabled: enabled ?? m.planDefault, overridden: enabled != null && enabled !== m.planDefault } : m,
      ),
    }),
  );

export const useResetTenantModules = (id: string) =>
  useOptimisticDetail<undefined>(
    id,
    () => api.delete(`/tenants/${id}/modules`),
    (d) => ({ ...d, modules: d.modules.map((m) => ({ ...m, enabled: m.planDefault, overridden: false })) }),
  );

export const useSetTenantFlag = (id: string) =>
  useOptimisticDetail<{ key: string; enabled: boolean }>(
    id,
    ({ key, enabled }) => api.put(`/tenants/${id}/flags/${key}`, { enabled }),
    (d, { key, enabled }) => ({ ...d, flags: d.flags.map((f) => (f.key === key ? { ...f, enabled, overridden: true } : f)) }),
  );

export const useCompExtension = (id: string) =>
  useOptimisticDetail<{ key: string; comped: boolean }>(
    id,
    ({ key, comped }) => (comped ? api.post(`/tenants/${id}/extensions/${key}/comp`) : api.delete(`/tenants/${id}/extensions/${key}/comp`)),
    (d, { key, comped }) => ({
      ...d,
      extensions: d.extensions.map((x) => (x.key === key ? { ...x, state: comped ? 'comped' : 'none' } : x)),
    }),
  );

export const useWatchTenant = (id: string) =>
  useOptimisticDetail<boolean>(
    id,
    (watch) => (watch ? api.post(`/tenants/${id}/watch`) : api.delete(`/tenants/${id}/watch`)),
    (d, watched) => ({ ...d, watched }),
  );

export function useTenantAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: TenantAction) => api.post<Resource<TenantDetail>>(`/tenants/${id}/${action}`).then((r) => r.data),
    onSuccess: (detail) => {
      qc.setQueryData(tenantKeys.detail(id), detail);
      invalidateTenantData(qc, id);
    },
  });
}

/** `DELETE /governance/tenants/{id}/checkout-freeze`: lifts the abuse queue's "Freeze checkout" (governance.manage). */
export function useUnfreezeCheckout(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<Resource<TenantDetail>>(`/governance/tenants/${id}/checkout-freeze`).then((r) => r.data),
    onSuccess: (detail) => {
      qc.setQueryData(tenantKeys.detail(id), detail);
      invalidateTenantData(qc, id);
    },
  });
}

/** `POST /tenants/{id}/extend-trial` with `{ days }` (1–90). Also reopens a tenant paused for a missing card. */
export function useExtendTrial(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) =>
      api.post<Resource<TenantDetail>>(`/tenants/${id}/extend-trial`, { days } satisfies ExtendTrialInput).then((r) => r.data),
    onSuccess: (detail) => {
      qc.setQueryData(tenantKeys.detail(id), detail);
      invalidateTenantData(qc, id);
    },
    // `days` / `trial` 422s show inline.
    meta: { errorToast: false },
  });
}

export function useTransferOwnership(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.post<Resource<TenantDetail>>(`/tenants/${id}/transfer-ownership`, { email }).then((r) => r.data),
    onSuccess: (detail) => {
      qc.setQueryData(tenantKeys.detail(id), detail);
      invalidateTenantData(qc, id);
    },
    meta: { errorToast: false },
  });
}

export function useImpersonate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImpersonationInput = {}) =>
      api.post<Resource<Impersonation>>(`/tenants/${id}/impersonate`, body).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['audit'] }),
    // The reason's 422 shows inline.
    meta: { errorToast: false },
  });
}

export function useBulkTenants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: BulkTenantAction; ids: string[] }) =>
      api.post<Resource<{ affected: number }>>('/tenants/bulk', body).then((r) => r.data),
    onSuccess: () => invalidateTenantData(qc),
  });
}

export function useEmailOwners() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[]; subject: string; body: string }) =>
      api.post<Resource<{ sent: number }>>('/tenants/email', body).then((r) => r.data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['audit'] }),
    meta: { errorToast: false },
  });
}
