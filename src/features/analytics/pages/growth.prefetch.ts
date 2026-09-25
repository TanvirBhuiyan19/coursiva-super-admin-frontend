import type { QueryClient } from '@tanstack/react-query';
import { warm } from '@/lib/queryClient';
import { analyticsQueries } from '../api';

export function prefetch(qc: QueryClient) {
  warm(qc.query(analyticsQueries.growth()));
}
