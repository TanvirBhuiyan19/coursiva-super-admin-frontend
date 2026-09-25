import type { QueryClient } from '@tanstack/react-query';
import { warm } from '@/lib/queryClient';
import { AUDIT_LIST_DEFAULTS, auditQueries } from '../api';

export function prefetch(qc: QueryClient) {
  warm(qc.query(auditQueries.list(AUDIT_LIST_DEFAULTS)));
}
