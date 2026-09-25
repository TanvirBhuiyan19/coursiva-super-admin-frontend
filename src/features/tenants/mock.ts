// Mock implementation of /tenants (what the Laravel TenantController + policies will do).
import { http, HttpResponse } from 'msw';
import { flags, invoices, platformSettings, pricing, staff, tenants, type StaffRow, type TenantRow } from '@/mocks/collections';
import { ago, id, slug } from '@/mocks/db';
import {
  effectiveLimits,
  extensionPrice,
  isDormant,
  lifecycleStage,
  planLimits,
  tenantHealth,
  tenantHealthScore,
  tenantModules,
  tenantMrr,
  utilization,
} from '@/mocks/derive';
import { authorize, handle, invalid, notFound, ok, paginate, query, readBody, recordAudit, route, sortRows } from '@/mocks/http';
import { EXTENSIONS, FEATURE_FLAGS, TENANT_OVERRIDABLE_FLAGS } from '@/mocks/reference';
import { LIMIT_KEYS, PLANS, REGIONS, type LimitKey, type TenantStatus } from '@/lib/domain';
import type { BulkTenantAction, ProvisionTenantInput, Tenant, TenantDetail, TenantSegment, TenantUpdate } from './types';

const DAY = 86_400_000;

function toTenant(t: TenantRow, viewer: StaffRow): Tenant {
  const { health, reason } = tenantHealth(t);
  return {
    id: t.id,
    name: t.name,
    domain: t.domain,
    ownerName: t.ownerName,
    ownerEmail: t.ownerEmail,
    plan: t.plan,
    status: t.status,
    students: t.students,
    mrr: tenantMrr(t),
    health,
    healthReason: reason,
    utilization: utilization(t),
    stage: lifecycleStage(t),
    createdAt: t.createdAt,
    lastActiveAt: t.lastActiveAt,
    trialEndsAt: t.trialEndsAt,
    watched: viewer.watchlist.includes(t.id),
  };
}

function toDetail(t: TenantRow, viewer: StaffRow): TenantDetail {
  const limits = effectiveLimits(t);
  const defaults = planLimits(t.plan);
  const platformFlags = new Map(flags.all().map((f) => [f.id, f.enabled]));
  const bills = invoices.where((v) => v.tenantId === t.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  return {
    ...toTenant(t, viewer),
    region: t.region,
    notes: t.notes,
    storageUsedGb: Math.max(2, Math.round(t.students * 0.04)),
    seatsUsed: Math.min(1 + (t.name.length % 5), limits.staffSeats || 99),
    healthScore: tenantHealthScore(t),
    limits: LIMIT_KEYS.map((key) => ({ key, value: limits[key], planDefault: defaults[key], overridden: t.limitOverrides[key] != null })),
    modules: tenantModules(t),
    extensions: EXTENSIONS.filter((e) => ['ai', 'app', 'drm', 'scorm', 'exam'].includes(e.key)).map((e) => ({
      key: e.key,
      name: e.name,
      price: extensionPrice(e),
      state: t.compedExtensions.includes(e.key) ? 'comped' : t.paidExtensions.includes(e.key) ? 'paying' : 'none',
    })),
    flags: FEATURE_FLAGS.filter((f) => TENANT_OVERRIDABLE_FLAGS.includes(f.key)).map((f) => ({
      key: f.key,
      name: f.name,
      enabled: t.flagOverrides[f.key] ?? platformFlags.get(f.key) ?? false,
      overridden: t.flagOverrides[f.key] != null,
    })),
    invoices: bills.length
      ? bills.map((v) => ({ id: v.id, issuedAt: v.issuedAt, amount: v.amount, status: v.status }))
      : [1, 2, 3].map((m) => ({
          id: `${t.id}-h${m}`,
          issuedAt: new Date(Date.now() - m * 30 * DAY).toISOString(),
          amount: t.monthlyPrice,
          status: 'Paid' as const,
        })),
    timeline: [
      t.status === 'Past due'
        ? { at: ago({ d: 4 }), text: 'Payment failed · retry 2 of 4 scheduled' }
        : { at: ago({ d: 4 }), text: `Invoice paid · $${t.monthlyPrice}` },
      { at: t.lastActiveAt, text: `Owner signed in (${t.ownerName})` },
      { at: ago({ d: 26 }), text: 'Published a new course' },
      { at: t.createdAt, text: 'Tenant created' },
    ],
  };
}

const SEGMENTS: Record<TenantSegment, (t: TenantRow, viewer: StaffRow) => boolean> = {
  all: () => true,
  watchlist: (t, v) => v.watchlist.includes(t.id),
  at_risk: (t) => tenantHealth(t).health === 'At risk',
  trials_ending: (t) => t.status === 'Trial' && !!t.trialEndsAt && new Date(t.trialEndsAt).getTime() - Date.now() <= 7 * DAY,
  past_due: (t) => t.status === 'Past due',
  dormant: (t) => isDormant(t),
  top_mrr: (t) => tenantMrr(t) >= 899,
};

/** Applies GET /tenants filters: segment, plan, status, search, sort. */
function filtered(request: Request, viewer: StaffRow) {
  const q = query(request);
  const segment = (q.get('segment') ?? 'all') as TenantSegment;
  const plan = q.get('plan');
  const status = q.get('status');
  let rows = tenants.all().filter((t) => (SEGMENTS[segment] ?? SEGMENTS.all)(t, viewer));
  if (plan) rows = rows.filter((t) => t.plan === plan);
  if (status) rows = rows.filter((t) => t.status === status);
  if (q.search) rows = rows.filter((t) => [t.name, t.ownerName, t.ownerEmail, t.domain].some((s) => s.toLowerCase().includes(q.search)));
  return sortRows(rows, q.sort, {
    name: (t) => t.name,
    students: (t) => t.students,
    mrr: (t) => tenantMrr(t),
    created_at: (t) => t.createdAt,
    last_active_at: (t) => t.lastActiveAt,
  });
}

function findTenant(tenantId: string | readonly string[] | undefined) {
  const t = typeof tenantId === 'string' ? tenants.find(tenantId) : undefined;
  if (!t) throw notFound('Tenant');
  return t;
}
const ownerNameFrom = (email: string) =>
  email
    .split('@')[0]!
    .replace(/[._-]+/g, ' ')
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

type Params = { id: string };

/** Single-purpose tenant actions (POST /tenants/{id}/{action}); each is its own route in the API. */
const TENANT_ACTIONS = [
  'suspend',
  'reactivate',
  'extend-trial',
  'export',
  'purge',
  'revoke-sessions',
  'reset-password',
  'reissue-ssl',
] as const;
type TenantActionName = (typeof TENANT_ACTIONS)[number];

function runTenantAction(action: TenantActionName, t: TenantRow) {
  const set = (status: TenantStatus, text: string, perm: Parameters<typeof authorize>[0]) => {
    authorize(perm);
    tenants.update(t.id, { status });
    recordAudit(text, 'Tenants', t.id);
  };
  switch (action) {
    case 'suspend':
      if (t.status === 'Suspended') throw invalid({ status: `${t.name} is already suspended.` });
      set('Suspended', `Suspended ${t.name}`, 'tenants.suspend');
      break;
    case 'reactivate':
      set(t.trialEndsAt && new Date(t.trialEndsAt).getTime() > Date.now() ? 'Trial' : 'Active', `Reactivated ${t.name}`, 'tenants.suspend');
      break;
    case 'extend-trial': {
      authorize('tenants.manage');
      if (t.status !== 'Trial') throw invalid({ status: 'Only tenants on a trial can be extended.' });
      const base = t.trialEndsAt ? new Date(t.trialEndsAt).getTime() : Date.now();
      tenants.update(t.id, { trialEndsAt: new Date(base + 14 * DAY).toISOString() });
      recordAudit(`Extended ${t.name}'s trial by 14 days`, 'Tenants', t.id);
      break;
    }
    case 'export':
      authorize('tenants.manage');
      recordAudit(`Queued full data export for ${t.name}`, 'Security', t.id);
      break;
    case 'purge':
      authorize('tenants.purge');
      recordAudit(`Scheduled data purge for ${t.name} (30-day grace period)`, 'Security', t.id);
      break;
    case 'revoke-sessions':
      authorize('tenants.manage');
      recordAudit(`Revoked all sessions for ${t.name}`, 'Security', t.id);
      break;
    case 'reset-password':
      authorize('tenants.manage');
      recordAudit(`Sent password reset to the owner of ${t.name}`, 'Security', t.id);
      break;
    case 'reissue-ssl':
      authorize('tenants.manage');
      recordAudit(`Reissued SSL certificate for ${t.domain}`, 'Security', t.id);
      break;
  }
}

export const handlers = [
  http.get(
    route('/tenants/summary'),
    handle(() => {
      const viewer = authorize('tenants.view');
      const all = tenants.all();
      const paying = all.filter((t) => tenantMrr(t) > 0);
      const mrr = paying.reduce((s, t) => s + tenantMrr(t), 0);
      const risk = all.filter((t) => tenantHealth(t).health === 'At risk');
      const segments = (Object.keys(SEGMENTS) as TenantSegment[]).map((segment) => ({
        segment,
        count: all.filter((t) => SEGMENTS[segment](t, viewer)).length,
      }));
      return ok({
        total: all.length,
        active: all.filter((t) => t.status === 'Active').length,
        trials: all.filter((t) => t.status === 'Trial').length,
        mrr,
        arpa: paying.length ? Math.round(mrr / paying.length) : 0,
        atRisk: risk.length,
        atRiskMrr: risk.reduce((s, t) => s + tenantMrr(t), 0),
        learners: all.reduce((s, t) => s + t.students, 0),
        segments,
      });
    }),
  ),

  http.get(
    route('/tenants'),
    handle(({ request }) => {
      const viewer = authorize('tenants.view');
      return paginate(
        filtered(request, viewer).map((t) => toTenant(t, viewer)),
        request,
      );
    }),
  ),

  // CSV export of the filtered directory (same filters as GET /tenants, no pagination).
  http.get(
    route('/tenants/export'),
    handle(({ request }) => {
      const viewer = authorize('tenants.view');
      const rows = filtered(request, viewer);
      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const csv = [
        ['Name', 'Domain', 'Owner', 'Owner email', 'Plan', 'Status', 'Students', 'MRR', 'Health', 'Created'].map(esc).join(','),
        ...rows.map((t) =>
          [
            t.name,
            t.domain,
            t.ownerName,
            t.ownerEmail,
            t.plan,
            t.status,
            t.students,
            tenantMrr(t),
            tenantHealth(t).health,
            t.createdAt.slice(0, 10),
          ]
            .map(esc)
            .join(','),
        ),
      ].join('\n');
      recordAudit(`Exported ${rows.length} tenants to CSV`, 'Tenants');
      return new HttpResponse(csv, {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="tenants.csv"' },
      });
    }),
  ),

  http.post(
    route('/tenants'),
    handle(async ({ request }) => {
      authorize('tenants.manage');
      const body = await readBody<ProvisionTenantInput>(request);
      const name = (body.name ?? '').trim();
      const email = (body.ownerEmail ?? '').trim().toLowerCase();
      const errors: Record<string, string> = {};
      if (name.length < 2) errors.name = 'The school name must be at least 2 characters.';
      else if (tenants.where((t) => t.name.toLowerCase() === name.toLowerCase()).length)
        errors.name = 'A tenant with this name already exists.';
      if (!isEmail(email)) errors.ownerEmail = 'The owner email must be a valid email address.';
      if (!PLANS.includes(body.plan)) errors.plan = 'The selected plan is invalid.';
      if (Object.keys(errors).length) throw invalid(errors);
      const base = slug(name).replace(/-/g, '').slice(0, 24) || 'school';
      const domain = `${base}.${platformSettings.get().primaryDomain}`;
      if (tenants.where((t) => t.domain === domain).length) throw invalid({ name: 'That subdomain is taken — try a different name.' });
      const now = new Date();
      const row: TenantRow = {
        id: id('tn'),
        name,
        domain,
        ownerName: ownerNameFrom(email),
        ownerEmail: email,
        plan: body.plan,
        monthlyPrice: pricing.get().prices[body.plan],
        students: 0,
        status: 'Trial',
        createdAt: now.toISOString(),
        lastActiveAt: now.toISOString(),
        trialEndsAt: new Date(now.getTime() + platformSettings.get().trialDays * DAY).toISOString(),
        region: 'EU',
        notes: null,
        limitOverrides: {},
        entitlementOverrides: {},
        flagOverrides: {},
        compedExtensions: [],
        paidExtensions: [],
      };
      tenants.insert(row);
      recordAudit(`Provisioned tenant "${name}" on ${body.plan}`, 'Tenants', row.id);
      return ok(toTenant(row, authorize()), 201);
    }),
  ),

  http.post(
    route('/tenants/bulk'),
    handle(async ({ request }) => {
      const { action, ids } = await readBody<{ action: BulkTenantAction; ids: string[] }>(request);
      const viewer = authorize(action === 'suspend' ? 'tenants.suspend' : 'tenants.view');
      const rows = (ids ?? []).map((i) => tenants.find(i)).filter((t): t is TenantRow => !!t);
      if (!rows.length) throw invalid({ ids: 'Select at least one tenant.' });
      if (action === 'suspend') {
        rows.forEach((t) => tenants.update(t.id, { status: 'Suspended' }));
        recordAudit(`Suspended ${rows.length} tenants in bulk`, 'Tenants');
      } else if (action === 'watch') {
        staff.update(viewer.id, { watchlist: [...new Set([...viewer.watchlist, ...rows.map((t) => t.id)])] });
      } else {
        recordAudit(`Exported ${rows.length} tenants to CSV`, 'Tenants');
      }
      return ok({ affected: rows.length });
    }),
  ),

  http.post(
    route('/tenants/email'),
    handle(async ({ request }) => {
      authorize('tenants.manage');
      const body = await readBody<{ ids: string[]; subject: string; body: string }>(request);
      const errors: Record<string, string> = {};
      if (!body.subject?.trim()) errors.subject = 'Add a subject line.';
      if (!body.body?.trim()) errors.body = 'Write a message.';
      if (!body.ids?.length) errors.ids = 'Select at least one tenant.';
      if (Object.keys(errors).length) throw invalid(errors);
      recordAudit(`Emailed ${body.ids.length} tenant owner${body.ids.length > 1 ? 's' : ''}: "${body.subject.trim()}"`, 'Tenants');
      return ok({ sent: body.ids.length });
    }),
  ),

  http.get<Params>(
    route('/tenants/:id'),
    handle<Params>(({ params }) => ok(toDetail(findTenant(params.id), authorize('tenants.view')))),
  ),

  http.patch<Params>(
    route('/tenants/:id'),
    handle<Params>(async ({ request, params }) => {
      const viewer = authorize('tenants.manage');
      const t = findTenant(params.id);
      const body = await readBody<TenantUpdate>(request);
      if (body.plan !== undefined) {
        if (!PLANS.includes(body.plan)) throw invalid({ plan: 'The selected plan is invalid.' });
        if (body.plan !== t.plan) {
          recordAudit(`Moved ${t.name} from ${t.plan} to ${body.plan}`, 'Tenants', t.id);
          tenants.update(t.id, { plan: body.plan, monthlyPrice: pricing.get().prices[body.plan] });
        }
      }
      if (body.region !== undefined) {
        if (!REGIONS.includes(body.region)) throw invalid({ region: 'The selected region is invalid.' });
        if (body.region !== t.region) {
          recordAudit(`Scheduled data-residency move for ${t.name}: ${t.region} → ${body.region}`, 'Security', t.id);
          tenants.update(t.id, { region: body.region });
        }
      }
      if (body.notes !== undefined) {
        const notes = body.notes?.trim() || null;
        if (notes && notes.length > 2000) throw invalid({ notes: 'Notes may not be longer than 2,000 characters.' });
        tenants.update(t.id, { notes });
      }
      return ok(toDetail(t, viewer));
    }),
  ),

  http.put<Params>(
    route('/tenants/:id/limits'),
    handle<Params>(async ({ request, params }) => {
      const viewer = authorize('tenants.manage');
      const t = findTenant(params.id);
      const { limits } = await readBody<{ limits: Partial<Record<LimitKey, number | null>> }>(request);
      const errors: Record<string, string> = {};
      const next = { ...t.limitOverrides };
      for (const [key, value] of Object.entries(limits ?? {}) as [LimitKey, number | null][]) {
        if (!LIMIT_KEYS.includes(key)) continue;
        if (value === null) {
          Reflect.deleteProperty(next, key);
          continue;
        }
        if (!Number.isInteger(value) || value < 0) errors[`limits.${key}`] = 'Must be a whole number, 0 or more (0 = unlimited).';
        else next[key] = value;
      }
      if (Object.keys(errors).length) throw invalid(errors);
      tenants.update(t.id, { limitOverrides: next });
      recordAudit(`Updated limits for ${t.name}`, 'Tenants', t.id);
      return ok(toDetail(t, viewer));
    }),
  ),

  http.put<{ id: string; moduleId: string }>(
    route('/tenants/:id/modules/:moduleId'),
    handle<{ id: string; moduleId: string }>(async ({ request, params }) => {
      const viewer = authorize('tenants.manage');
      const t = findTenant(params.id);
      const mod = tenantModules(t).find((m) => m.id === params.moduleId);
      if (!mod) throw notFound('Module');
      const { enabled } = await readBody<{ enabled: boolean | null }>(request);
      const next = { ...t.entitlementOverrides };
      if (enabled === null || enabled === mod.planDefault) Reflect.deleteProperty(next, mod.id);
      else next[mod.id] = enabled;
      tenants.update(t.id, { entitlementOverrides: next });
      recordAudit(`${(enabled ?? mod.planDefault) ? 'Granted' : 'Revoked'} ${mod.label} for ${t.name}`, 'Tenants', t.id);
      return ok(toDetail(t, viewer));
    }),
  ),

  http.delete<Params>(
    route('/tenants/:id/modules'),
    handle<Params>(({ params }) => {
      const viewer = authorize('tenants.manage');
      const t = findTenant(params.id);
      tenants.update(t.id, { entitlementOverrides: {} });
      recordAudit(`Reset module access for ${t.name} to the ${t.plan} plan`, 'Tenants', t.id);
      return ok(toDetail(t, viewer));
    }),
  ),

  http.put<{ id: string; key: string }>(
    route('/tenants/:id/flags/:key'),
    handle<{ id: string; key: string }>(async ({ request, params }) => {
      const viewer = authorize('flags.manage');
      const t = findTenant(params.id);
      if (!TENANT_OVERRIDABLE_FLAGS.includes(params.key)) throw notFound('Flag');
      const { enabled } = await readBody<{ enabled: unknown }>(request);
      tenants.update(t.id, { flagOverrides: { ...t.flagOverrides, [params.key]: enabled === true } });
      const name = FEATURE_FLAGS.find((f) => f.key === params.key)?.name ?? params.key;
      recordAudit(`${enabled ? 'Enabled' : 'Disabled'} "${name}" for ${t.name}`, 'Flags', t.id);
      return ok(toDetail(t, viewer));
    }),
  ),

  http.post<{ id: string; key: string }>(
    route('/tenants/:id/extensions/:key/comp'),
    handle<{ id: string; key: string }>(({ params }) => {
      const viewer = authorize('billing.manage');
      const t = findTenant(params.id);
      const ext = EXTENSIONS.find((e) => e.key === params.key);
      if (!ext) throw notFound('Extension');
      tenants.update(t.id, { compedExtensions: [...new Set([...t.compedExtensions, ext.key])] });
      recordAudit(`Comped ${ext.name} for ${t.name}`, 'Billing', t.id);
      return ok(toDetail(t, viewer));
    }),
  ),

  http.delete<{ id: string; key: string }>(
    route('/tenants/:id/extensions/:key/comp'),
    handle<{ id: string; key: string }>(({ params }) => {
      const viewer = authorize('billing.manage');
      const t = findTenant(params.id);
      const ext = EXTENSIONS.find((e) => e.key === params.key);
      tenants.update(t.id, { compedExtensions: t.compedExtensions.filter((k) => k !== params.key) });
      recordAudit(`Revoked ${ext?.name ?? params.key} comp for ${t.name}`, 'Billing', t.id);
      return ok(toDetail(t, viewer));
    }),
  ),

  http.post<Params>(
    route('/tenants/:id/watch'),
    handle<Params>(({ params }) => {
      const viewer = authorize('tenants.view');
      const t = findTenant(params.id);
      staff.update(viewer.id, { watchlist: [...new Set([...viewer.watchlist, t.id])] });
      return ok(toDetail(t, staff.find(viewer.id)!));
    }),
  ),

  http.delete<Params>(
    route('/tenants/:id/watch'),
    handle<Params>(({ params }) => {
      const viewer = authorize('tenants.view');
      const t = findTenant(params.id);
      staff.update(viewer.id, { watchlist: viewer.watchlist.filter((x) => x !== t.id) });
      return ok(toDetail(t, staff.find(viewer.id)!));
    }),
  ),

  http.post<Params>(
    route('/tenants/:id/transfer-ownership'),
    handle<Params>(async ({ request, params }) => {
      const viewer = authorize('tenants.manage');
      const t = findTenant(params.id);
      const { email } = await readBody<{ email: string }>(request);
      const e = (email ?? '').trim().toLowerCase();
      if (!isEmail(e)) throw invalid({ email: 'Enter the new owner’s email address.' });
      if (e === t.ownerEmail) throw invalid({ email: 'That person already owns this tenant.' });
      recordAudit(`Started ownership transfer of ${t.name} to ${e}`, 'Security', t.id);
      tenants.update(t.id, { ownerEmail: e, ownerName: ownerNameFrom(e) });
      return ok(toDetail(t, viewer));
    }),
  ),

  http.post<Params>(
    route('/tenants/:id/impersonate'),
    handle<Params>(({ params }) => {
      authorize('tenants.impersonate');
      const t = findTenant(params.id);
      recordAudit(`Signed in as owner of ${t.name} (read-only)`, 'Security', t.id);
      return ok({
        tenantId: t.id,
        url: `https://${t.domain}/admin?impersonation=mock`,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
    }),
  ),

  // Single-purpose actions: one explicit route each (mirrors the documented API).
  ...TENANT_ACTIONS.map((action) =>
    http.post<Params>(
      route(`/tenants/:id/${action}`),
      handle<Params>(({ params }) => {
        const t = findTenant(params.id);
        runTenantAction(action, t);
        return ok(toDetail(t, authorize()));
      }),
    ),
  ),
];
