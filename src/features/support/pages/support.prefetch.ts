import type { QueryClient } from '@tanstack/react-query';
import { warm } from '@/lib/queryClient';
import { supportQueries, TICKET_LIST_DEFAULTS } from '../api';

export function prefetch(qc: QueryClient) {
  warm(qc.query(supportQueries.list(TICKET_LIST_DEFAULTS)));
}
