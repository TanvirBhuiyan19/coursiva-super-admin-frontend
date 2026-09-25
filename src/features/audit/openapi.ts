import { AUDIT_CATEGORIES } from '@/lib/domain';
import { defineSpec, file, listParams, paginated, ref } from '@/openapi/dsl';

const filters = { category: { type: 'string', enum: AUDIT_CATEGORIES }, tenant_id: { type: 'string' } } as const;

export const spec = defineSpec({
  tag: 'Audit',
  description: 'Append-only audit trail. Entries are written server-side by other endpoints; there is no create endpoint.',
  endpoints: [
    {
      method: 'GET',
      path: '/audit',
      summary: 'Audit entries, newest first',
      auth: 'audit.view',
      query: { ...listParams(), ...filters },
      response: paginated(ref('AuditEntry')),
    },
    {
      method: 'GET',
      path: '/audit/export',
      summary: 'Export audit entries as CSV',
      auth: 'audit.view',
      query: { search: { type: 'string' }, ...filters },
      response: file('text/csv', 'audit-log.csv'),
      audit: { text: 'Exported {n} audit entries', category: 'Security' },
    },
  ],
});
