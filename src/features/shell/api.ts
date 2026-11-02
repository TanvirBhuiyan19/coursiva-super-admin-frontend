// Console-wide endpoints used by the shell: system status, nav badges, notifications, global search.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { pollUnlessAuthFailed } from '@/lib/queryClient';
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
    refetchInterval: pollUnlessAuthFailed(60_000),
  });

/** The support ticket badge: only for staff with `support.view` (the API answers 403 otherwise). */
export const useNavBadges = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    enabled,
    queryKey: shellKeys.badges,
    queryFn: () => api.get<Resource<NavBadges>>('/badges').then((r) => r.data),
    refetchInterval: pollUnlessAuthFailed(60_000),
  });

export const useNotifications = () =>
  useQuery({
    queryKey: shellKeys.notifications,
    queryFn: () => api.get<Resource<Notification[]>>('/notifications').then((r) => r.data),
    refetchInterval: pollUnlessAuthFailed(60_000),
  });

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<undefined>('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: shellKeys.notifications }),
  });
}

/** Shortest query `GET /search` accepts. */
export const SEARCH_MIN_LENGTH = 2;

export function useGlobalSearch(q: string, type?: SearchType) {
  const term = q.trim();
  return useQuery<SearchResult[]>({
    queryKey: shellKeys.search(term, type),
    queryFn: ({ signal }) => api.get<Resource<SearchResult[]>>('/search', { query: { q: term, type }, signal }).then((r) => r.data),
    // Laravel validates `q` as 2–100 characters (422 otherwise): don't ask before then.
    enabled: term.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
