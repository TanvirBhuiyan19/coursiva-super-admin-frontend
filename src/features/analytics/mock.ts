// Mock API for the analytics screens. Tenant-derived figures are computed from the shared `tenants`
// table with the rules in `mocks/derive.ts`; platform telemetry lives in feature tables below.
import { http } from 'msw';
import { PLANS, type Plan } from '@/lib/domain';
import { flags, overages, tenants, type TenantRow } from '@/mocks/collections';
import { collection, ago, singleton } from '@/mocks/db';
import { tenantHealth, tenantHealthScore, tenantMrr } from '@/mocks/derive';
import { authorize, handle, invalid, notFound, ok, readBody, recordAudit, route } from '@/mocks/http';
import {
  AI_FEATURES,
  ROUTING_POLICIES,
  type AiFeature,
  type AiSettingsInput,
  type AiUsage,
  type Experiment,
  type Experiments,
  type Growth,
  type Health,
  type JobQueue,
  type OnboardingStage,
  type RoutingPolicy,
  type Usage,
  type UsageMeter,
} from './types';

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
const monthStart = (offset: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
};

// ======================================================================
// Growth
// ======================================================================

/** Quarter-over-quarter survey/finance metrics (would come from the warehouse). */
const GROWTH_KPIS = {
  trialConversionPct: 38,
  trialConversionDeltaPts: 4,
  netRevenueRetentionPct: 112,
  netRevenueRetentionDeltaPts: 3,
  nps: 54,
  npsDelta: 6,
  logoChurnPct: 2.1,
  logoChurnDeltaPts: -0.4,
};

/** Retention curves for the last six signup cohorts, oldest first. */
const COHORT_CURVES = [[100, 68, 54, 47, 43, 41], [100, 71, 58, 50, 46], [100, 74, 60, 53], [100, 76, 63], [100, 79], [100]];

/** Onboarding stage shape: 100 = every tenant, 38 = only paying tenants (interpolated between). */
const ONBOARDING_SHAPE: [OnboardingStage, number][] = [
  ['provisioned', 100],
  ['branding', 88],
  ['first_course', 71],
  ['first_sale', 50],
  ['paid', 38],
];

/** Growth's health list: the shared tenant health score, with its falling signals as the driver text. */
function healthScore(t: TenantRow) {
  const { score, drivers } = tenantHealthScore(t);
  const downs = drivers.filter((d) => d.trend === 'down').map((d) => `${d.label}: ${d.value}`);
  const reasons = t.status === 'Trial' || t.status === 'Suspended' ? [tenantHealth(t).reason ?? '', ...downs] : downs;
  return { score, driver: reasons.length ? reasons.join(' · ') : 'All signals healthy' };
}

function growth(): Growth {
  const all = tenants.all();
  const paying = all.filter((t) => tenantMrr(t) > 0);
  const mrr = paying.reduce((s, t) => s + tenantMrr(t), 0);

  // Acquisition funnel: anchored on real conversions and live trials, scaled up the funnel with benchmark rates.
  const since = Date.now() - 90 * DAY;
  const converted = Math.max(1, all.filter((t) => new Date(t.createdAt).getTime() >= since).length);
  const trials = converted + all.filter((t) => t.status === 'Trial').length + 2;
  const activated = Math.round(trials / 0.53);
  const signups = Math.round(activated / 0.62);
  const visitors = Math.round(signups / 0.04);
  const counts = [visitors, signups, activated, trials, converted];
  const funnel = (['visitors', 'signups', 'activated', 'trials', 'converted'] as const).map((stage, i) => {
    const prev = i > 0 ? counts[i - 1]! : 0;
    return { stage, count: counts[i]!, ratePct: i > 0 && prev ? round1((counts[i]! / prev) * 100) : null };
  });

  // Onboarding: the last stage equals paying tenants; earlier stages interpolate up to every tenant.
  const floor = all.length ? paying.length / all.length : 0;
  const onboarding = ONBOARDING_SHAPE.map(([stage, shape]) => {
    const share = floor + ((1 - floor) * (shape - 38)) / 62;
    return { stage, tenants: Math.max(paying.length, Math.round(all.length * share)) };
  });
  const candidates = [...all].sort(
    (x, y) => (x.status === 'Trial' ? -1 : y.status === 'Trial' ? 1 : 0) || x.students - y.students || x.name.localeCompare(y.name),
  );
  const stuck: Growth['stuck'] = [];
  let next = 0;
  onboarding.forEach((sg, i) => {
    if (i === 0) return;
    const gap = onboarding[i - 1]!.tenants - sg.tenants;
    for (let k = 0; k < gap && next < candidates.length; k++) {
      const t = candidates[next++]!;
      stuck.push({ tenantId: t.id, name: t.name, stage: sg.stage, days: Math.min(daysSince(t.createdAt), 11 + (t.name.length % 14)) });
    }
  });

  return {
    kpis: { revenuePerTenant: paying.length ? Math.round(mrr / paying.length) : 0, payingTenants: paying.length, ...GROWTH_KPIS },
    funnel,
    cohorts: COHORT_CURVES.map((retention, i) => ({ month: monthStart(i - COHORT_CURVES.length), retention })),
    healthScores: all
      .map((t) => ({ tenantId: t.id, name: t.name, ...healthScore(t) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    onboarding,
    stuck,
    totalTenants: all.length,
  };
}

// ======================================================================
// Usage & infrastructure
// ======================================================================

interface TenantUsageRow {
  /** Tenant id. */
  id: string;
  storageGb: number;
  bandwidthGb: number;
  videoMinutes: number;
  apiRequests: number;
}
const U = (id: string, storageTb: number, bandwidthTb: number, videoK: number, apiM: number): TenantUsageRow => ({
  id,
  storageGb: storageTb * 1000,
  bandwidthGb: bandwidthTb * 1000,
  videoMinutes: videoK * 1000,
  apiRequests: apiM * 1_000_000,
});
/** Metered usage this month per tenant (tenants without a row have used nothing yet). */
export const tenantUsage = collection<TenantUsageRow>('analyticsTenantUsage', () => [
  U('tn_peak', 18.2, 41, 640, 21),
  U('tn_nordic', 12.6, 28, 415, 14),
  U('tn_devpath', 9.8, 22, 380, 18),
  U('tn_amplify', 6.1, 14, 210, 9),
  U('tn_silva', 4.2, 9, 150, 6),
  U('tn_atlas', 5.3, 13, 60, 8),
  U('tn_northstar', 4.1, 12, 45, 5),
  U('tn_kodo', 0.9, 4, 12, 1.5),
  U('tn_ledger', 0.7, 3, 6, 1),
  U('tn_bloom', 0.5, 2, 2, 0.5),
]);

/** Provisioned platform capacity per meter (same units as `Usage.capacity`). */
export const platformCapacity = singleton<Record<'storageGb' | 'bandwidthGb' | 'videoMinutes' | 'apiRequests', number>>(
  'analyticsCapacity',
  () => ({ storageGb: 100_000, bandwidthGb: 250_000, videoMinutes: 2_200_000, apiRequests: 150_000_000 }),
);

const METER_FIELD: Record<UsageMeter, keyof Omit<TenantUsageRow, 'id'>> = {
  storage: 'storageGb',
  bandwidth: 'bandwidthGb',
  transcode: 'videoMinutes',
  api_requests: 'apiRequests',
};

function usage(): Usage {
  const rows = tenants.all().map((t) => ({ t, u: tenantUsage.find(t.id) ?? U(t.id, 0, 0, 0, 0) }));
  const cap = platformCapacity.get();
  const meters = Object.entries(METER_FIELD) as [UsageMeter, keyof Omit<TenantUsageRow, 'id'>][];
  const totals = Object.fromEntries(meters.map(([, f]) => [f, rows.reduce((s, r) => s + r.u[f], 0)])) as Record<
    keyof Omit<TenantUsageRow, 'id'>,
    number
  >;
  const capacity = meters.map(([meter, f]) => {
    const usedPct = cap[f] ? Math.round((totals[f] / cap[f]) * 100) : 0;
    return { meter, used: round1(totals[f]), capacity: cap[f], usedPct, nearLimit: usedPct >= 80 };
  });
  const unbilled = overages.where((o) => !o.billedAt);
  const topConsumers = rows
    .map(({ t, u }) => {
      const share = meters.reduce((s, [, f]) => s + (totals[f] ? u[f] / totals[f] : 0), 0) / meters.length;
      const ov = unbilled.find((o) => o.tenantId === t.id);
      return {
        tenantId: t.id,
        name: t.name,
        storageGb: u.storageGb,
        bandwidthGb: u.bandwidthGb,
        videoMinutes: u.videoMinutes,
        apiRequests: u.apiRequests,
        sharePct: Math.round(share * 100),
        overage: ov ? { meter: ov.meter, amount: ov.amount } : null,
      };
    })
    .filter((r) => r.sharePct > 0)
    .sort((a, b) => b.sharePct - a.sharePct || a.name.localeCompare(b.name))
    .slice(0, 5);
  return { period: monthStart(0), capacity, topConsumers };
}

// ======================================================================
// System health
// ======================================================================

const SERVICES: Health['services'] = [
  { id: 'api', name: 'API core', status: 'Operational', uptimePct: 99.98, p95Ms: 142, note: null },
  { id: 'cdn', name: 'Video delivery (CDN)', status: 'Operational', uptimePct: 99.99, p95Ms: 38, note: null },
  { id: 'payments', name: 'Checkout & payments', status: 'Operational', uptimePct: 99.95, p95Ms: 310, note: null },
  {
    id: 'email',
    name: 'Email delivery',
    status: 'Degraded',
    uptimePct: 99.72,
    p95Ms: null,
    note: 'Elevated soft bounces at one provider — traffic failing over.',
  },
  { id: 'search', name: 'Search & discovery', status: 'Operational', uptimePct: 99.97, p95Ms: 88, note: null },
  { id: 'webhooks', name: 'Webhooks', status: 'Operational', uptimePct: 99.91, p95Ms: 204, note: null },
];

const DELIVERABILITY: Health['deliverability'] = { deliveredPct: 99.21, softBouncePct: 0.62, hardBouncePct: 0.14, complaintPct: 0.03 };

interface QueueRow extends JobQueue {
  /** Queue name. */
  id: string;
}
export const jobQueues = collection<QueueRow>('analyticsJobQueues', () => [
  { id: 'default', name: 'default', depth: 12, failed: 0 },
  { id: 'emails', name: 'emails', depth: 148, failed: 23 },
  { id: 'video-transcode', name: 'video-transcode', depth: 36, failed: 4 },
  { id: 'webhooks', name: 'webhooks', depth: 9, failed: 11 },
]);
const toQueue = (q: QueueRow): JobQueue => ({ name: q.name, depth: q.depth, failed: q.failed });

// ======================================================================
// AI usage & cost
// ======================================================================

/** Thousand tokens included per month in each plan. */
export const AI_ALLOWANCE_K: Record<Plan, number> = { Launch: 150, Growth: 600, Scale: 1500 };
/** Our model cost per 1k tokens, and what we bill tenants per 1k above their allowance. */
export const AI_COST_PER_1K = 0.42;
export const AI_BILLED_PER_1K = 0.6;

const ROUTING_LABEL: Record<RoutingPolicy, string> = {
  cost_first: 'Cost-first',
  balanced: 'Balanced',
  quality_first: 'Quality-first',
};

export interface AiSettingsRow {
  monthlyCap: number;
  routingPolicy: RoutingPolicy;
  throttledTenantIds: string[];
}
export const aiSettings = singleton<AiSettingsRow>('analyticsAiSettings', () => ({
  monthlyCap: 2500,
  routingPolicy: 'cost_first',
  throttledTenantIds: [],
}));

interface AiUsageRow {
  /** Tenant id. */
  id: string;
  tokensK: number;
  topFeature: AiFeature;
}
/** AI tokens used this month by tenants that have AI studio. */
export const aiUsageRows = collection<AiUsageRow>('analyticsAiUsage', () => [
  { id: 'tn_amplify', tokensK: 240, topFeature: 'outlines' },
  { id: 'tn_nordic', tokensK: 620, topFeature: 'quizzes' },
  { id: 'tn_devpath', tokensK: 1980, topFeature: 'summaries' },
  { id: 'tn_silva', tokensK: 180, topFeature: 'outlines' },
  { id: 'tn_northstar', tokensK: 92, topFeature: 'chat' },
  { id: 'tn_atlas', tokensK: 640, topFeature: 'quizzes' },
  { id: 'tn_peak', tokensK: 55, topFeature: 'summaries' },
]);

/** How a tenant's tokens split across features: 55% on their heaviest feature, the rest in fixed order. */
const featureSplit = (top: AiFeature) => {
  const rest = AI_FEATURES.filter((f) => f !== top);
  return [{ feature: top, share: 0.55 }, ...rest.map((feature, i) => ({ feature, share: [0.2, 0.15, 0.1][i] ?? 0 }))];
};

function aiUsage(): AiUsage {
  const s = aiSettings.get();
  const rows = aiUsageRows
    .all()
    .map((u) => ({ u, t: tenants.find(u.id) }))
    .filter((r): r is { u: AiUsageRow; t: TenantRow } => r.t != null);
  const list = rows.map(({ u, t }) => {
    const allowanceK = AI_ALLOWANCE_K[t.plan];
    const cost = round2(u.tokensK * AI_COST_PER_1K);
    const billed = round2(Math.max(0, u.tokensK - allowanceK) * AI_BILLED_PER_1K);
    const revenue = tenantMrr(t) + billed;
    return {
      tenantId: t.id,
      name: t.name,
      plan: t.plan,
      tokensK: u.tokensK,
      allowanceK,
      cost,
      billed,
      marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : null,
      topFeature: u.topFeature,
      throttled: s.throttledTenantIds.includes(t.id),
    };
  });
  const spend = round2(list.reduce((sum, r) => sum + r.cost, 0));
  const byFeature = AI_FEATURES.map((feature) => {
    const cost = rows.reduce((sum, { u }) => {
      const share = featureSplit(u.topFeature).find((x) => x.feature === feature)?.share ?? 0;
      return sum + u.tokensK * share * AI_COST_PER_1K;
    }, 0);
    return { feature, cost: round2(cost), sharePct: spend ? Math.round((cost / spend) * 100) : 0 };
  }).sort((a, b) => b.cost - a.cost);
  return {
    settings: { monthlyCap: s.monthlyCap, routingPolicy: s.routingPolicy },
    pricing: {
      costPer1k: AI_COST_PER_1K,
      billedPer1k: AI_BILLED_PER_1K,
      allowances: PLANS.map((plan) => ({ plan, tokensK: AI_ALLOWANCE_K[plan] })),
    },
    totals: {
      spend,
      tokensK: list.reduce((sum, r) => sum + r.tokensK, 0),
      tenants: list.length,
      throttled: list.filter((r) => r.throttled).length,
      capUsedPct: s.monthlyCap ? Math.round((spend / s.monthlyCap) * 100) : 0,
    },
    tenants: list,
    byFeature,
  };
}

// ======================================================================
// Experiments
// ======================================================================

/** Experiments shipped in the last 90 days that pre-date this table (archived in the warehouse). */
const ARCHIVED_SHIPPED_90D = 6;

interface ExperimentRow {
  id: string;
  name: string;
  surface: string;
  flagKey: string | null;
  exposed: number;
  controlPct: number;
  variantPct: number;
  confidence: number;
  status: Experiment['status'];
  endedAt: string | null;
}
export const experiments = collection<ExperimentRow>('analyticsExperiments', () => [
  {
    id: 'ex_site_builder',
    name: 'New site builder (beta)',
    surface: 'Storefront editor',
    flagKey: 'site_builder_v2',
    exposed: 4820,
    controlPct: 9.2,
    variantPct: 11.4,
    confidence: 0.97,
    status: 'running',
    endedAt: null,
  },
  {
    id: 'ex_ai_outline',
    name: 'AI outline assistant',
    surface: 'Course creation',
    flagKey: 'ai_outline',
    exposed: 3110,
    controlPct: 38.6,
    variantPct: 42.0,
    confidence: 0.81,
    status: 'running',
    endedAt: null,
  },
  {
    id: 'ex_multi_currency',
    name: 'Multi-currency checkout',
    surface: 'Checkout',
    flagKey: 'multi_currency',
    exposed: 2260,
    controlPct: 3.9,
    variantPct: 3.1,
    confidence: 0.93,
    status: 'running',
    endedAt: null,
  },
  {
    id: 'ex_annual_first',
    name: 'Annual-first pricing',
    surface: 'Plans page',
    flagKey: null,
    exposed: 1740,
    controlPct: 12.7,
    variantPct: 18.2,
    confidence: 0.99,
    status: 'running',
    endedAt: null,
  },
  {
    id: 'ex_trust_badges',
    name: 'Checkout trust badges',
    surface: 'Checkout',
    flagKey: null,
    exposed: 6120,
    controlPct: 4.4,
    variantPct: 4.9,
    confidence: 0.96,
    status: 'shipped',
    endedAt: ago({ d: 20 }),
  },
]);

function toExperiment(r: ExperimentRow): Experiment {
  const liftPct = r.controlPct ? round1(((r.variantPct - r.controlPct) / r.controlPct) * 100) : 0;
  const verdict = r.confidence >= 0.9 && liftPct > 0 ? 'Winning' : r.confidence >= 0.9 && liftPct < 0 ? 'Losing' : 'Inconclusive';
  return {
    id: r.id,
    name: r.name,
    surface: r.surface,
    flagKey: r.flagKey,
    exposed: r.exposed,
    controlPct: r.controlPct,
    variantPct: r.variantPct,
    liftPct,
    confidencePct: Math.round(r.confidence * 100),
    significant: r.confidence >= 0.95,
    verdict,
    status: r.status,
    endedAt: r.endedAt,
  };
}

function experimentsBody(): Experiments {
  const STATUS_ORDER = { running: 0, shipped: 1, stopped: 2 } as const;
  const list = experiments
    .all()
    .map(toExperiment)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
  const running = list.filter((e) => e.status === 'running');
  const winning = running.filter((e) => e.verdict === 'Winning');
  const since = Date.now() - 90 * DAY;
  return {
    kpis: {
      running: running.length,
      significant: running.filter((e) => e.significant).length,
      shipped90d:
        ARCHIVED_SHIPPED_90D + list.filter((e) => e.status === 'shipped' && e.endedAt && new Date(e.endedAt).getTime() >= since).length,
      avgWinningLiftPct: winning.length ? round1(winning.reduce((s, e) => s + e.liftPct, 0) / winning.length) : null,
    },
    experiments: list,
  };
}

function runningExperiment(id: string) {
  const row = experiments.find(id);
  if (!row) throw notFound('Experiment');
  if (row.status !== 'running') throw invalid({ status: `“${row.name}” has already ${row.status === 'shipped' ? 'shipped' : 'stopped'}.` });
  return row;
}

// ======================================================================
// Handlers
// ======================================================================

export const handlers = [
  http.get(
    route('/analytics/growth'),
    handle(() => {
      authorize('analytics.view');
      return ok(growth());
    }),
  ),

  http.get(
    route('/analytics/usage'),
    handle(() => {
      authorize('analytics.view');
      return ok(usage());
    }),
  ),

  http.get(
    route('/analytics/health'),
    handle(() => {
      authorize('analytics.view');
      const body: Health = { services: SERVICES, queues: jobQueues.all().map(toQueue), deliverability: DELIVERABILITY };
      return ok(body);
    }),
  ),

  http.post(
    route('/analytics/health/queues/:queue/retry'),
    handle<{ queue: string }>(({ params }) => {
      authorize('platform.manage');
      const q = jobQueues.find(params.queue);
      if (!q) throw notFound('Queue');
      if (!q.failed) throw invalid({ queue: `There are no failed jobs on ${q.name}.` });
      const n = q.failed;
      jobQueues.update(q.id, { failed: 0, depth: q.depth + n });
      recordAudit(`Requeued ${n} failed ${n === 1 ? 'job' : 'jobs'} on the ${q.name} queue`, 'Flags');
      return ok({ requeued: n, queue: toQueue(jobQueues.find(q.id)!) });
    }),
  ),

  http.get(
    route('/analytics/ai'),
    handle(() => {
      authorize('analytics.view');
      return ok(aiUsage());
    }),
  ),

  http.put(
    route('/analytics/ai/settings'),
    handle(async ({ request }) => {
      authorize('billing.manage');
      const body = await readBody<AiSettingsInput>(request);
      const errors: Record<string, string> = {};
      if (body.monthlyCap !== undefined) {
        if (typeof body.monthlyCap !== 'number' || !Number.isInteger(body.monthlyCap))
          errors.monthlyCap = 'Enter the cap in whole dollars.';
        else if (body.monthlyCap < 100 || body.monthlyCap > 100_000) errors.monthlyCap = 'Set a cap between $100 and $100,000.';
      }
      if (body.routingPolicy !== undefined && !(ROUTING_POLICIES as readonly string[]).includes(body.routingPolicy))
        errors.routingPolicy = 'Choose a routing policy.';
      if (body.monthlyCap === undefined && body.routingPolicy === undefined) errors.monthlyCap = 'Nothing to update.';
      if (Object.keys(errors).length) throw invalid(errors);

      const prev = aiSettings.get();
      if (body.monthlyCap !== undefined && body.monthlyCap !== prev.monthlyCap) {
        aiSettings.patch({ monthlyCap: body.monthlyCap });
        recordAudit(`Set the AI monthly cost cap to $${body.monthlyCap.toLocaleString('en-US')}`, 'Billing');
      }
      if (body.routingPolicy !== undefined && body.routingPolicy !== prev.routingPolicy) {
        aiSettings.patch({ routingPolicy: body.routingPolicy });
        recordAudit(`Changed AI model routing to ${ROUTING_LABEL[body.routingPolicy]}`, 'Billing');
      }
      return ok(aiUsage());
    }),
  ),

  http.post(
    route('/analytics/ai/tenants/:id/throttle'),
    handle<{ id: string }>(({ params }) => {
      authorize('billing.manage');
      const t = tenants.find(params.id);
      if (!t || !aiUsageRows.find(params.id)) throw notFound('Tenant');
      const s = aiSettings.get();
      if (!s.throttledTenantIds.includes(t.id)) {
        aiSettings.patch({ throttledTenantIds: [...s.throttledTenantIds, t.id] });
        recordAudit(`Throttled ${t.name} to the low-cost AI model`, 'Billing', t.id);
      }
      return ok(aiUsage());
    }),
  ),

  http.delete(
    route('/analytics/ai/tenants/:id/throttle'),
    handle<{ id: string }>(({ params }) => {
      authorize('billing.manage');
      const t = tenants.find(params.id);
      if (!t || !aiUsageRows.find(params.id)) throw notFound('Tenant');
      const s = aiSettings.get();
      if (s.throttledTenantIds.includes(t.id)) {
        aiSettings.patch({ throttledTenantIds: s.throttledTenantIds.filter((x) => x !== t.id) });
        recordAudit(`Restored full AI speed for ${t.name}`, 'Billing', t.id);
      }
      return ok(aiUsage());
    }),
  ),

  http.get(
    route('/analytics/experiments'),
    handle(() => {
      authorize('analytics.view');
      return ok(experimentsBody());
    }),
  ),

  http.post(
    route('/analytics/experiments/:id/promote'),
    handle<{ id: string }>(({ params }) => {
      authorize('platform.manage');
      const row = runningExperiment(params.id);
      experiments.update(row.id, { status: 'shipped', endedAt: new Date().toISOString() });
      if (row.flagKey && flags.find(row.flagKey)) flags.update(row.flagKey, { enabled: true, rollout: 'All tenants' });
      recordAudit(`Promoted experiment "${row.name}" to 100%`, 'Flags');
      return ok(experimentsBody());
    }),
  ),

  http.post(
    route('/analytics/experiments/:id/stop'),
    handle<{ id: string }>(({ params }) => {
      authorize('platform.manage');
      const row = runningExperiment(params.id);
      experiments.update(row.id, { status: 'stopped', endedAt: new Date().toISOString() });
      recordAudit(`Stopped experiment "${row.name}" — traffic returned to control`, 'Flags');
      return ok(experimentsBody());
    }),
  ),
];
