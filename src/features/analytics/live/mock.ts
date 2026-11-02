// Mock of GET /analytics/live (Laravel App\Modules\Analytics\LiveUsage::report): per-school live usage for a month —
// room minutes from the billing meter, the rest from the schools' daily live rollup. The mock derives a deterministic
// month per school from its id, so the screen is stable across reloads.
import { http } from 'msw';
import type { Plan } from '@/lib/domain';
import { tenants } from '@/mocks/collections';
import { authorize, handle, invalid, ok, query, route } from '@/mocks/http';
import type { LiveTenantUsage, LiveUsage } from '../types';

const ALLOWANCE: Record<Plan, number> = { Launch: 0, Growth: 2000, Scale: 10000 };
const MONTHS = 12;
const TREND = 6;

const hash = (s: string) => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)).reduce((h, c) => (h * 31 + c) >>> 0, 7);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
};

/** A school's sessions on one day of a month (0 most days). */
function daySessions(tenantId: string, date: string) {
  const h = hash(tenantId + date);
  return h % 7 === 0 ? 1 + (h % 3 === 0 ? 1 : 0) : 0;
}

function schoolMonth(
  t: { id: string; name: string; plan: Plan },
  start: Date,
  end: Date,
): LiveTenantUsage & { days: Map<string, [number, number]> } {
  const days = new Map<string, [number, number]>();
  const size = 6 + (hash(t.id) % 30);
  let sessions = 0;
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const n = t.plan === 'Launch' ? 0 : daySessions(t.id, iso(d));
    if (!n) continue;
    const peak = Math.round(size * (0.6 + (hash(t.id + iso(d)) % 40) / 100) * n);
    days.set(iso(d), [n, peak]);
    sessions += n;
  }
  const attendees = [...days.values()].reduce((s, [, p]) => s + Math.round(p * 0.9), 0);
  const participantMinutes = attendees * (38 + (hash(t.id) % 15));
  const roomMinutes = Math.round(participantMinutes * 1.08);
  const allowance = ALLOWANCE[t.plan];
  return {
    tenantId: t.id,
    name: t.name,
    roomMinutes,
    allowance,
    usedPct: allowance ? Math.round((roomMinutes / allowance) * 100) : null,
    sessions,
    attendees,
    participantMinutes,
    peakConcurrency: Math.max(0, ...[...days.values()].map(([, p]) => p)),
    days,
  };
}

export function liveUsage(period?: string): LiveUsage {
  const periods = Array.from({ length: MONTHS }, (_, i) => iso(monthStart(i)));
  let offset = 0;
  if (period) {
    offset = periods.findIndex((p) => p.slice(0, 7) === period);
    if (offset < 0) throw invalid({ period: 'Choose one of the last 12 months.' });
  }
  const today = new Date();
  const until = (start: Date) => {
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
    return end > tomorrow ? tomorrow : end;
  };
  const schools = tenants.where((t) => t.status !== 'Suspended');
  const month = (o: number) => schools.map((t) => schoolMonth(t, monthStart(o), until(monthStart(o))));
  const rows = month(offset).filter((r) => r.roomMinutes > 0 || r.sessions > 0);
  const start = monthStart(offset);
  const daily: LiveUsage['daily'] = [];
  for (let d = new Date(start); d < until(start); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = iso(d);
    const on = rows.map((r) => r.days.get(key)).filter((v): v is [number, number] => !!v);
    daily.push({ date: key, sessions: on.reduce((s, [n]) => s + n, 0), peakConcurrency: Math.max(0, ...on.map(([, p]) => p)) });
  }
  const sum = (k: 'roomMinutes' | 'sessions' | 'attendees' | 'participantMinutes', list = rows) => list.reduce((s, r) => s + r[k], 0);
  return {
    period: iso(start),
    periods,
    totals: {
      roomMinutes: sum('roomMinutes'),
      sessions: sum('sessions'),
      attendees: sum('attendees'),
      participantMinutes: sum('participantMinutes'),
      peakConcurrency: Math.max(0, ...rows.map((r) => r.peakConcurrency)),
      schools: rows.length,
    },
    trend: Array.from({ length: TREND }, (_, i) => {
      const o = offset + TREND - 1 - i;
      const m = month(o);
      return {
        period: iso(monthStart(o)),
        roomMinutes: sum('roomMinutes', m),
        sessions: sum('sessions', m),
        attendees: sum('attendees', m),
      };
    }),
    daily,
    tenants: rows
      .sort((a, b) => b.roomMinutes - a.roomMinutes || b.sessions - a.sessions || a.name.localeCompare(b.name))
      .slice(0, 20)
      .map(({ days: _d, ...r }) => r),
  };
}

export const handlers = [
  http.get(
    route('/analytics/live'),
    handle(({ request }) => {
      authorize('analytics.view');
      return ok(liveUsage(query(request).get('period')));
    }),
  ),
];
