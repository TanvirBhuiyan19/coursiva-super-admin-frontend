// Mock of the console's partner programme (Laravel PartnerConsoleController + PartnerPayoutController, docs/api/partners.md).
// Money in minor units. Ledger rules follow the backends: due = amount − reversed − paid; held until available_at.
import { http, HttpResponse } from 'msw';
import { tenants } from '@/mocks/collections';
import { ago, collection, fromNow, id, singleton } from '@/mocks/db';
import {
  authorize,
  HttpError,
  handle,
  invalid,
  notFound,
  ok,
  paginate,
  query,
  readBody,
  recordAudit,
  requireRecentPassword,
  route,
} from '@/mocks/http';
import {
  LINE_KINDS,
  PARTNER_STATUSES,
  PAYOUT_RAILS,
  type BlockedPayee,
  type Partner,
  type PartnerAction,
  type PartnerCommission,
  type PartnerReferral,
  type PartnerStatus,
  type PartnerTaxForm,
  type PartnerTerms,
  type PayoutBatch,
  type PayoutItem,
} from './types';

interface PartnerRow extends Omit<Partner, 'stats' | 'commissionPct' | 'cookieDays'> {
  payoutReady: boolean;
}
type ReferralRow = PartnerReferral & { id: string };
type CommissionRow = PartnerCommission;
type BatchRow = Omit<PayoutBatch, 'items' | 'blocked' | 'itemCount'> & { items: PayoutItem[]; blocked: BlockedPayee[] };
type TaxFormRow = PartnerTaxForm;

const SITE = 'https://coursiva.com';
const DEFAULTS: PartnerTerms = {
  commissionPct: 30,
  cookieDays: 90,
  holdDays: 30,
  clawbackMonths: 3,
  recurring: 'lifetime',
  minPayoutUsd: 50,
  payoutDay: 1,
  rails: ['stripe', 'paypal'],
  attribution: 'last_click',
  excludedLineKinds: ['overage', 'tax', 'domain'],
  dualApprovalUsd: 5000,
};

const partnerRow = (p: Partial<PartnerRow> & Pick<PartnerRow, 'id' | 'name' | 'email' | 'slug' | 'status'>): PartnerRow => ({
  link: `${SITE}/r/${p.slug}`,
  couponCode: null,
  emailVerified: true,
  createdAt: ago({ d: 40 }),
  website: null,
  audience: null,
  pitch: null,
  statusNote: null,
  commissionPctOverride: null,
  cookieDaysOverride: null,
  accountId: null,
  approvedBy: null,
  approvedAt: null,
  payoutReady: false,
  ...p,
});

export const platformPartners = collection<PartnerRow>('platformPartners', () => [
  partnerRow({
    id: 'ppt_maya',
    name: 'Maya Lee',
    email: 'maya@creators.example',
    slug: 'maya-lee',
    status: 'Active',
    couponCode: 'MAYA20',
    website: 'https://maya.example',
    approvedBy: 'Sam Ortega',
    approvedAt: ago({ d: 38 }),
    payoutReady: true,
  }),
  partnerRow({
    id: 'ppt_jordan',
    name: 'Jordan Reyes',
    email: 'jordan@coachclub.example',
    slug: 'jordan-reyes',
    status: 'Active',
    commissionPctOverride: 35,
    approvedBy: 'Sam Ortega',
    approvedAt: ago({ d: 20 }),
  }),
  partnerRow({
    id: 'ppt_alex',
    name: 'Alex Kim',
    email: 'alex@edtechweekly.example',
    slug: 'alex-kim',
    status: 'Pending',
    createdAt: ago({ d: 2 }),
    audience: '40k newsletter readers (ed-tech)',
    pitch: 'Review + tutorial series',
    website: 'https://edtechweekly.example',
  }),
  partnerRow({
    id: 'ppt_unconfirmed',
    name: 'Riley Stone',
    email: 'riley@example.com',
    slug: 'riley-stone',
    status: 'Pending',
    emailVerified: false,
    createdAt: ago({ h: 5 }),
  }),
]);

export const platformReferrals = collection<ReferralRow>('platformReferrals', () => {
  const list = tenants.all().slice(0, 3);
  return list.map((t, i) => ({
    id: t.id,
    tenantId: t.id,
    tenantName: t.name,
    plan: t.plan,
    subscriptionStatus: 'active',
    partnerId: i === 2 ? 'ppt_jordan' : 'ppt_maya',
    partnerName: i === 2 ? 'Jordan Reyes' : 'Maya Lee',
    source: i === 1 ? 'coupon' : 'link',
    clickId: i === 1 ? null : `ppc_${String(i)}`,
    attributedAt: ago({ d: 30 - i }),
    firstPaidAt: ago({ d: 16 - i }),
    endsAt: null,
    selfReferral: false,
    voidReason: null,
    voidedAt: null,
    note: null,
    createdBy: null,
  }));
});

const commission = (n: number, r: ReferralRow, amount: number, status: CommissionRow['status'], days: number): CommissionRow => ({
  id: `pcm_${String(n)}`,
  school: r.tenantName,
  base: Math.round(amount / 0.3),
  rate: 30,
  amount,
  currency: 'USD',
  status,
  availableAt: status === 'held' ? fromNow({ d: 30 - days }) : ago({ d: days - 30 }),
  paidAmount: status === 'paid' ? amount : 0,
  paidAt: status === 'paid' ? ago({ d: 2 }) : null,
  reversedAmount: 0,
  reversedReason: null,
  due: status === 'paid' ? 0 : amount,
  frozen: false,
  createdAt: ago({ d: days }),
  partnerId: r.partnerId,
  partnerName: r.partnerName,
  tenantId: r.tenantId,
  invoiceId: `inv_${String(n)}`,
  invoiceNumber: `INV-${String(4100 + n)}`,
  payoutTransferId: null,
});

export const platformCommissions = collection<CommissionRow>('platformCommissions', () => {
  const refs = platformReferrals.all();
  const out: CommissionRow[] = [];
  refs.forEach((r, i) => {
    out.push(commission(i * 3 + 1, r, 11970, 'paid', 60));
    out.push(commission(i * 3 + 2, r, 11970, 'owed', 32));
    out.push(commission(i * 3 + 3, r, 11970, 'held', 3));
  });
  return out;
});

export const partnerTerms = singleton<PartnerTerms>('partnerTerms', () => ({ ...DEFAULTS }));
export const platformPayoutBatches = collection<BatchRow>('platformPayoutBatches', () => []);
export const platformTaxForms = collection<TaxFormRow>('platformTaxForms', () => [
  {
    id: 'ptf_maya',
    kind: 'w9',
    status: 'accepted',
    legalName: 'Maya Lee',
    country: 'US',
    tinType: 'ssn',
    tinLast4: '6789',
    signedAt: ago({ d: 37 }),
    expiresAt: null,
    reviewNote: null,
    submittedAt: ago({ d: 37 }),
    partnerId: 'ppt_maya',
    partnerName: 'Maya Lee',
  },
]);

const terms = () => partnerTerms.get();
const present = (p: PartnerRow): Partner => {
  const { payoutReady: _ready, ...rest } = p;
  return {
    ...rest,
    commissionPct: p.commissionPctOverride ?? terms().commissionPct,
    cookieDays: p.cookieDaysOverride ?? terms().cookieDays,
  };
};
const statsOf = (partnerId: string) => {
  const rows = platformCommissions.where((c) => c.partnerId === partnerId);
  const sum = (f: (c: CommissionRow) => number) => rows.reduce((s, c) => s + f(c), 0);
  return {
    clicks: 120,
    clicks30d: 34,
    signups: platformReferrals.where((r) => r.partnerId === partnerId && !r.voidReason).length,
    activeSchools: platformReferrals.where((r) => r.partnerId === partnerId && !r.voidReason && r.subscriptionStatus === 'active').length,
    held: sum((c) => (c.status === 'held' ? c.due : 0)),
    owed: sum((c) => (c.status === 'owed' && !c.frozen ? c.due : 0)),
    paid: sum((c) => c.paidAmount),
    reversed: sum((c) => c.reversedAmount),
    balance: sum((c) => (c.status !== 'held' && !c.frozen ? c.due : 0)),
  };
};
const findPartner = (pid: string) =>
  platformPartners.find(pid) ??
  (() => {
    throw notFound('Partner');
  })();
const conflict = (message: string, reason?: string) => new HttpError(409, message, undefined, 'conflict', reason ? { reason } : undefined);
const requireKey = (request: Request) => {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(request.headers.get('Idempotency-Key') ?? ''))
    throw invalid({ idempotencyKey: 'Refresh the page and try again.' });
};
const batchOut = (b: BatchRow, items: boolean): PayoutBatch => {
  const { items: list, blocked, ...rest } = b;
  const base = { ...rest, needsSecondApprover: b.total > terms().dualApprovalUsd * 100, itemCount: list.length };
  return items ? { ...base, items: list, blocked } : base;
};
const fmt = (minor: number) => `$${(minor / 100).toFixed(2)}`;

const TRANSITIONS: Record<PartnerAction, [PartnerStatus[], PartnerStatus]> = {
  approve: [['Pending', 'Declined'], 'Active'],
  decline: [['Pending'], 'Declined'],
  pause: [['Active'], 'Paused'],
  activate: [['Paused', 'Banned'], 'Active'],
  ban: [['Pending', 'Active', 'Paused', 'Declined'], 'Banned'],
};

export const handlers = [
  http.get(
    route('/partners/summary'),
    handle(() => {
      authorize('partners.view');
      const rows = platformCommissions.all();
      const sum = (f: (c: CommissionRow) => number) => rows.reduce((s, c) => s + f(c), 0);
      return ok({
        applications: platformPartners.where((p) => p.status === 'Pending' && p.emailVerified).length,
        activePartners: platformPartners.where((p) => p.status === 'Active').length,
        referrals: platformReferrals.where((r) => !r.voidReason).length,
        clicks30d: 268,
        held: sum((c) => (c.status === 'held' ? c.due : 0)),
        owed: sum((c) => (c.status === 'owed' ? c.due : 0)),
        paid: sum((c) => c.paidAmount),
        reversed: sum((c) => c.reversedAmount),
        currency: 'USD',
      });
    }),
  ),
  http.get(
    route('/partners/settings'),
    handle(() => {
      authorize('partners.view');
      return ok({ ...terms(), defaults: DEFAULTS, lineKinds: LINE_KINDS });
    }),
  ),
  http.put(
    route('/partners/settings'),
    handle(async ({ request }) => {
      authorize('partners.manage');
      requireRecentPassword();
      const body = await readBody<Partial<PartnerTerms>>(request);
      const errors: Record<string, string> = {};
      const int = (k: keyof PartnerTerms, lo: number, hi: number) => {
        const v = body[k];
        if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi))
          errors[k] = `Must be between ${String(lo)} and ${String(hi)}.`;
      };
      int('commissionPct', 1, 90);
      int('cookieDays', 1, 365);
      int('holdDays', 0, 120);
      int('clawbackMonths', 0, 24);
      int('minPayoutUsd', 0, 10000);
      int('payoutDay', 1, 28);
      int('dualApprovalUsd', 0, 1000000);
      if (body.rails && (body.rails.length === 0 || body.rails.some((r) => !PAYOUT_RAILS.includes(r))))
        errors.rails = 'Choose at least one payout method.';
      if (body.excludedLineKinds && !body.excludedLineKinds.includes('tax'))
        errors.excludedLineKinds = 'Tax is never commissionable: keep it excluded.';
      if (Object.keys(errors).length) throw invalid(errors);
      const before = terms();
      const changed = (Object.keys(body) as (keyof PartnerTerms)[]).filter(
        (k) => k in DEFAULTS && JSON.stringify(before[k]) !== JSON.stringify(body[k]),
      );
      partnerTerms.patch(body);
      if (changed.length)
        recordAudit(
          `Changed partner programme terms: ${changed.map((k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)).join(', ')}`,
          'Billing',
        );
      return ok({ ...terms(), defaults: DEFAULTS, lineKinds: LINE_KINDS });
    }),
  ),
  http.get(
    route('/partners/referrals'),
    handle(({ request }) => {
      authorize('partners.view');
      const q = query(request);
      const status = q.get('status');
      const pid = q.get('partner_id');
      const rows = platformReferrals
        .where((r) => (!pid || r.partnerId === pid) && (status === 'void' ? !!r.voidReason : status === 'active' ? !r.voidReason : true))
        .sort((a, b) => (b.attributedAt ?? '').localeCompare(a.attributedAt ?? ''))
        .map(({ id: _id, ...r }) => r);
      return paginate(rows, request);
    }),
  ),
  http.post(
    route('/partners/referrals'),
    handle(async ({ request }) => {
      authorize('partners.manage');
      const body = await readBody<{ tenantId?: string; partnerId?: string; reason?: string }>(request);
      const tenant = tenants.find(body.tenantId ?? '');
      const partner = platformPartners.find(body.partnerId ?? '');
      const reason = (body.reason ?? '').trim();
      const errors: Record<string, string> = {};
      if (!tenant) errors.tenantId = 'No such school.';
      if (partner?.status !== 'Active') errors.partnerId = 'Choose an active partner.';
      if (reason.length < 3) errors.reason = 'Say why (at least 3 characters).';
      if (Object.keys(errors).length || !tenant || !partner) throw invalid(errors);
      if (platformReferrals.find(tenant.id))
        throw conflict('This school is already attributed to a partner. Void that referral first.', 'already_attributed');
      platformReferrals.insert({
        id: tenant.id,
        tenantId: tenant.id,
        tenantName: tenant.name,
        plan: tenant.plan,
        subscriptionStatus: 'active',
        partnerId: partner.id,
        partnerName: partner.name,
        source: 'manual',
        clickId: null,
        attributedAt: new Date().toISOString(),
        firstPaidAt: null,
        endsAt: null,
        selfReferral: false,
        voidReason: null,
        voidedAt: null,
        note: reason,
        createdBy: 'Sam Ortega',
      });
      recordAudit(`Attributed ${tenant.name} to partner ${partner.name}`, 'Billing', tenant.id);
      return ok({ tenantId: tenant.id, partnerId: partner.id, source: 'manual' }, 201);
    }),
  ),
  http.post(
    route('/partners/referrals/:tenant/void'),
    handle(async ({ request, params }) => {
      authorize('partners.manage');
      const tenantId = String(params.tenant);
      const ref =
        platformReferrals.find(tenantId) ??
        (() => {
          throw notFound('Referral');
        })();
      if (ref.voidReason) throw conflict('This referral is already void.', 'already_void');
      const reason = ((await readBody<{ reason?: string }>(request)).reason ?? '').trim();
      if (reason.length < 3) throw invalid({ reason: 'Say why (at least 3 characters).' });
      let reversed = 0;
      for (const c of platformCommissions.where((x) => x.tenantId === tenantId)) {
        const target = Math.max(c.reversedAmount, c.amount - c.paidAmount);
        if (target > c.reversedAmount) {
          reversed += target - c.reversedAmount;
          platformCommissions.update(c.id, {
            reversedAmount: target,
            reversedReason: 'Referral voided',
            status: c.paidAmount > 0 ? 'paid' : 'reversed',
            due: c.amount - target - c.paidAmount,
          });
        }
      }
      platformReferrals.update(tenantId, { voidReason: reason, voidedAt: new Date().toISOString() });
      recordAudit(`Voided a partner referral (${reason}); reversed ${String(reversed)} unpaid`, 'Billing', tenantId);
      return ok({ tenantId, voidReason: reason, reversed });
    }),
  ),
  http.get(
    route('/partners/commissions'),
    handle(({ request }) => {
      authorize('partners.view');
      const q = query(request);
      const status = q.get('status');
      const pid = q.get('partner_id');
      const tid = q.get('tenant_id');
      const rows = platformCommissions
        .where((c) => (!status || c.status === status) && (!pid || c.partnerId === pid) && (!tid || c.tenantId === tid))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      return paginate(rows, request);
    }),
  ),
  http.post(
    route('/partners/commissions/:commission/reverse'),
    handle(async ({ request, params }) => {
      authorize('partners.payout');
      const c =
        platformCommissions.find(String(params.commission)) ??
        (() => {
          throw notFound('Commission');
        })();
      const body = await readBody<{ amount?: number; reason?: string }>(request);
      const errors: Record<string, string> = {};
      if (!Number.isInteger(body.amount) || (body.amount ?? 0) < 1) errors.amount = 'Enter an amount of at least 1 (minor units).';
      if ((body.reason ?? '').trim().length < 3) errors.reason = 'Say why (at least 3 characters).';
      if (Object.keys(errors).length) throw invalid(errors);
      const target = Math.min(c.amount, c.reversedAmount + (body.amount ?? 0));
      const reversed = target - c.reversedAmount;
      platformCommissions.update(c.id, {
        reversedAmount: target,
        reversedReason: body.reason ?? null,
        due: c.amount - target - c.paidAmount,
        status: target >= c.amount ? 'reversed' : c.status,
      });
      if (reversed > 0)
        recordAudit(`Reversed ${String(reversed)} (minor units) of commission ${c.id}: ${body.reason ?? ''}`, 'Billing', c.tenantId);
      return ok({ id: c.id, reversed });
    }),
  ),

  // Payout batches (literal paths before /:id).
  http.get(
    route('/partners/payout-batches/funding'),
    handle(() => {
      authorize('partners.view');
      return ok({
        currency: 'USD',
        stripeBalance: 2_450_000,
        minimum: terms().minPayoutUsd * 100,
        dualApproval: terms().dualApprovalUsd * 100,
        payoutDay: terms().payoutDay,
        rails: terms().rails.map((rail) => ({
          rail,
          available: rail === 'stripe',
          reason: rail === 'stripe' ? null : 'Connect PayPal Payouts first.',
        })),
      });
    }),
  ),
  http.get(
    route('/partners/payout-batches'),
    handle(({ request }) => {
      authorize('partners.view');
      const rows = [...platformPayoutBatches.all()]
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .map((b) => batchOut(b, false));
      return paginate(rows, request);
    }),
  ),
  http.get(
    route('/partners/payout-batches/:batch'),
    handle(({ params }) => {
      authorize('partners.view');
      const b =
        platformPayoutBatches.find(String(params.batch)) ??
        (() => {
          throw notFound('Payout batch');
        })();
      return ok(batchOut(b, true));
    }),
  ),
  http.post(
    route('/partners/payout-batches'),
    handle(({ request }) => {
      const user = authorize('partners.payout');
      requireKey(request);
      const minimum = terms().minPayoutUsd * 100;
      const items: PayoutItem[] = [];
      const blocked: BlockedPayee[] = [];
      const batchId = id('pyb');
      for (const p of platformPartners.where((x) => x.status === 'Active' || x.status === 'Paused')) {
        const due = platformCommissions.where((c) => c.partnerId === p.id && c.status === 'owed' && !c.frozen && !c.payoutTransferId);
        const amount = due.reduce((s, c) => s + c.due, 0);
        if (amount < minimum || amount <= 0) continue;
        const hasForm =
          platformTaxForms.where((f) => f.partnerId === p.id && (f.status === 'accepted' || f.status === 'submitted')).length > 0;
        if (!p.payoutReady || !hasForm) {
          blocked.push({
            id: p.id,
            name: p.name,
            code: p.payoutReady ? 'tax_form_missing' : 'no_payout_method',
            reason: p.payoutReady ? 'No valid tax form on file.' : 'Hasn’t set up a payout method yet.',
            amount,
          });
          continue;
        }
        const tid = id('ptr');
        due.forEach((c) => platformCommissions.update(c.id, { payoutTransferId: tid }));
        items.push({
          id: tid,
          batchId,
          payeeId: p.id,
          payeeName: p.name,
          rail: 'stripe',
          amount,
          currency: 'USD',
          status: 'queued',
          reference: null,
          providerRef: null,
          failureCode: null,
          failureMessage: null,
          reversedAmount: 0,
          attempt: 0,
          sentAt: null,
          settledAt: null,
        });
      }
      if (items.length === 0) throw conflict('No partner is due a payout yet.');
      const total = items.reduce((s, i) => s + i.amount, 0);
      const row: BatchRow = {
        id: batchId,
        period: new Date().toISOString().slice(0, 7),
        status: 'draft',
        total,
        currency: 'USD',
        railTotals: { stripe: total },
        blockedCount: blocked.length,
        fundedAmount: 0,
        fundingFee: 0,
        creditApplied: 0,
        createdAt: new Date().toISOString(),
        approvedAt: null,
        fundedAt: null,
        completedAt: null,
        needsSecondApprover: false,
        createdBy: user.id,
        approvedBy: null,
        items,
        blocked,
      };
      platformPayoutBatches.insert(row);
      recordAudit(`Drafted a partner payout batch of ${fmt(total)}`, 'Billing');
      return ok(batchOut(row, true), 201);
    }),
  ),
  ...(['approve', 'send', 'cancel'] as const).map((action) =>
    http.post(
      route(`/partners/payout-batches/:batch/${action}`),
      handle(({ request, params }) => {
        const user = authorize('partners.payout');
        requireKey(request);
        const b =
          platformPayoutBatches.find(String(params.batch)) ??
          (() => {
            throw notFound('Payout batch');
          })();
        if (action === 'approve') {
          if (b.status !== 'draft') throw conflict('Only a draft batch can be approved.');
          if (b.total > terms().dualApprovalUsd * 100 && b.createdBy === user.id)
            throw new HttpError(
              403,
              'Batches over the four-eyes threshold need a second approver: someone else with payout permission must approve it.',
              undefined,
              'forbidden',
              { reason: 'second_approver_required' },
            );
          platformPayoutBatches.update(b.id, { status: 'approved', approvedAt: new Date().toISOString(), approvedBy: user.id });
          recordAudit(`Approved partner payout batch ${b.id} (${fmt(b.total)})`, 'Billing');
        } else if (action === 'send') {
          if (b.status === 'draft') throw conflict('Approve the batch before sending it.');
          const now = new Date().toISOString();
          platformPayoutBatches.update(b.id, {
            status: 'completed',
            fundedAt: now,
            completedAt: now,
            fundedAmount: b.total,
            items: b.items.map((i) => ({ ...i, status: 'paid', sentAt: now, settledAt: now })),
          });
          for (const i of b.items)
            for (const c of platformCommissions.where((x) => x.payoutTransferId === i.id))
              platformCommissions.update(c.id, { paidAmount: c.amount - c.reversedAmount, paidAt: now, status: 'paid', due: 0 });
          recordAudit(`Sent partner payout batch ${b.id} (${fmt(b.total)})`, 'Billing');
        } else {
          if (!['draft', 'approved'].includes(b.status)) throw conflict('Only a draft or approved batch can be canceled.');
          for (const i of b.items)
            for (const c of platformCommissions.where((x) => x.payoutTransferId === i.id))
              platformCommissions.update(c.id, { payoutTransferId: null });
          platformPayoutBatches.update(b.id, { status: 'canceled', items: b.items.map((i) => ({ ...i, status: 'canceled' })) });
          recordAudit(`Canceled partner payout batch ${b.id} (${fmt(b.total)})`, 'Billing');
        }
        return ok(batchOut(platformPayoutBatches.find(b.id) ?? b, true));
      }),
    ),
  ),
  http.post(
    route('/partners/payout-transfers/:transfer/retry'),
    handle(({ request, params }) => {
      authorize('partners.payout');
      requireKey(request);
      const b =
        platformPayoutBatches.where((x) => x.items.some((i) => i.id === String(params.transfer)))[0] ??
        (() => {
          throw notFound('Payout');
        })();
      const item = b.items.find((i) => i.id === String(params.transfer));
      if (!item || !['failed', 'returned'].includes(item.status)) throw conflict('Only a failed payout can be retried.');
      platformPayoutBatches.update(b.id, {
        items: b.items.map((i) => (i.id === item.id ? { ...i, status: 'queued', attempt: i.attempt + 1 } : i)),
      });
      recordAudit(`Retried a partner payout of ${fmt(item.amount)}`, 'Billing');
      return ok(batchOut(platformPayoutBatches.find(b.id) ?? b, true));
    }),
  ),

  // Tax forms. The 1099-NEC worksheet needs payout permission and a recent password (it opens the TINs); audited.
  http.get(
    route('/partners/tax-forms/1099.csv'),
    handle(({ request }) => {
      authorize('partners.payout');
      requireRecentPassword();
      const year = Number(query(request).get('year'));
      if (!Number.isInteger(year) || year < 2020 || year > new Date().getFullYear()) throw invalid({ year: 'Choose a tax year.' });
      const rows = platformTaxForms.where((f) => f.kind === 'w9' && f.status === 'accepted');
      recordAudit(`Exported the ${String(year)} partner 1099-NEC worksheet (${String(rows.length)} payees)`, 'Billing');
      const csv = [
        'Form Type,Tax Year,Recipient TIN Type,Recipient TIN,Recipient Name,Box 1 Nonemployee Compensation,Currency,Partner ID',
        ...rows.map(
          (f) => `1099-NEC,${String(year)},${(f.tinType ?? '').toUpperCase()},123456789,${f.legalName},2400.00,USD,${f.partnerId}`,
        ),
      ].join('\n');
      return new HttpResponse(csv, {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="partners-1099-nec-${String(year)}.csv"` },
      });
    }),
  ),
  // Tax forms.
  http.get(
    route('/partners/tax-forms'),
    handle(() => {
      authorize('partners.view');
      return ok({ threshold: 2000, forms: platformTaxForms.where((f) => f.status !== 'superseded') });
    }),
  ),
  ...(['accept', 'reject'] as const).map((action) =>
    http.post(
      route(`/partners/tax-forms/:form/${action}`),
      handle(async ({ request, params }) => {
        authorize('partners.payout');
        const f =
          platformTaxForms.find(String(params.form)) ??
          (() => {
            throw notFound('Tax form');
          })();
        const note = ((await readBody<{ note?: string }>(request)).note ?? '').trim();
        if (action === 'reject' && note.length < 3) throw invalid({ note: 'Tell the partner what to fix.' });
        platformTaxForms.update(f.id, {
          status: action === 'accept' ? 'accepted' : 'rejected',
          reviewNote: action === 'reject' ? note : null,
        });
        recordAudit(`${action === 'accept' ? 'Accepted' : 'Rejected'} the tax form of ${f.partnerName ?? 'a partner'}`, 'Billing');
        return ok(platformTaxForms.find(f.id));
      }),
    ),
  ),

  // Partners (literal paths above; /:partner last).
  http.get(
    route('/partners'),
    handle(({ request }) => {
      authorize('partners.view');
      const q = query(request);
      const status = q.get('status');
      const apps = q.get('applications') === '1' || q.get('applications') === 'true';
      if (status && !PARTNER_STATUSES.includes(status as PartnerStatus)) throw invalid({ status: 'The selected status is invalid.' });
      const rows = platformPartners
        .where((p) => (!apps || (p.status === 'Pending' && p.emailVerified)) && (!status || p.status === status))
        .filter((p) => !q.search || `${p.name} ${p.email} ${p.slug}`.toLowerCase().includes(q.search))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .map(present);
      return paginate(rows, request);
    }),
  ),
  http.get(
    route('/partners/:partner'),
    handle(({ params }) => {
      authorize('partners.view');
      const p = findPartner(String(params.partner));
      return ok({ ...present(p), stats: statsOf(p.id) });
    }),
  ),
  http.patch(
    route('/partners/:partner'),
    handle(async ({ request, params }) => {
      authorize('partners.manage');
      const p = findPartner(String(params.partner));
      const body = await readBody<{
        name?: string;
        website?: string | null;
        commissionPct?: number | null;
        cookieDays?: number | null;
        couponCode?: string | null;
        accountEmail?: string | null;
      }>(request);
      const errors: Record<string, string> = {};
      const patch: Partial<PartnerRow> = {};
      if (body.name !== undefined) {
        if (body.name.trim().length < 2) errors.name = 'The name must be at least 2 characters.';
        else patch.name = body.name.trim();
      }
      if (body.commissionPct !== undefined) {
        if (body.commissionPct !== null && (body.commissionPct < 1 || body.commissionPct > 90)) errors.commissionPct = 'Between 1 and 90.';
        else patch.commissionPctOverride = body.commissionPct;
      }
      if (body.cookieDays !== undefined) {
        if (body.cookieDays !== null && (!Number.isInteger(body.cookieDays) || body.cookieDays < 1 || body.cookieDays > 365))
          errors.cookieDays = 'Between 1 and 365 days.';
        else patch.cookieDaysOverride = body.cookieDays;
      }
      if (body.couponCode !== undefined) {
        const code = body.couponCode === null || body.couponCode === '' ? null : body.couponCode.toUpperCase();
        if (code !== null && !/^[A-Z0-9-]{3,40}$/.test(code)) errors.couponCode = 'Use 3–40 letters, numbers or hyphens.';
        else if (code !== null && platformPartners.where((x) => x.couponCode === code && x.id !== p.id).length)
          errors.couponCode = 'Another partner already uses this code.';
        else patch.couponCode = code;
      }
      if (body.website !== undefined) patch.website = body.website || null;
      if (body.accountEmail !== undefined && body.accountEmail) {
        const t = tenants.where((x) => x.ownerEmail.toLowerCase() === (body.accountEmail ?? '').toLowerCase())[0];
        if (!t) errors.accountEmail = 'No Coursiva account uses this email.';
        else patch.accountId = `acc_${t.id}`;
      } else if (body.accountEmail === null) patch.accountId = null;
      if (Object.keys(errors).length) throw invalid(errors);
      platformPartners.update(p.id, patch);
      recordAudit(`Updated partner ${p.name}`, 'Billing');
      const next = findPartner(p.id);
      return ok({ ...present(next), stats: statsOf(p.id) });
    }),
  ),
  ...(Object.keys(TRANSITIONS) as PartnerAction[]).map((action) =>
    http.post(
      route(`/partners/:partner/${action}`),
      handle(async ({ request, params }) => {
        authorize('partners.manage');
        const p = findPartner(String(params.partner));
        const [from, to] = TRANSITIONS[action];
        if (!from.includes(p.status)) throw conflict(`This partner is ${p.status}.`, 'invalid_status');
        if (action === 'approve' && !p.emailVerified)
          throw conflict('The applicant hasn’t confirmed their email yet.', 'email_unconfirmed');
        const note = (await readBody<{ note?: string }>(request)).note ?? null;
        platformPartners.update(p.id, {
          status: to,
          statusNote: note,
          ...(action === 'approve' ? { approvedBy: 'Sam Ortega', approvedAt: new Date().toISOString() } : {}),
        });
        const past = { approve: 'Approved', decline: 'Declined', pause: 'Paused', activate: 'Reactivated', ban: 'Banned' }[action];
        recordAudit(`${past} partner ${p.name}`, 'Billing');
        return ok(present(findPartner(p.id)));
      }),
    ),
  ),
];
