import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import type { Overview, OverviewRange } from './types';

export const overviewKeys = { detail: (range: OverviewRange) => ['overview', range] as const };

export const overviewQueries = {
  detail: (range: OverviewRange) =>
    queryOptions({
      queryKey: overviewKeys.detail(range),
      queryFn: ({ signal }) => api.get<Resource<Overview>>('/overview', { query: { range }, signal }).then((r) => r.data),
    }),
};

export const useOverview = (range: OverviewRange) => useQuery({ ...overviewQueries.detail(range), placeholderData: keepPreviousData });
