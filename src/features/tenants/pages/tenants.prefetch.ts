import type { QueryClient } from '@tanstack/react-query';
import { warm } from '@/lib/queryClient';
import { TENANT_LIST_DEFAULTS, tenantQueries } from '../api';

export function prefetch(qc: QueryClient) {
  warm(qc.query(tenantQueries.list(TENANT_LIST_DEFAULTS)));
  warm(qc.query(tenantQueries.summary()));
}
