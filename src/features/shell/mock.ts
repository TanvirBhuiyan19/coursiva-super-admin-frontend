import { http } from 'msw';
import { invoices, notifications, platformStatus, staff, tenants, tickets } from '@/mocks/collections';
import { newestWindow, parseBefore } from '@/mocks/cursor';
import { authorize, handle, invalid, json, noContent, ok, permissionsOf, query, route } from '@/mocks/http';
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
      authorize('support.view');
      return ok({ support: tickets.where((t) => t.status !== 'Resolved').length });
    }),
  ),

  http.get(
    route('/notifications'),
    handle(({ request }) => {
      authorize();
      // 30 a page, newest first; `?before=` = the previous page's `next_cursor`.
      const { items, meta } = newestWindow(notifications.all(), parseBefore(request), 30);
      return json({
        data: items.map<Notification>((n) => ({
          id: n.id,
          text: n.text,
          tone: n.tone,
          createdAt: n.createdAt,
          read: !!n.readAt,
          href: n.href,
        })),
        meta,
      });
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
      // Laravel: `q` required, 2–100 characters.
      if (q.length < 2) throw invalid({ q: 'The q field must be at least 2 characters.' });
      const match = (...s: string[]) => s.some((x) => x.toLowerCase().includes(q));
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
              // Laravel ConsoleHomeController::search.
              label: v.number,
              sublabel: `${tenantName(v.tenantId)} · $${v.amount}`,
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
