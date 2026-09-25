import type { QueryClient } from '@tanstack/react-query';
import { warm } from '@/lib/queryClient';
import { auditQueries } from '@/features/audit/api';
import { tenantQueries } from '@/features/tenants/api';
import { overviewQueries } from '../api';

export function prefetch(qc: QueryClient) {
  warm(qc.query(overviewQueries.detail('30d')));
  warm(qc.query(tenantQueries.list({ sort: '-created_at', perPage: 5 })));
  warm(qc.query(auditQueries.list({ perPage: 6 })));
}
