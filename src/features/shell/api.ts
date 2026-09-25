// Console-wide endpoints used by the shell: system status, nav badges, notifications, global search.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import type { NavBadges, Notification, PlatformStatus, SearchResult, SearchType } from './types';

export type { NavBadges, Notification, PlatformStatus, SearchResult, SearchType } from './types';

export const shellKeys = {
  status: ['platform', 'status'] as const,
  badges: ['shell', 'badges'] as const,
  notifications: ['notifications'] as const,
  search: (q: string, type?: SearchType) => ['search', q, type ?? 'all'] as const,
};

export const usePlatformStatus = () =>
  useQuery({
    queryKey: shellKeys.status,
    queryFn: () => api.get<Resource<PlatformStatus>>('/status').then((r) => r.data),
    refetchInterval: 60_000,
  });

export const useNavBadges = () =>
  useQuery({
    queryKey: shellKeys.badges,
    queryFn: () => api.get<Resource<NavBadges>>('/badges').then((r) => r.data),
    refetchInterval: 60_000,
  });

export const useNotifications = () =>
  useQuery({
    queryKey: shellKeys.notifications,
    queryFn: () => api.get<Resource<Notification[]>>('/notifications').then((r) => r.data),
    refetchInterval: 60_000,
  });

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: shellKeys.notifications }),
  });
}

export function useGlobalSearch(q: string, type?: SearchType) {
  const term = q.trim();
  return useQuery<SearchResult[]>({
    queryKey: shellKeys.search(term, type),
    queryFn: ({ signal }) => api.get<Resource<SearchResult[]>>('/search', { query: { q: term, type }, signal }).then((r) => r.data),
    enabled: term.length > 0 || !!type,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
