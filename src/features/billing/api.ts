import { keepPreviousData, type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateTenantData } from '@/features/tenants/api';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type { Plan } from '@/lib/domain';
import type {
  DunningQueue,
  Invoice,
  InvoiceListParams,
  Overage,
  OverageList,
  PricingConfig,
  PricingUpdate,
  PricingUpdateResult,
  PromoCode,
  PromoInput,
  RevenueSummary,
} from './types';

export const billingKeys = {
  all: ['billing'] as const,
  revenue: () => [...billingKeys.all, 'revenue'] as const,
  invoices: () => [...billingKeys.all, 'invoices'] as const,
  invoiceList: (params: InvoiceListParams) => [...billingKeys.invoices(), params] as const,
  dunning: () => [...billingKeys.all, 'dunning'] as const,
  overages: () => [...billingKeys.all, 'overages'] as const,
  pricing: () => [...billingKeys.all, 'pricing'] as const,
  promos: () => [...billingKeys.all, 'promos'] as const,
};

/** Everything a billing change can affect: billing views, overview counts, the audit log. */
function invalidateBilling(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: billingKeys.all });
  void qc.invalidateQueries({ queryKey: ['overview'] });
  void qc.invalidateQueries({ queryKey: ['audit'] });
  void qc.invalidateQueries({ queryKey: ['search'] });
}

// ---------- Revenue ----------
export const billingQueries = {
  revenue: () =>
    queryOptions({
      queryKey: billingKeys.revenue(),
      queryFn: ({ signal }) => api.get<Resource<RevenueSummary>>('/billing/revenue', { signal }).then((r) => r.data),
    }),
};

export const useRevenue = () => useQuery(billingQueries.revenue());

export const useInvoices = (params: InvoiceListParams) =>
  useQuery<Paginated<Invoice>>({
    queryKey: billingKeys.invoiceList(params),
    queryFn: ({ signal }) => api.get<Paginated<Invoice>>('/billing/invoices', { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });

export const useDunning = () =>
  useQuery({
    queryKey: billingKeys.dunning(),
    queryFn: ({ signal }) => api.get<Resource<DunningQueue>>('/billing/dunning', { signal }).then((r) => r.data),
  });

export const useOverages = () =>
  useQuery({
    queryKey: billingKeys.overages(),
    queryFn: ({ signal }) => api.get<Resource<OverageList>>('/billing/overages', { signal }).then((r) => r.data),
  });

/** Retry a failed charge or waive the invoice. Both settle the tenant, so tenant data is refreshed too. */
export function useSettleInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'waive' }) =>
      api.post<Resource<Invoice>>(`/billing/invoices/${id}/${action}`).then((r) => r.data),
    onSuccess: () => {
      invalidateBilling(qc);
      invalidateTenantData(qc);
      void qc.invalidateQueries({ queryKey: ['overview'] });
      void qc.invalidateQueries({ queryKey: ['shell', 'badges'] });
    },
  });
}

/** Pause/resume automatic retries. Optimistic: the queue row flips immediately and rolls back on failure. */
export function usePauseDunning() {
  const qc = useQueryClient();
  const key = billingKeys.dunning();
  return useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      api.put<Resource<Invoice>>(`/billing/invoices/${id}/dunning`, { paused }).then((r) => r.data),
    onMutate: async ({ id, paused }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DunningQueue>(key);
      if (prev)
        qc.setQueryData<DunningQueue>(key, { ...prev, items: prev.items.map((v) => (v.id === id ? { ...v, dunningPaused: paused } : v)) });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: billingKeys.invoices() });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function useBillOverage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Resource<Overage>>(`/billing/overages/${id}/bill`).then((r) => r.data),
    onSuccess: () => {
      invalidateBilling(qc);
      void qc.invalidateQueries({ queryKey: ['shell', 'badges'] });
    },
  });
}

// ---------- Plans & pricing ----------
export const usePricing = () =>
  useQuery({
    queryKey: billingKeys.pricing(),
    queryFn: ({ signal }) => api.get<Resource<PricingConfig>>('/billing/pricing', { signal }).then((r) => r.data),
  });

export function useSavePricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PricingUpdate) => api.put<Resource<PricingUpdateResult>>('/billing/pricing', body).then((r) => r.data),
    onSuccess: (res) => {
      qc.setQueryData(billingKeys.pricing(), res.pricing);
      invalidateBilling(qc);
      // Migrating prices changes every tenant's MRR.
      if (res.migratedTenants) invalidateTenantData(qc);
    },
    meta: { errorToast: false },
  });
}

/** Include/exclude a commercial feature for a plan. Optimistic with rollback. */
export function useSetPlanFeature() {
  const qc = useQueryClient();
  const key = billingKeys.pricing();
  return useMutation({
    mutationFn: ({ feature, plan, included }: { feature: string; plan: Plan; included: boolean }) =>
      api.put<Resource<PricingConfig>>(`/billing/plan-features/${feature}/plans/${plan}`, { included }).then((r) => r.data),
    onMutate: async ({ feature, plan, included }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PricingConfig>(key);
      if (prev)
        qc.setQueryData<PricingConfig>(key, {
          ...prev,
          features: prev.features.map((f) =>
            f.key === feature ? { ...f, plans: included ? [...f.plans, plan] : f.plans.filter((p) => p !== plan) } : f,
          ),
        });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (config) => {
      qc.setQueryData(key, config);
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export const usePromos = () =>
  useQuery({
    queryKey: billingKeys.promos(),
    queryFn: ({ signal }) => api.get<Resource<PromoCode[]>>('/billing/promos', { signal }).then((r) => r.data),
  });

export function useCreatePromo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PromoInput) => api.post<Resource<PromoCode>>('/billing/promos', input).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.promos() });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
    meta: { errorToast: false },
  });
}

export function useDeactivatePromo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/billing/promos/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.promos() });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
