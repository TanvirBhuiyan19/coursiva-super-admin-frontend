import { http, HttpResponse } from 'msw';
import { audit } from '@/mocks/collections';
import { authorize, handle, paginate, query, recordAudit, route } from '@/mocks/http';

function filtered(request: Request) {
  const q = query(request);
  const category = q.get('category');
  const tenantId = q.get('tenant_id');
  return [...audit.all()]
    .filter((a) => (!category || a.category === category) && (!tenantId || a.tenantId === tenantId))
    .filter((a) => !q.search || `${a.actorName} ${a.action}`.toLowerCase().includes(q.search))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const handlers = [
  http.get(
    route('/audit/export'),
    handle(({ request }) => {
      authorize('audit.view');
      const rows = filtered(request);
      const esc = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;
      const csv = [
        ['Time (UTC)', 'Actor', 'Action', 'Category', 'Tenant', 'IP'].map(esc).join(','),
        ...rows.map((a) => [a.createdAt, a.actorName, a.action, a.category, a.tenantId, a.ip].map(esc).join(',')),
      ].join('\n');
      recordAudit(`Exported ${rows.length} audit entries`, 'Security');
      return new HttpResponse(csv, {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit-log.csv"' },
      });
    }),
  ),

  http.get(
    route('/audit'),
    handle(({ request }) => {
      authorize('audit.view');
      return paginate(filtered(request), request);
    }),
  ),
];
