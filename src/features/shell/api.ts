// Console-wide endpoints used by the shell: system status, nav badges, notifications, global search.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { pollUnlessAuthFailed } from '@/lib/queryClient';
import type { CursorPage, Resource } from '@/lib/api/types';
import type { NavBadges, Notification, PlatformStatus, SearchResult, SearchType } from './types';

export type { NavBadges, Notification, PlatformStatus, SearchResult, SearchType } from './types';

export const shellKeys = {
  status: ['platform', 'status'] as const,
  badges: ['shell', 'badges'] as const,
  notifications: ['notifications'] as const,
  /** Older pages below the bell's first page, anchored on that page's `next_cursor` (prefix of `notifications`). */
  olderNotifications: (cursor: string) => ['notifications', 'older', cursor] as const,
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

/** The bell: the newest page (30), with `meta.nextCursor` for older ones. */
export const useNotifications = () =>
  useQuery({
    queryKey: shellKeys.notifications,
    queryFn: () => api.get<CursorPage<Notification>>('/notifications'),
    refetchInterval: pollUnlessAuthFailed(60_000),
  });

/**
 * Older notifications below the first page, fetched only once `enabled` ("Load older"). Keyed on the first page's
 * cursor, so a new notification that shifts the first page restarts from its new edge — no gaps, no duplicates.
 */
export const useOlderNotifications = (cursor: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: shellKeys.olderNotifications(cursor),
    queryFn: ({ pageParam, signal }) => api.get<CursorPage<Notification>>('/notifications', { query: { before: pageParam }, signal }),
    initialPageParam: cursor,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled,
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
