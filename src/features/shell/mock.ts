import { http } from 'msw';
import { invoices, notifications, platformStatus, staff, tenants, tickets } from '@/mocks/collections';
import { authorize, handle, noContent, ok, permissionsOf, query, route } from '@/mocks/http';
import type { Notification, SearchResult, SearchType } from './api';

export const handlers = [
  http.get(
    route('/status'),
    handle(() => {
      authorize();
      const { incident } = platformStatus.get();
      return ok({ operational: !incident, incident });
    }),
  ),

  http.get(
    route('/badges'),
    handle(() => {
      authorize();
      return ok({ support: tickets.where((t) => t.status !== 'Resolved').length });
    }),
  ),

  http.get(
    route('/notifications'),
    handle(() => {
      authorize();
      const rows = [...notifications.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return ok(
        rows.map<Notification>((n) => ({ id: n.id, text: n.text, tone: n.tone, createdAt: n.createdAt, read: !!n.readAt, href: n.href })),
      );
    }),
  ),

  http.post(
    route('/notifications/read-all'),
    handle(() => {
      authorize();
      const now = new Date().toISOString();
      notifications.all().forEach((n) => (n.readAt ??= now));
      return noContent();
    }),
  ),

  // Global search across the records the signed-in user may see.
  http.get(
    route('/search'),
    handle(({ request }) => {
      const user = authorize();
      const perms = permissionsOf(user);
      const q = (query(request).get('q') ?? '').trim().toLowerCase();
      const type = query(request).get('type') as SearchType | undefined;
      const match = (...s: string[]) => !q || s.some((x) => x.toLowerCase().includes(q));
      const tenantName = (id: string) => tenants.find(id)?.name ?? 'Unknown tenant';
      const out: SearchResult[] = [];
      const want = (t: SearchType) => !type || type === t;

      if (want('tenant') && perms.includes('tenants.view'))
        tenants
          .where((t) => match(t.name, t.ownerName, t.domain))
          .forEach((t) =>
            out.push({ type: 'tenant', id: t.id, label: t.name, sublabel: `${t.ownerName} · ${t.plan}`, href: `/tenants/${t.id}` }),
          );
      if (want('invoice') && perms.includes('billing.view'))
        invoices
          .where((v) => match(v.number, tenantName(v.tenantId)))
          .forEach((v) =>
            out.push({
              type: 'invoice',
              id: v.id,
              label: `$${v.amount} · ${tenantName(v.tenantId)}`,
              sublabel: `${v.number} · ${v.status}`,
              href: `/revenue?invoice=${v.id}`,
            }),
          );
      if (want('ticket') && perms.includes('support.view'))
        tickets
          .where((t) => match(t.subject, tenantName(t.tenantId), String(t.number)))
          .forEach((t) =>
            out.push({
              type: 'ticket',
              id: t.id,
              label: t.subject,
              sublabel: `#${t.number} · ${tenantName(t.tenantId)}`,
              href: `/support?ticket=${t.id}`,
            }),
          );
      if (want('staff') && perms.includes('staff.view'))
        staff
          .where((s) => match(s.name, s.email))
          .forEach((s) =>
            out.push({ type: 'staff', id: s.id, label: s.name, sublabel: `${s.role} · ${s.email}`, href: `/staff?member=${s.id}` }),
          );

      return ok(out.slice(0, 20));
    }),
  ),
];
