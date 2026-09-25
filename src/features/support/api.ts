import { keepPreviousData, type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type { NewTicketMessage, SupportOptions, SupportSummary, Ticket, TicketDetail, TicketListParams, TicketUpdate } from './types';

export const supportKeys = {
  all: ['support'] as const,
  lists: () => [...supportKeys.all, 'list'] as const,
  list: (params: TicketListParams) => [...supportKeys.lists(), params] as const,
  summary: () => [...supportKeys.all, 'summary'] as const,
  options: () => [...supportKeys.all, 'options'] as const,
  detail: (id: string) => [...supportKeys.all, 'detail', id] as const,
};

/** Everything a ticket change can affect: the inbox, its counts, the sidebar badge, overview and audit. */
function invalidateSupportData(qc: QueryClient, detail?: TicketDetail) {
  if (detail) qc.setQueryData(supportKeys.detail(detail.id), detail);
  void qc.invalidateQueries({ queryKey: supportKeys.lists() });
  void qc.invalidateQueries({ queryKey: supportKeys.summary() });
  void qc.invalidateQueries({ queryKey: ['shell', 'badges'] });
  void qc.invalidateQueries({ queryKey: ['overview'] });
  void qc.invalidateQueries({ queryKey: ['audit'] });
}

// ---------- Queries ----------
export const TICKET_LIST_DEFAULTS: TicketListParams = { page: 1, perPage: 25, view: 'open' };

export const supportQueries = {
  list: (params: TicketListParams) =>
    queryOptions({
      queryKey: supportKeys.list(params),
      queryFn: ({ signal }) => api.get<Paginated<Ticket>>('/support/tickets', { query: { ...params }, signal }),
    }),
};

export const useTickets = (params: TicketListParams) => useQuery({ ...supportQueries.list(params), placeholderData: keepPreviousData });

export const useSupportSummary = () =>
  useQuery({
    queryKey: supportKeys.summary(),
    queryFn: ({ signal }) => api.get<Resource<SupportSummary>>('/support/summary', { signal }).then((r) => r.data),
  });

export const useSupportOptions = () =>
  useQuery({
    queryKey: supportKeys.options(),
    queryFn: ({ signal }) => api.get<Resource<SupportOptions>>('/support/options', { signal }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });

export const useTicket = (id: string | undefined) =>
  useQuery({
    queryKey: supportKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<Resource<TicketDetail>>(`/support/tickets/${id ?? ''}`, { signal }).then((r) => r.data),
    enabled: !!id,
  });

// ---------- Mutations ----------
export function usePostTicketMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTicketMessage) => api.post<Resource<TicketDetail>>(`/support/tickets/${id}/messages`, input).then((r) => r.data),
    onSuccess: (detail) => invalidateSupportData(qc, detail),
    meta: { errorToast: false },
  });
}

export function useUpdateTicket(id: string) {
  const qc = useQueryClient();
  const key = supportKeys.detail(id);
  return useMutation({
    mutationFn: (patch: TicketUpdate) => api.patch<Resource<TicketDetail>>(`/support/tickets/${id}`, patch).then((r) => r.data),
    // Tags toggle instantly; the server response replaces the optimistic copy (or the rollback restores it).
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TicketDetail>(key);
      if (prev && patch.tags) qc.setQueryData(key, { ...prev, tags: patch.tags });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (detail) => invalidateSupportData(qc, detail),
  });
}

export function useTicketAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'escalate' | 'resolve') =>
      api.post<Resource<TicketDetail>>(`/support/tickets/${id}/${action}`).then((r) => r.data),
    onSuccess: (detail) => invalidateSupportData(qc, detail),
  });
}
