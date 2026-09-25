import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated, Resource } from '@/lib/api/types';
import type { Announcement, AnnouncementListParams, AudienceReach, NewAnnouncement } from './types';

export const announcementKeys = {
  all: ['announcements'] as const,
  list: (params: AnnouncementListParams) => [...announcementKeys.all, 'list', params] as const,
  audiences: () => [...announcementKeys.all, 'audiences'] as const,
};

export const useAnnouncements = (params: AnnouncementListParams) =>
  useQuery<Paginated<Announcement>>({
    queryKey: announcementKeys.list(params),
    queryFn: ({ signal }) => api.get<Paginated<Announcement>>('/announcements', { query: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });

export const useAudienceReach = () =>
  useQuery({
    queryKey: announcementKeys.audiences(),
    queryFn: ({ signal }) => api.get<Resource<AudienceReach[]>>('/announcements/audiences', { signal }).then((r) => r.data),
  });

export function useSendAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAnnouncement) => api.post<Resource<Announcement>>('/announcements', input).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: announcementKeys.all });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
    meta: { errorToast: false },
  });
}
