import type { QueryClient } from '@tanstack/react-query';
import { warm } from '@/lib/queryClient';
import { domainQueries, REGISTRATION_LIST_DEFAULTS } from '../api';

export function prefetch(qc: QueryClient) {
  warm(qc.query(domainQueries.registrations(REGISTRATION_LIST_DEFAULTS)));
}
