import { keepPreviousData, type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { pollUnlessAuthFailed } from '@/lib/queryClient';
import type { Paginated, PaginationMeta, Resource } from '@/lib/api/types';
import type {
  CancelTaskInput,
  CompleteTaskInput,
  DomainOrderRow,
  DomainSettings,
  DomainSettingsUpdate,
  OrderListParams,
  RegistrarTask,
  RegistrationDetail,
  RegistrationListMeta,
  RegistrationListParams,
  RegistrationRow,
  TaskListMeta,
  TaskListParams,
} from './types';

export type RegistrationPage = Paginated<RegistrationRow> & { meta: PaginationMeta & RegistrationListMeta };
export type TaskPage = Paginated<RegistrarTask> & { meta: PaginationMeta & TaskListMeta };

export const domainKeys = {
  all: ['domains'] as const,
  settings: () => [...domainKeys.all, 'settings'] as const,
  registrations: () => [...domainKeys.all, 'registrations'] as const,
  registrationList: (params: RegistrationListParams) => [...domainKeys.registrations(), 'list', params] as const,
  registration: (id: string) => [...domainKeys.registrations(), 'detail', id] as const,
  tasks: () => [...domainKeys.all, 'tasks'] as const,
  taskList: (params: TaskListParams) => [...domainKeys.tasks(), params] as const,
  orders: () => [...domainKeys.all, 'orders'] as const,
  orderList: (params: OrderListParams) => [...domainKeys.orders(), params] as const,
};

// ---------- Queries ----------
export const REGISTRATION_LIST_DEFAULTS: RegistrationListParams = { page: 1, perPage: 25 };
export const TASK_LIST_DEFAULTS: TaskListParams = { page: 1, perPage: 25, status: 'open' };
export const ORDER_LIST_DEFAULTS: OrderListParams = { page: 1, perPage: 25 };
export const domainQueries = {
  settings: () =>
    queryOptions({
      queryKey: domainKeys.settings(),
      queryFn: ({ signal }) => api.get<Resource<DomainSettings>>('/domains/settings', { signal }).then((r) => r.data),
    }),
  registrations: (params: RegistrationListParams) =>
    queryOptions({
      queryKey: domainKeys.registrationList(params),
      queryFn: ({ signal }) => api.get<RegistrationPage>('/domains/registrations', { query: { ...params }, signal }),
    }),
  registration: (id: string) =>
    queryOptions({
      queryKey: domainKeys.registration(id),
      queryFn: ({ signal }) => api.get<Resource<RegistrationDetail>>(`/domains/registrations/${id}`, { signal }).then((r) => r.data),
    }),
  tasks: (params: TaskListParams) =>
    queryOptions({
      queryKey: domainKeys.taskList(params),
      queryFn: ({ signal }) => api.get<TaskPage>('/domains/tasks', { query: { ...params }, signal }),
    }),
  orders: (params: OrderListParams) =>
    queryOptions({
      queryKey: domainKeys.orderList(params),
      queryFn: ({ signal }) => api.get<Paginated<DomainOrderRow>>('/domains/orders', { query: { ...params }, signal }),
    }),
};

export const useDomainSettings = () => useQuery(domainQueries.settings());
export const useRegistrations = (params: RegistrationListParams) =>
  useQuery({ ...domainQueries.registrations(params), placeholderData: keepPreviousData });
export const useRegistration = (id: string | undefined) => useQuery({ ...domainQueries.registration(id ?? ''), enabled: !!id });
export const useRegistrarTasks = (params: TaskListParams) =>
  useQuery({ ...domainQueries.tasks(params), placeholderData: keepPreviousData });
export const useDomainOrders = (params: OrderListParams) =>
  useQuery({ ...domainQueries.orders(params), placeholderData: keepPreviousData });

/** Open tasks on the platform for the sidebar badge: `GET /domains/tasks?per_page=1` → `meta.open_total`. */
export const useOpenTaskCount = ({ enabled }: { enabled: boolean }) =>
  useQuery({
    ...domainQueries.tasks({ perPage: 1 }),
    enabled,
    refetchInterval: pollUnlessAuthFailed(60_000),
    select: (page) => page.meta.openTotal,
  });

// ---------- Mutations ----------
/** A task change moves its registration (and order), the queue, the badge and the audit log. */
function invalidateTaskData(qc: QueryClient, task: RegistrarTask) {
  void qc.invalidateQueries({ queryKey: domainKeys.tasks() });
  void qc.invalidateQueries({ queryKey: domainKeys.registrations() });
  void qc.invalidateQueries({ queryKey: domainKeys.orders() });
  void qc.invalidateQueries({ queryKey: domainKeys.registration(task.registrationId) });
  void qc.invalidateQueries({ queryKey: ['audit'] });
}

export function useUpdateDomainSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: DomainSettingsUpdate) => api.put<Resource<DomainSettings>>('/domains/settings', patch).then((r) => r.data),
    onSuccess: (settings) => {
      qc.setQueryData(domainKeys.settings(), settings);
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
    meta: { errorToast: false },
  });
}

/**
 * Completes an open task. A transfer code is sent once and never kept: the mutation is garbage-collected at once and
 * the caller resets it on settle, so the code doesn't linger in the mutation cache.
 */
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CompleteTaskInput }) =>
      api.post<Resource<RegistrarTask>>(`/domains/tasks/${id}/complete`, input).then((r) => r.data),
    onSuccess: (task) => invalidateTaskData(qc, task),
    gcTime: 0,
    meta: { errorToast: false },
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CancelTaskInput }) =>
      api.post<Resource<RegistrarTask>>(`/domains/tasks/${id}/cancel`, input).then((r) => r.data),
    onSuccess: (task) => invalidateTaskData(qc, task),
    meta: { errorToast: false },
  });
}
