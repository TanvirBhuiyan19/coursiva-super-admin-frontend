import type { QueryClient } from '@tanstack/react-query';
import { warm } from '@/lib/queryClient';
import { STAFF_LIST_DEFAULTS, staffQueries } from '../api';

export function prefetch(qc: QueryClient) {
  warm(qc.query(staffQueries.list(STAFF_LIST_DEFAULTS)));
  warm(qc.query(staffQueries.summary()));
}
