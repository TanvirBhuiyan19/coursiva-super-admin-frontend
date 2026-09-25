// Mock implementation of /billing (what the Laravel billing controllers + policies will do).
import { http } from 'msw';
import { PLANS, type Plan } from '@/lib/domain';
import { invoices, liveRoomAllowance, overages, platformSettings, pricing, tenants, type InvoiceRow } from '@/mocks/collections';
import { ago, collection, id } from '@/mocks/db';
import { tenantMrr } from '@/mocks/derive';
import { authorize, handle, invalid, noContent, notFound, ok, paginate, query, readBody, recordAudit, route } from '@/mocks/http';
import { PLAN_LIMITS } from '@/mocks/reference';
import {
  PROMO_DURATIONS,
  ROLLOUTS,
  type Invoice,
  type InvoiceStatus,
  type Overage,
  type OverageList,
  type PricingConfig,
  type PricingUpdate,
  type PromoCode,
  type PromoInput,
  type RevenueSummary,
} from './types';

// ---------- Feature-only tables ----------
interface AddonRow {
  id: string;
  label: string;
  price: number;
  availability: string;
}
export const billingAddons = collection<AddonRow>('billingAddons', () => [
  { id: 'storage', label: 'Extra storage · 100 GB', price: 10, availability: 'Any plan' },
  { id: 'seat', label: 'Additional staff seat', price: 8, availability: 'Any plan' },
  { id: 'sms', label: 'SMS credits · 1,000', price: 15, availability: 'Any plan' },
  { id: 'live', label: 'Live room minutes · 1,000', price: 12, availability: 'Growth and Scale' },
  { id: 'students', label: 'Extra students · 1,000', price: 20, availability: 'Launch and Growth' },
]);

interface PlanFeatureRow {
  id: string;
  label: string;
  plans: Plan[];
}
export const planFeatures = collection<PlanFeatureRow>('planFeatures', () => [
  { id: 'white_label', label: 'White-label branding', plans: ['Growth', 'Scale'] },
  { id: 'custom_domain', label: 'Custom domain', plans: ['Growth', 'Scale'] },
  { id: 'sso', label: 'SSO (SAML)', plans: ['Scale'] },
  { id: 'priority_support', label: 'Priority support', plans: ['Scale'] },
  { id: 'success_manager', label: 'Dedicated success manager', plans: ['Scale'] },
]);

interface PromoRow extends PromoCode {
  deactivatedAt: string | null;
}
const P = (
  pid: string,
  code: string,
  percentOff: number,
  duration: PromoRow['duration'],
  audience: string,
  redemptions: number,
  daysAgo: number,
): PromoRow => {
  return { id: pid, code, percentOff, duration, audience, redemptions, createdAt: ago({ d: daysAgo }), deactivatedAt: null };
};
export const promoCodes = collection<PromoRow>('promoCodes', () => [
  P('pc_launch30', 'LAUNCH30', 30, '3 months', 'New tenants', 14, 40),
  P('pc_annual15', 'ANNUAL15', 15, '12 months', 'Annual plans', 6, 25),
  P('pc_winback50', 'WINBACK50', 50, '2 months', 'Churned tenants', 3, 12),
]);

// ---------- Reference (config in Laravel) ----------
const PLAN_HIGHLIGHT: Record<Plan, string> = {
  Launch: '“Powered by Coursiva” branding',
  Growth: 'White-label + custom domain',
  Scale: 'SSO (SAML) & priority support',
};
/** Movement as a signed share of MRR for the last closed month (seeded; Laravel reads the MRR ledger). */
const MOVEMENTS = [
  { kind: 'new', label: 'New business', share: 0.08 },
  { kind: 'expansion', label: 'Expansion', share: 0.041 },
  { kind: 'contraction', label: 'Contraction', share: -0.009 },
  { kind: 'churn', label: 'Churn', share: -0.025 },
] as const;
const CHURN_REASONS = [
  { reason: 'Closed their business', pct: 40 },
  { reason: 'Too expensive', pct: 25 },
  { reason: 'Missing features', pct: 20 },
  { reason: 'Switched platform', pct: 15 },
];
const PAYOUT_SHARES = [0.467, 0.452, 0.437];
const STRIPE_NET = 0.971;
const RETRY_SCHEDULE = [1, 3, 7, 14, 21];

// ---------- Mapping ----------
const tenantName = (tenantId: string) => tenants.find(tenantId)?.name ?? 'Unknown tenant';
const monthStart = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
};
const platformMrr = () => tenants.all().reduce((s, t) => s + tenantMrr(t), 0);

const toInvoice = (v: InvoiceRow): Invoice => ({
  id: v.id,
  number: v.number,
  tenantId: v.tenantId,
  tenantName: tenantName(v.tenantId),
  plan: v.plan,
  amount: v.amount,
  issuedAt: v.issuedAt,
  status: v.status,
  attempts: v.attempts,
  nextRetryAt: v.dunningPaused ? null : v.nextRetryAt,
  dunningPaused: v.dunningPaused,
});

const sortedInvoices = () => [...invoices.all()].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.number.localeCompare(a.number));

function findInvoice(invoiceId: string | readonly string[] | undefined) {
  const v = typeof invoiceId === 'string' ? invoices.find(invoiceId) : undefined;
  if (!v) throw notFound('Invoice');
  return v;
}
function requirePastDue(v: InvoiceRow) {
  if (v.status !== 'Past due') throw invalid({ status: `Invoice ${v.number} is already ${v.status.toLowerCase()}.` });
}
/** A tenant leaves dunning once it has no past-due invoices left. */
function settleTenant(tenantId: string) {
  const t = tenants.find(tenantId);
  if (t?.status === 'Past due' && !invoices.where((v) => v.tenantId === tenantId && v.status === 'Past due').length)
    tenants.update(tenantId, { status: 'Active' });
}

function payouts(mrr: number): RevenueSummary['payouts'] {
  // Payouts run on the 1st and 15th: the next one is scheduled, the two before it are paid.
  const now = new Date();
  const dates: Date[] = [];
  for (let m = -2; m <= 1; m++) for (const d of [1, 15]) dates.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, d, 9)));
  const nextIdx = dates.findIndex((d) => d.getTime() > now.getTime());
  return PAYOUT_SHARES.map((share, i) => {
    const d = dates[nextIdx - i]!;
    return {
      id: `po_${d.toISOString().slice(0, 10)}`,
      date: d.toISOString(),
      amount: Math.round(mrr * share * STRIPE_NET),
      status: i === 0 ? ('Scheduled' as const) : ('Paid' as const),
    };
  });
}

function pricingConfig(): PricingConfig {
  const { prices, annualDiscountPct } = pricing.get();
  const all = tenants.all();
  const live = liveRoomAllowance.get();
  return {
    plans: PLANS.map((plan) => {
      const rows = all.filter((t) => t.plan === plan);
      const limits = PLAN_LIMITS[plan];
      return {
        plan,
        price: prices[plan],
        tenants: rows.length,
        payingTenants: rows.filter((t) => tenantMrr(t) > 0).length,
        mrr: rows.reduce((s, t) => s + tenantMrr(t), 0),
        limits: { staffSeats: limits.staffSeats, students: limits.students, storageGb: limits.storageGb, liveRoomMinutes: live[plan] },
        highlight: PLAN_HIGHLIGHT[plan],
      };
    }),
    annualDiscountPct,
    trialDays: platformSettings.get().trialDays,
    addons: billingAddons.all().map((a) => ({ key: a.id, label: a.label, price: a.price, availability: a.availability })),
    features: planFeatures.all().map((f) => ({ key: f.id, label: f.label, plans: PLANS.filter((p) => f.plans.includes(p)) })),
  };
}

const toPromo = ({ deactivatedAt: _d, ...p }: PromoRow): PromoCode => p;
const activePromos = () => promoCodes.where((p) => !p.deactivatedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const isWholeIn = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
const isPrice = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100_000;

type Params = { id: string };

export const handlers = [
  // ---------- Revenue ----------
  http.get(
    route('/billing/revenue'),
    handle(() => {
      authorize('billing.view');
      const mrr = platformMrr();
      const movementMonth = monthStart(-1);
      const joined = tenants.where((t) => t.createdAt.slice(0, 7) === movementMonth.slice(0, 7)).length;
      const details: Record<(typeof MOVEMENTS)[number]['kind'], string> = {
        new: `${joined} new ${joined === 1 ? 'tenant' : 'tenants'}`,
        expansion: '3 plan upgrades',
        contraction: '1 downgrade',
        churn: '2 cancellations',
      };
      const movements = MOVEMENTS.map((m) => ({
        kind: m.kind,
        label: m.label,
        detail: details[m.kind],
        amount: Math.round(mrr * m.share),
      }));
      const body: RevenueSummary = {
        mrr,
        arr: mrr * 12,
        netChange: movements.reduce((s, m) => s + m.amount, 0),
        pastDueTenants: tenants.where((t) => t.status === 'Past due').length,
        movementMonth,
        movements,
        churnReasons: CHURN_REASONS,
        payouts: payouts(mrr),
      };
      return ok(body);
    }),
  ),

  http.get(
    route('/billing/invoices'),
    handle(({ request }) => {
      authorize('billing.view');
      const q = query(request);
      const status = q.get('status') as InvoiceStatus | undefined;
      const rows = sortedInvoices()
        .filter((v) => !status || v.status === status)
        .map(toInvoice);
      const focus = q.get('focus');
      const idx = focus && !q.get('page') ? rows.findIndex((v) => v.id === focus) : -1;
      if (idx >= 0) {
        const url = new URL(request.url);
        url.searchParams.set('page', String(Math.floor(idx / q.perPage) + 1));
        return paginate(rows, new Request(url));
      }
      return paginate(rows, request);
    }),
  ),

  http.get(
    route('/billing/dunning'),
    handle(() => {
      authorize('billing.view');
      const { dunningRetries, autoSuspend } = platformSettings.get();
      return ok({
        maxAttempts: dunningRetries + 1,
        retryDays: RETRY_SCHEDULE.slice(0, dunningRetries),
        autoSuspend,
        items: sortedInvoices()
          .filter((v) => v.status === 'Past due')
          .map(toInvoice),
      });
    }),
  ),

  http.post<Params>(
    route('/billing/invoices/:id/retry'),
    handle<Params>(({ params }) => {
      authorize('billing.manage');
      const v = findInvoice(params.id);
      requirePastDue(v);
      invoices.update(v.id, { status: 'Paid', attempts: v.attempts + 1, nextRetryAt: null, dunningPaused: false });
      settleTenant(v.tenantId);
      recordAudit(`Retried failed charge for ${tenantName(v.tenantId)} — $${v.amount} collected`, 'Billing', v.tenantId);
      return ok(toInvoice(v));
    }),
  ),

  http.post<Params>(
    route('/billing/invoices/:id/waive'),
    handle<Params>(({ params }) => {
      authorize('billing.manage');
      const v = findInvoice(params.id);
      requirePastDue(v);
      invoices.update(v.id, { status: 'Waived', nextRetryAt: null, dunningPaused: false });
      settleTenant(v.tenantId);
      recordAudit(`Waived $${v.amount} invoice ${v.number} for ${tenantName(v.tenantId)}`, 'Billing', v.tenantId);
      return ok(toInvoice(v));
    }),
  ),

  http.put<Params>(
    route('/billing/invoices/:id/dunning'),
    handle<Params>(async ({ request, params }) => {
      authorize('billing.manage');
      const v = findInvoice(params.id);
      requirePastDue(v);
      const { paused } = await readBody<{ paused: unknown }>(request);
      if (typeof paused !== 'boolean') throw invalid({ paused: 'Choose whether to pause or resume dunning.' });
      if (paused !== v.dunningPaused) {
        invoices.update(v.id, { dunningPaused: paused });
        recordAudit(`${paused ? 'Paused' : 'Resumed'} dunning for ${tenantName(v.tenantId)} (${v.number})`, 'Billing', v.tenantId);
      }
      return ok(toInvoice(v));
    }),
  ),

  http.get(
    route('/billing/overages'),
    handle(() => {
      authorize('billing.view');
      const items: Overage[] = overages.all().map((o) => ({ ...o, tenantName: tenantName(o.tenantId) }));
      const body: OverageList = {
        period: monthStart(0),
        unbilledTotal: items.filter((o) => !o.billedAt).reduce((s, o) => s + o.amount, 0),
        items,
      };
      return ok(body);
    }),
  ),

  http.post<Params>(
    route('/billing/overages/:id/bill'),
    handle<Params>(({ params }) => {
      authorize('billing.manage');
      const o = overages.find(params.id);
      if (!o) throw notFound('Overage');
      if (o.billedAt) throw invalid({ overage: 'This overage is already on the next invoice.' });
      overages.update(o.id, { billedAt: new Date().toISOString() });
      recordAudit(`Added $${o.amount} ${o.meter.toLowerCase()} overage to ${tenantName(o.tenantId)}’s next invoice`, 'Billing', o.tenantId);
      return ok({ ...o, tenantName: tenantName(o.tenantId) });
    }),
  ),

  // ---------- Plans & pricing ----------
  http.get(
    route('/billing/pricing'),
    handle(() => {
      authorize('billing.view');
      return ok(pricingConfig());
    }),
  ),

  http.put(
    route('/billing/pricing'),
    handle(async ({ request }) => {
      authorize('billing.manage');
      const body = await readBody<Partial<PricingUpdate>>(request);
      const errors: Record<string, string> = {};
      const prices = Array.isArray(body.prices) ? body.prices : [];
      prices.forEach((p, i) => {
        if (!PLANS.includes(p.plan)) errors[`prices.${i}.plan`] = 'The selected plan is invalid.';
        else if (!isPrice(p.price)) errors[`prices.${i}.price`] = `Enter a ${p.plan} price between $0 and $100,000.`;
      });
      const addons = Array.isArray(body.addons) ? body.addons : [];
      addons.forEach((a, i) => {
        if (!billingAddons.find(a.key)) errors[`addons.${i}.key`] = 'Unknown add-on.';
        else if (!isPrice(a.price)) errors[`addons.${i}.price`] = 'Enter a price of $0 or more.';
      });
      if (body.annualDiscountPct !== undefined && !isWholeIn(body.annualDiscountPct, 0, 60))
        errors.annualDiscountPct = 'The annual discount must be a whole number from 0 to 60%.';
      if (body.trialDays !== undefined && !isWholeIn(body.trialDays, 0, 90))
        errors.trialDays = 'The trial length must be a whole number of days from 0 to 90.';
      const rollout = body.rollout ?? 'new_signups';
      if (!ROLLOUTS.includes(rollout)) errors.rollout = 'The selected rollout is invalid.';
      if (Object.keys(errors).length) throw invalid(errors);

      const current = pricing.get();
      const nextPrices = { ...current.prices };
      let migratedTenants = 0;
      for (const { plan, price } of prices) {
        const before = current.prices[plan];
        if (price === before) continue;
        nextPrices[plan] = price;
        if (rollout === 'migrate_all') {
          const rows = tenants.where((t) => t.plan === plan && t.monthlyPrice !== price);
          rows.forEach((t) => tenants.update(t.id, { monthlyPrice: price }));
          migratedTenants += rows.length;
          recordAudit(`Changed ${plan} plan price from $${before} to $${price} (migrated ${rows.length} tenants)`, 'Billing');
        } else recordAudit(`Changed ${plan} plan price from $${before} to $${price} (new signups only)`, 'Billing');
      }
      const annualDiscountPct = body.annualDiscountPct ?? current.annualDiscountPct;
      if (annualDiscountPct !== current.annualDiscountPct)
        recordAudit(`Changed annual billing discount from ${current.annualDiscountPct}% to ${annualDiscountPct}%`, 'Billing');
      pricing.set({ prices: nextPrices, annualDiscountPct });

      for (const { key, price } of addons) {
        const row = billingAddons.find(key)!;
        if (row.price === price) continue;
        recordAudit(`Changed ${row.label} add-on price from $${row.price} to $${price}/mo`, 'Billing');
        billingAddons.update(key, { price });
      }
      if (body.trialDays !== undefined && body.trialDays !== platformSettings.get().trialDays) {
        recordAudit(`Changed free trial length from ${platformSettings.get().trialDays} to ${body.trialDays} days`, 'Billing');
        platformSettings.patch({ trialDays: body.trialDays });
      }
      return ok({ pricing: pricingConfig(), migratedTenants });
    }),
  ),

  http.put<{ key: string; plan: string }>(
    route('/billing/plan-features/:key/plans/:plan'),
    handle<{ key: string; plan: string }>(async ({ request, params }) => {
      authorize('billing.manage');
      const f = planFeatures.find(params.key);
      if (!f) throw notFound('Plan feature');
      const plan = params.plan as Plan;
      if (!PLANS.includes(plan)) throw notFound('Plan');
      const { included } = await readBody<{ included: unknown }>(request);
      if (typeof included !== 'boolean') throw invalid({ included: 'Choose whether the plan includes this feature.' });
      if (included !== f.plans.includes(plan)) {
        planFeatures.update(f.id, { plans: included ? [...f.plans, plan] : f.plans.filter((p) => p !== plan) });
        recordAudit(`${included ? 'Included' : 'Removed'} ${f.label} ${included ? 'in' : 'from'} the ${plan} plan`, 'Billing');
      }
      return ok(pricingConfig());
    }),
  ),

  http.get(
    route('/billing/promos'),
    handle(() => {
      authorize('billing.view');
      return ok(activePromos().map(toPromo));
    }),
  ),

  http.post(
    route('/billing/promos'),
    handle(async ({ request }) => {
      authorize('billing.manage');
      const body = await readBody<Partial<PromoInput>>(request);
      const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
      const errors: Record<string, string> = {};
      if (!/^[A-Z0-9]{3,20}$/.test(code)) errors.code = 'Use 3–20 letters or digits, no spaces.';
      else if (activePromos().some((p) => p.code === code)) errors.code = `${code} is already an active promo code.`;
      if (!isWholeIn(body.percentOff, 1, 100)) errors.percentOff = 'Enter a whole percentage from 1 to 100.';
      if (!body.duration || !PROMO_DURATIONS.includes(body.duration)) errors.duration = 'Choose how long the discount lasts.';
      if (Object.keys(errors).length) throw invalid(errors);
      const row: PromoRow = {
        id: id('pc'),
        code,
        percentOff: body.percentOff!,
        duration: body.duration!,
        audience: 'All tenants',
        redemptions: 0,
        createdAt: new Date().toISOString(),
        deactivatedAt: null,
      };
      promoCodes.insert(row);
      recordAudit(`Created promo code ${code} (${row.percentOff}% off · ${row.duration})`, 'Billing');
      return ok(toPromo(row), 201);
    }),
  ),

  http.delete<Params>(
    route('/billing/promos/:id'),
    handle<Params>(({ params }) => {
      authorize('billing.manage');
      const p = promoCodes.find(params.id);
      if (!p || p.deactivatedAt) throw notFound('Promo code');
      promoCodes.update(p.id, { deactivatedAt: new Date().toISOString() });
      recordAudit(`Deactivated promo code ${p.code}`, 'Billing');
      return noContent();
    }),
  ),
];
