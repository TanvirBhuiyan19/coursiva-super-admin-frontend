// Mock implementation of /extensions (what the Laravel ExtensionController will do).
// Plan inclusion lives in the shared `extensionInclusions` table (Plan entitlements and the tenant
// drawer read it); prices, visibility, bundle and selling rules are extension-only settings.
import { http, HttpResponse } from 'msw';
import { extensionInclusions, extensionSettings, tenants } from '@/mocks/collections';
import { extensionPlans, extensionPrice } from '@/mocks/derive';
import { authorize, handle, invalid, notFound, ok, paginate, readBody, recordAudit, route } from '@/mocks/http';
import { EXTENSIONS, type ExtensionDef } from '@/mocks/reference';
import { PLAN_RANK, PLANS, type Plan } from '@/lib/domain';
import {
  EXTENSION_TRIAL_DAYS,
  SELLING_RULES,
  type Extension,
  type ExtensionSettings,
  type ExtensionSettingsUpdate,
  type ExtensionSummary,
  type ExtensionUpdate,
  type SellingRuleKey,
} from './types';

const RULES: Record<SellingRuleKey, [label: string, description: string]> = {
  self_serve: ['Let tenants self-serve', 'Install and cancel without contacting support.'],
  prorate: ['Prorate mid-cycle adds', 'Charge only the remaining days on the current invoice.'],
  retain_data: ['Keep data after removal', 'Hold content for 30 days so a re-install restores it.'],
  auto_include_on_upgrade: [
    'Auto-include on plan upgrade',
    'Paid extensions become included when a tenant moves to a plan that covers them.',
  ],
};

/** Extension settings — the shared `extensionSettings` table (the tenant drawer reads prices from it). */
export const extensionStore = extensionSettings;

const TRIAL_CONVERSION_PCT = 62;

const priceOf = (e: ExtensionDef) => extensionPrice(e);

function toExtension(e: ExtensionDef): Extension {
  const all = tenants.all();
  const includedPlans = extensionPlans(e.key);
  const payingTenants = all.filter((t) => !includedPlans.includes(t.plan)).length;
  const payingInstalls = Math.min(e.installs, payingTenants);
  const hidden = extensionStore.get().hidden.includes(e.key);
  const price = priceOf(e);
  return {
    key: e.key,
    name: e.name,
    category: e.category,
    blurb: e.blurb,
    module: e.module,
    gatesModule: e.gatesModule,
    price,
    status: hidden ? 'Hidden' : e.status,
    hidden,
    includedPlans,
    installs: e.installs,
    payingInstalls,
    freeInstalls: e.installs - payingInstalls,
    mrr: price * payingInstalls,
    attachPct: all.length ? Math.round((e.installs / all.length) * 100) : 0,
  };
}

const rows = () => EXTENSIONS.map(toExtension);

function summary(): ExtensionSummary {
  const all = tenants.all();
  const visible = rows().filter((r) => !r.hidden);
  const mrr = visible.reduce((s, r) => s + r.mrr, 0);
  const tenantsWithAny = all.filter(
    (t) => t.paidExtensions.length > 0 || t.compedExtensions.length > 0 || visible.some((r) => r.includedPlans.includes(t.plan)),
  ).length;
  return {
    mrr,
    payingInstalls: visible.reduce((s, r) => s + r.payingInstalls, 0),
    freeInstalls: visible.reduce((s, r) => s + r.freeInstalls, 0),
    tenants: all.length,
    tenantsWithAny,
    attachPct: all.length ? Math.round((tenantsWithAny / all.length) * 100) : 0,
    avgPerTenant: tenantsWithAny ? Math.round(mrr / tenantsWithAny) : 0,
    trialConversionPct: TRIAL_CONVERSION_PCT,
    extensions: EXTENSIONS.length,
    categories: new Set(EXTENSIONS.map((e) => e.category)).size,
  };
}

function settings(): ExtensionSettings {
  const s = extensionStore.get();
  const separatePrice = rows()
    .filter((r) => !r.hidden)
    .reduce((n, r) => n + r.price, 0);
  return {
    bundlePrice: s.bundlePrice,
    separatePrice,
    bundleDiscountPct: separatePrice ? Math.max(0, Math.round((1 - s.bundlePrice / separatePrice) * 100)) : 0,
    trialDays: s.trialDays as ExtensionSettings['trialDays'],
    rules: SELLING_RULES.map((key) => ({ key, label: RULES[key][0], description: RULES[key][1], enabled: !s.rulesOff.includes(key) })),
  };
}

function findExtension(key: string | readonly string[] | undefined) {
  const e = typeof key === 'string' ? EXTENSIONS.find((x) => x.key === key) : undefined;
  if (!e) throw notFound('Extension');
  return e;
}

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const trialLabel = (d: number) => (d ? `${d} days` : 'no trial');

type Params = { key: string };

export const handlers = [
  http.get(
    route('/extensions/summary'),
    handle(() => {
      authorize('billing.view');
      return ok(summary());
    }),
  ),

  http.get(
    route('/extensions/settings'),
    handle(() => {
      authorize('billing.view');
      return ok(settings());
    }),
  ),

  http.patch(
    route('/extensions/settings'),
    handle(async ({ request }) => {
      authorize('billing.manage');
      const body = await readBody<ExtensionSettingsUpdate>(request);
      const s = extensionStore.get();
      const errors: Record<string, string> = {};
      if (body.bundlePrice !== undefined && (!isWhole(body.bundlePrice) || body.bundlePrice < 1 || body.bundlePrice > 9999))
        errors.bundlePrice = 'The bundle price must be a whole number between $1 and $9,999.';
      if (body.trialDays !== undefined && !(EXTENSION_TRIAL_DAYS as readonly number[]).includes(body.trialDays))
        errors.trialDays = 'Choose no trial, 7, 14 or 30 days.';
      (body.rules ?? []).forEach((r, i) => {
        if (!SELLING_RULES.includes(r.key)) errors[`rules.${i}.key`] = 'Unknown selling rule.';
        else if (typeof r.enabled !== 'boolean') errors[`rules.${i}.enabled`] = 'Enabled must be true or false.';
      });
      if (Object.keys(errors).length) throw invalid(errors);

      if (body.bundlePrice !== undefined && body.bundlePrice !== s.bundlePrice) {
        recordAudit(`Changed all-access bundle price from $${s.bundlePrice} to $${body.bundlePrice}/mo`, 'Billing');
        extensionStore.patch({ bundlePrice: body.bundlePrice });
      }
      if (body.trialDays !== undefined && body.trialDays !== s.trialDays) {
        recordAudit(`Set the extension free trial to ${trialLabel(body.trialDays)}`, 'Billing');
        extensionStore.patch({ trialDays: body.trialDays });
      }
      for (const r of body.rules ?? []) {
        const off = extensionStore.get().rulesOff;
        if (r.enabled === !off.includes(r.key)) continue;
        extensionStore.patch({ rulesOff: r.enabled ? off.filter((k) => k !== r.key) : [...off, r.key] });
        recordAudit(`${r.enabled ? 'Turned on' : 'Turned off'} extension selling rule "${RULES[r.key][0]}"`, 'Billing');
      }
      return ok(settings());
    }),
  ),

  // CSV of installs and MRR per extension.
  http.get(
    route('/extensions/export'),
    handle(() => {
      authorize('billing.view');
      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const list = rows();
      const csv = [
        ['Extension', 'Category', 'Status', 'Price', 'Free on', 'Installs', 'Paying', 'Free', 'MRR', 'Attach %'].map(esc).join(','),
        ...list.map((r) =>
          [
            r.name,
            r.category,
            r.status,
            r.price,
            r.includedPlans.join(' ') || '—',
            r.installs,
            r.payingInstalls,
            r.freeInstalls,
            r.mrr,
            r.attachPct,
          ]
            .map(esc)
            .join(','),
        ),
      ].join('\n');
      recordAudit(`Exported extension revenue for ${list.length} extensions`, 'Billing');
      return new HttpResponse(csv, {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="extension-revenue.csv"' },
      });
    }),
  ),

  http.get(
    route('/extensions'),
    handle(({ request }) => {
      authorize('billing.view');
      return paginate(rows(), request);
    }),
  ),

  http.get<Params>(
    route('/extensions/:key'),
    handle<Params>(({ params }) => {
      authorize('billing.view');
      return ok(toExtension(findExtension(params.key)));
    }),
  ),

  http.patch<Params>(
    route('/extensions/:key'),
    handle<Params>(async ({ request, params }) => {
      authorize('billing.manage');
      const e = findExtension(params.key);
      const body = await readBody<ExtensionUpdate>(request);
      const errors: Record<string, string> = {};
      if (body.price !== undefined && (!isWhole(body.price) || body.price < 1 || body.price > 999))
        errors.price = 'The price must be a whole number between $1 and $999.';
      if (body.hidden !== undefined && typeof body.hidden !== 'boolean') errors.hidden = 'Hidden must be true or false.';
      if (Object.keys(errors).length) throw invalid(errors);
      const s = extensionStore.get();
      if (body.price !== undefined && body.price !== priceOf(e)) {
        recordAudit(`Changed ${e.name} price from $${priceOf(e)} to $${body.price}/mo`, 'Billing');
        extensionStore.patch({ prices: { ...s.prices, [e.key]: body.price } });
      }
      if (body.hidden !== undefined && body.hidden !== s.hidden.includes(e.key)) {
        extensionStore.patch({ hidden: body.hidden ? [...s.hidden, e.key] : s.hidden.filter((k) => k !== e.key) });
        recordAudit(
          body.hidden ? `Hid ${e.name} from the extension catalogue` : `Published ${e.name} in the extension catalogue`,
          'Billing',
        );
      }
      return ok(toExtension(e));
    }),
  ),

  // Which plans get the extension free. Writes the shared inclusion table.
  http.put<Params>(
    route('/extensions/:key/plans'),
    handle<Params>(async ({ request, params }) => {
      authorize('billing.manage');
      const e = findExtension(params.key);
      const { plans } = await readBody<{ plans: Plan[] }>(request);
      if (!Array.isArray(plans) || plans.some((p) => !PLANS.includes(p)))
        throw invalid({ plans: 'Choose plans from Launch, Growth and Scale.' });
      const next = [...new Set(plans)].sort((a, b) => PLAN_RANK[a] - PLAN_RANK[b]);
      const prev = extensionPlans(e.key);
      extensionInclusions.set({ ...extensionInclusions.get(), [e.key]: next });
      const added = next.filter((p) => !prev.includes(p));
      const removed = prev.filter((p) => !next.includes(p));
      if (added.length) recordAudit(`${e.name}: included free on ${added.join(', ')}`, 'Billing');
      if (removed.length) recordAudit(`${e.name}: now charged on ${removed.join(', ')}`, 'Billing');
      return ok(toExtension(e));
    }),
  ),
];
