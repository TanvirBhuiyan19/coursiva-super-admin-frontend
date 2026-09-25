import { keepPreviousData, type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import { authKeys } from '@/features/auth/api';
import type { Permission, Role } from '@/features/auth/permissions';
import type {
  InviteStaffInput,
  RolePermissions,
  StaffAction,
  StaffActivity,
  StaffListParams,
  StaffMember,
  StaffSummary,
  StaffUpdate,
} from './types';

export const staffKeys = {
  all: ['staff'] as const,
  lists: () => [...staffKeys.all, 'list'] as const,
  list: (params: StaffListParams) => [...staffKeys.lists(), params] as const,
  summary: () => [...staffKeys.all, 'summary'] as const,
  activity: () => [...staffKeys.all, 'activity'] as const,
  roles: () => [...staffKeys.all, 'roles'] as const,
};

/** Staff changes touch the list, KPIs, the activity feed, the audit log and global search. */
function invalidateStaff(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: staffKeys.all });
  void qc.invalidateQueries({ queryKey: ['audit'] });
  void qc.invalidateQueries({ queryKey: ['search'] });
}

// ---------- Queries ----------
export const STAFF_LIST_DEFAULTS: StaffListParams = { perPage: 100 };

export const staffQueries = {
  list: (params: StaffListParams) =>
    queryOptions({
      queryKey: staffKeys.list(params),
      queryFn: ({ signal }) => api.get<Paginated<StaffMember>>('/staff', { query: { ...params }, signal }),
    }),
  summary: () =>
    queryOptions({
      queryKey: staffKeys.summary(),
      queryFn: ({ signal }) => api.get<Resource<StaffSummary>>('/staff/summary', { signal }).then((r) => r.data),
    }),
};

export const useStaffList = (params: StaffListParams) => useQuery({ ...staffQueries.list(params), placeholderData: keepPreviousData });

export const useStaffSummary = () => useQuery(staffQueries.summary());

export const useStaffActivity = () =>
  useQuery({
    queryKey: staffKeys.activity(),
    queryFn: ({ signal }) => api.get<Paginated<StaffActivity>>('/staff/activity', { query: { perPage: 6 }, signal }).then((r) => r.data),
  });

export const useRolePermissions = () =>
  useQuery({
    queryKey: staffKeys.roles(),
    queryFn: ({ signal }) => api.get<Resource<RolePermissions[]>>('/staff/roles', { signal }).then((r) => r.data),
  });

// ---------- Mutations ----------
export function useInviteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteStaffInput) => api.post<Resource<StaffMember>>('/staff/invitations', input).then((r) => r.data),
    onSuccess: () => invalidateStaff(qc),
    meta: { errorToast: false },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: StaffUpdate & { id: string }) =>
      api.patch<Resource<StaffMember>>(`/staff/${id}`, patch).then((r) => r.data),
    onSuccess: () => invalidateStaff(qc),
  });
}

export function useStaffAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: StaffAction }) =>
      api.post<Resource<StaffMember>>(`/staff/${id}/${action}`).then((r) => r.data),
    onSuccess: () => invalidateStaff(qc),
  });
}

export function useElevateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, elevate, minutes = 60 }: { id: string; elevate: boolean; minutes?: number }) =>
      (elevate
        ? api.post<Resource<StaffMember>>(`/staff/${id}/elevate`, { minutes })
        : api.delete<Resource<StaffMember>>(`/staff/${id}/elevation`)
      ).then((r) => r.data),
    onSuccess: () => invalidateStaff(qc),
  });
}

/**
 * Toggles one permission for one role. Optimistic, rolls back on failure.
 * Refetches `/auth/me` afterwards: the signed-in user's own permissions may have changed.
 */
export function useSetRolePermission() {
  const qc = useQueryClient();
  const key = staffKeys.roles();
  return useMutation({
    mutationFn: ({ role, permissions }: { role: Role; permissions: Permission[]; permission: Permission; granted: boolean }) =>
      api.put<Resource<RolePermissions[]>>(`/staff/roles/${encodeURIComponent(role)}`, { permissions }).then((r) => r.data),
    onMutate: async ({ role, permissions }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<RolePermissions[]>(key);
      if (prev)
        qc.setQueryData(
          key,
          prev.map((r) => (r.role === role ? { ...r, permissions } : r)),
        );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (roles) => {
      qc.setQueryData(key, roles);
      void qc.invalidateQueries({ queryKey: authKeys.me });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: ['shell'] });
    },
  });
}
