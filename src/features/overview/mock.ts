import { http } from 'msw';
import { PLANS } from '@/lib/domain';
import { dsars, entitlementOverrides, overages, tenants, tickets } from '@/mocks/collections';
import { tenantHealth, tenantMrr } from '@/mocks/derive';
import { authorize, handle, ok, query, route } from '@/mocks/http';
import type { Overview, OverviewRange } from './types';

const DAY = 86_400_000;
const MRR_SHAPE = [52, 55, 57, 60, 61, 63, 66, 68, 71, 75, 79, 84];
const DELTAS: Record<OverviewRange, { mrrPct: number; tenants: number; students: number; churn: number; churnDelta: number }> = {
  '30d': { mrrPct: 9.6, tenants: 0, students: 1204, churn: 1.8, churnDelta: -0.4 },
  '90d': { mrrPct: 24.1, tenants: 1, students: 3890, churn: 2.1, churnDelta: -0.9 },
  '12mo': { mrrPct: 61.8, tenants: 4, students: 14220, churn: 2.4, churnDelta: -1.6 },
};

export const handlers = [
  http.get(
    route('/overview'),
    handle(({ request }) => {
      authorize();
      const range = (query(request).get('range') ?? '30d') as OverviewRange;
      const d = DELTAS[range] ?? DELTAS['30d'];
      const all = tenants.all();
      const mrr = all.reduce((s, t) => s + tenantMrr(t), 0);
      const since = Date.now() - (range === '30d' ? 30 : range === '90d' ? 90 : 365) * DAY;
      const joined = all.filter((t) => new Date(t.createdAt).getTime() >= since).length;

      const now = new Date();
      const mrrSeries = MRR_SHAPE.map((shape, i) => {
        const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1));
        return { month: m.toISOString().slice(0, 10), mrr: Math.round((mrr * shape) / 84) };
      });

      const pastDue = all.filter((t) => t.status === 'Past due');
      const open = tickets.where((t) => t.status !== 'Resolved');
      const trials = all.filter((t) => t.status === 'Trial');
      const unbilled = overages.where((o) => !o.billedAt);
      const pending = dsars.where((r) => !r.fulfilledAt).map((r) => Math.ceil((new Date(r.dueAt).getTime() - Date.now()) / DAY));
      const dueSoon = pending.filter((days) => days <= 10);
      const upcoming = dueSoon.filter((days) => days > 0);
      const risk = all.filter((t) => tenantHealth(t).health === 'At risk' || t.status === 'Past due');

      const body: Overview = {
        range,
        mrr: { value: mrr, deltaPct: d.mrrPct },
        tenants: { value: all.length, delta: joined + d.tenants },
        students: { value: all.reduce((s, t) => s + t.students, 0), delta: d.students },
        revenueChurn: { valuePct: d.churn, deltaPts: d.churnDelta },
        mrrSeries,
        planDistribution: PLANS.map((plan) => {
          const rows = all.filter((t) => t.plan === plan);
          return { plan, tenants: rows.length, mrr: rows.reduce((s, t) => s + tenantMrr(t), 0) };
        }),
        queue: {
          dunning: { count: pastDue.length, amount: pastDue.reduce((s, t) => s + t.monthlyPrice, 0) },
          tickets: { high: open.filter((t) => t.priority === 'High').length, open: open.length },
          trials: { count: trials.length, names: trials.map((t) => t.name) },
          overages: { count: unbilled.length, amount: unbilled.reduce((s, o) => s + o.amount, 0) },
          privacy: {
            dueSoon: dueSoon.length,
            overdue: dueSoon.filter((x) => x <= 0).length,
            soonestDays: upcoming.length ? Math.min(...upcoming) : null,
          },
        },
        mrrAtRisk: { amount: risk.reduce((s, t) => s + tenantMrr(t), 0), tenants: risk.length },
        entitlementOverrides: Object.keys(entitlementOverrides.get()).length,
        watchlist: all
          .map((t) => ({ t, h: tenantHealth(t) }))
          .filter(({ h }) => h.health !== 'Healthy')
          .map(({ t, h }) => ({ tenantId: t.id, name: t.name, health: h.health, reason: h.reason ?? '' })),
      };
      return ok(body);
    }),
  ),
];
