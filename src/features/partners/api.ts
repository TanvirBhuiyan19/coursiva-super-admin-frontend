import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, PaginationMeta, Resource } from '@/lib/api/types';
import type {
  CommissionStatus,
  NewReferral,
  Partner,
  PartnerAction,
  PartnerCommission,
  PartnerListParams,
  PartnerReferral,
  PartnersSummary,
  PartnerTaxForms,
  PartnerTerms,
  PartnerTermsSettings,
  PartnerUpdate,
  PayoutBatch,
  PayoutFunding,
} from './types';

export const partnerKeys = {
  all: ['partners'] as const,
  summary: () => [...partnerKeys.all, 'summary'] as const,
  list: (params: PartnerListParams) => [...partnerKeys.all, 'list', params] as const,
  detail: (id: string) => [...partnerKeys.all, 'detail', id] as const,
  referrals: (params: { page?: number; status?: string }) => [...partnerKeys.all, 'referrals', params] as const,
  commissions: (params: { page?: number; status?: string; partnerId?: string }) => [...partnerKeys.all, 'commissions', params] as const,
  settings: () => [...partnerKeys.all, 'settings'] as const,
  batches: (params: { page?: number }) => [...partnerKeys.all, 'batches', params] as const,
  batch: (id: string) => [...partnerKeys.all, 'batch', id] as const,
  funding: () => [...partnerKeys.all, 'funding'] as const,
  taxForms: (page?: number) => [...partnerKeys.all, 'taxForms', ...(page ? [page] : [])] as const,
};

/** A fresh key per money-moving request (the API stores it on the batch: a replay answers the same batch). */
export const idempotencyKey = () => `ui-${crypto.randomUUID().replace(/-/g, '')}`;
const idem = () => ({ headers: { 'Idempotency-Key': idempotencyKey() } });

export const usePartnersSummary = () =>
  useQuery({
    queryKey: partnerKeys.summary(),
    queryFn: ({ signal }) => api.get<Resource<PartnersSummary>>('/partners/summary', { signal }).then((r) => r.data),
  });

export const usePartners = (params: PartnerListParams) =>
  useQuery<Paginated<Partner>>({
    queryKey: partnerKeys.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Partner>>('/partners', {
        query: { ...params, applications: params.applications ? 1 : undefined, status: params.status || undefined },
        signal,
      }),
    placeholderData: keepPreviousData,
  });

export const usePartner = (id: string | null) =>
  useQuery({
    queryKey: partnerKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<Resource<Partner>>(`/partners/${id ?? ''}`, { signal }).then((r) => r.data),
    enabled: id !== null,
  });

export const usePartnerReferrals = (params: { page?: number; status?: 'active' | 'void' | '' }) =>
  useQuery<Paginated<PartnerReferral>>({
    queryKey: partnerKeys.referrals(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<PartnerReferral>>('/partners/referrals', { query: { ...params, status: params.status || undefined }, signal }),
    placeholderData: keepPreviousData,
  });

export const usePartnerCommissions = (params: { page?: number; status?: CommissionStatus | ''; partnerId?: string }) =>
  useQuery<Paginated<PartnerCommission>>({
    queryKey: partnerKeys.commissions(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<PartnerCommission>>('/partners/commissions', { query: { ...params, status: params.status || undefined }, signal }),
    placeholderData: keepPreviousData,
  });

export const usePartnerSettings = () =>
  useQuery({
    queryKey: partnerKeys.settings(),
    queryFn: ({ signal }) => api.get<Resource<PartnerTermsSettings>>('/partners/settings', { signal }).then((r) => r.data),
  });

export const usePayoutBatches = (params: { page?: number }) =>
  useQuery<Paginated<PayoutBatch>>({
    queryKey: partnerKeys.batches(params),
    queryFn: ({ signal }) => api.get<Paginated<PayoutBatch>>('/partners/payout-batches', { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });

export const usePayoutBatch = (id: string | null) =>
  useQuery({
    queryKey: partnerKeys.batch(id ?? ''),
    queryFn: ({ signal }) => api.get<Resource<PayoutBatch>>(`/partners/payout-batches/${id ?? ''}`, { signal }).then((r) => r.data),
    enabled: id !== null,
  });

export const usePayoutFunding = () =>
  useQuery({
    queryKey: partnerKeys.funding(),
    queryFn: ({ signal }) => api.get<Resource<PayoutFunding>>('/partners/payout-batches/funding', { signal }).then((r) => r.data),
  });

/** `{ threshold, forms }` where `forms` is one page (25), newest first — `meta` pages it. */
export const usePartnerTaxForms = (page = 1) =>
  useQuery<Resource<PartnerTaxForms> & { meta: PaginationMeta }>({
    queryKey: partnerKeys.taxForms(page),
    queryFn: ({ signal }) =>
      api.get<Resource<PartnerTaxForms> & { meta: PaginationMeta }>('/partners/tax-forms', { query: { page, perPage: 25 }, signal }),
    placeholderData: keepPreviousData,
  });

function useInvalidating<V, R>(fn: (v: V) => Promise<R>, opts: { errorToast?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: partnerKeys.all });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
    ...(opts.errorToast === false ? { meta: { errorToast: false } } : {}),
  });
}

export const usePartnerAction = () =>
  useInvalidating(({ id, action, note }: { id: string; action: PartnerAction; note?: string }) =>
    api.post<Resource<Partner>>(`/partners/${id}/${action}`, note ? { note } : {}).then((r) => r.data),
  );

export const useUpdatePartner = () =>
  useInvalidating(
    ({ id, ...input }: PartnerUpdate & { id: string }) => api.patch<Resource<Partner>>(`/partners/${id}`, input).then((r) => r.data),
    { errorToast: false },
  );

export const useAttributeReferral = () =>
  useInvalidating((input: NewReferral) => api.post<Resource<{ tenantId: string }>>('/partners/referrals', input).then((r) => r.data), {
    errorToast: false,
  });

export const useVoidReferral = () =>
  useInvalidating(({ tenantId, reason }: { tenantId: string; reason: string }) =>
    api.post<Resource<{ reversed: number }>>(`/partners/referrals/${tenantId}/void`, { reason }).then((r) => r.data),
  );

export const useReverseCommission = () =>
  useInvalidating(({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
    api.post<Resource<{ reversed: number }>>(`/partners/commissions/${id}/reverse`, { amount, reason }).then((r) => r.data),
  );

export const useUpdatePartnerSettings = () =>
  useInvalidating(
    (input: Partial<PartnerTerms>) => api.put<Resource<PartnerTermsSettings>>('/partners/settings', input).then((r) => r.data),
    { errorToast: false },
  );

export const useDraftPayoutBatch = () =>
  useInvalidating(() => api.post<Resource<PayoutBatch>>('/partners/payout-batches', {}, idem()).then((r) => r.data));

export const useBatchAction = () =>
  useInvalidating(({ id, action }: { id: string; action: 'approve' | 'send' | 'cancel' }) =>
    api.post<Resource<PayoutBatch>>(`/partners/payout-batches/${id}/${action}`, {}, idem()).then((r) => r.data),
  );

export const useRetryPayout = () =>
  useInvalidating((id: string) =>
    api.post<Resource<PayoutBatch>>(`/partners/payout-transfers/${id}/retry`, {}, idem()).then((r) => r.data),
  );

export const useReviewTaxForm = () =>
  useInvalidating(({ id, accept, note }: { id: string; accept: boolean; note?: string }) =>
    api.post<Resource<unknown>>(`/partners/tax-forms/${id}/${accept ? 'accept' : 'reject'}`, accept ? {} : { note }).then((r) => r.data),
  );
