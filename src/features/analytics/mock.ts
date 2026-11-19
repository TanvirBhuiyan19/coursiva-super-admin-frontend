// Mock API for the analytics screens. Tenant-derived figures are computed from the shared `tenants`
// table with the rules in `mocks/derive.ts`; platform telemetry lives in feature tables below.
import { http } from 'msw';
import { PLANS, type Plan } from '@/lib/domain';
import { flags, overages, tenants, type FlagRow, type TenantRow } from '@/mocks/collections';
import { collection, ago, singleton } from '@/mocks/db';
import { tenantHealth, tenantHealthScore, tenantMrr } from '@/mocks/derive';
import {
  authorize,
  handle,
  HttpError,
  invalid,
  noContent,
  notFound,
  ok,
  paginate,
  query,
  readBody,
  recordAudit,
  route,
} from '@/mocks/http';
import {
  AI_FEATURES,
  ROUTING_POLICIES,
  type AiFeature,
  type AiSettingsInput,
  type AiTenantUsage,
  type AiUsage,
  EXPERIMENT_METRICS,
  type Experiment,
  type ExperimentDetail,
  type ExperimentInput,
  type ExperimentMetric,
  type Experiments,
  type Growth,
  type Health,
  type HealthScore,
  type JobQueue,
  type OnboardingStage,
  type RoutingPolicy,
  type Usage,
  type UsageMeter,
} from './types';

const DAY = 86_400_000;
const METER_LABELS = { ai_credits: 'AI credits', live_room_minutes: 'Live room minutes', sms_credits: 'SMS credits' } as const;
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
  nps: null,
  npsDelta: null,
  logoChurnPct: 2.1,
  logoChurnDeltaPts: -0.4,
};

/** Retention curves for the last six signup cohorts, oldest first. */
const COHORT_CURVES = [[100, 68, 54, 47, 43, 41], [100, 71, 58, 50, 46], [100, 74, 60, 53], [100, 76, 63], [100, 79], [100]];

/**
 * A mock school's onboarding facts (Laravel tenant_metrics.branded_at / published_courses / first_sale_at). The mock
 * rows carry no brand, course or order records, so a school with students stands in for one that published a course
 * and sold; branding is set once it has students or pays.
 */
function reached(t: TenantRow): Record<Exclude<OnboardingStage, 'provisioned'>, boolean> {
  const pays = tenantMrr(t) > 0;
  return { branding: t.students > 0 || pays, first_course: t.students > 0, first_sale: t.students > 0, paid: pays };
}
const STAGES = ['branding', 'first_course', 'first_sale', 'paid'] as const;

/** Growth's health list: the shared tenant health score, with its falling signals as the driver text. */
function healthScore(t: TenantRow) {
  const { score, drivers } = tenantHealthScore(t);
  const downs = drivers.filter((d) => d.trend === 'down').map((d) => `${d.label}: ${d.value}`);
  const reasons = t.status === 'Trial' || t.status === 'Suspended' ? [tenantHealth(t).reason ?? '', ...downs] : downs;
  return { score, driver: reasons.length ? reasons.join(' · ') : 'All signals healthy' };
}

/** How many rows the growth and AI screens carry inline; the full lists page through their own endpoints. */
const TOP = 10;

/**
 * Orders rows by a list endpoint's `sort` (comma-separated, `-` = descending) like the backends' ListQuery: only
 * whitelisted fields (422 `sort` otherwise), then `tiebreak` in the last field's direction.
 */
function ranked<T>(rows: T[], sort: string, fields: Record<string, (r: T) => number | string>, tiebreak: (r: T) => string) {
  const keys = sort
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => ({ desc: f.startsWith('-'), get: fields[f.replace(/^-/, '')] }));
  if (keys.length > 3 || keys.some((k) => !k.get)) throw invalid({ sort: `You can sort by: ${Object.keys(fields).join(', ')}.` });
  const lastDesc = keys.at(-1)?.desc ?? false;
  const cmp = (x: number | string, y: number | string) =>
    typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const c = cmp(k.get!(a), k.get!(b));
      if (c) return k.desc ? -c : c;
    }
    const c = cmp(tiebreak(a), tiebreak(b));
    return lastDesc ? -c : c;
  });
}

const HEALTH_SORTS = { score: (h: HealthScore) => h.score, name: (h: HealthScore) => h.name };
/** Every tenant's health score, ranked by `sort` (default best first). */
const healthRanking = (sort = '-score,name') =>
  ranked(
    tenants.all().map((t) => ({ tenantId: t.id, name: t.name, ...healthScore(t) })),
    sort,
    HEALTH_SORTS,
    (h) => h.tenantId,
  );

function growth(): Growth {
  const all = tenants.all();
  const paying = all.filter((t) => tenantMrr(t) > 0);
  const mrr = paying.reduce((s, t) => s + tenantMrr(t), 0);

  // Acquisition funnel of the last 90 days' signups (Laravel AnalyticsController::funnel): real counts only; visitors
  // are not tracked (null). Rates are shares of signups.
  const since = Date.now() - 90 * DAY;
  const cohort = all.filter((t) => new Date(t.createdAt).getTime() >= since);
  const signups = cohort.length;
  const share = (n: number) => (signups ? round1((n / signups) * 100) : null);
  const activated = cohort.filter((t) => reached(t).first_course).length;
  const trials = cohort.filter((t) => t.trialEndsAt != null).length;
  const converted = cohort.filter((t) => tenantMrr(t) > 0).length;
  const funnel: Growth['funnel'] = [
    { stage: 'visitors', count: null, ratePct: null },
    { stage: 'signups', count: signups, ratePct: null },
    { stage: 'activated', count: activated, ratePct: share(activated) },
    { stage: 'trials', count: trials, ratePct: share(trials) },
    { stage: 'converted', count: converted, ratePct: share(converted) },
  ];

  // Onboarding of the same cohort; stuck = any school not yet paying, idle 10+ days at its first unreached stage.
  const onboarding: Growth['onboarding'] = [
    { stage: 'provisioned', tenants: cohort.length },
    ...STAGES.map((stage) => ({ stage, tenants: cohort.filter((t) => reached(t)[stage]).length })),
  ];
  const stuck: Growth['stuck'] = [...all]
    .sort((x, y) => (x.status === 'Trial' ? -1 : y.status === 'Trial' ? 1 : 0) || x.students - y.students || x.name.localeCompare(y.name))
    .flatMap((t) => {
      const stage = STAGES.find((s) => !reached(t)[s]);
      const days = daysSince(t.createdAt);
      return stage && days >= 10 ? [{ tenantId: t.id, name: t.name, stage, days }] : [];
    })
    .slice(0, 5);

  return {
    kpis: { revenuePerTenant: paying.length ? Math.round(mrr / paying.length) : 0, payingTenants: paying.length, ...GROWTH_KPIS },
    funnel,
    cohorts: COHORT_CURVES.map((retention, i) => ({ month: monthStart(i - COHORT_CURVES.length), retention })),
    healthScores: healthRanking().slice(0, TOP),
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
  /** Mux minutes delivered to learners this month. */
  videoDeliveryMinutes: number;
}
const U = (id: string, storageTb: number, bandwidthTb: number, videoK: number, apiM: number): TenantUsageRow => ({
  id,
  storageGb: storageTb * 1000,
  bandwidthGb: bandwidthTb * 1000,
  videoMinutes: videoK * 1000,
  apiRequests: apiM * 1_000_000,
  // Learners watch roughly six times what schools upload in a month.
  videoDeliveryMinutes: videoK * 6000,
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
export const platformCapacity = singleton<
  Record<'storageGb' | 'bandwidthGb' | 'videoMinutes' | 'apiRequests' | 'videoDeliveryMinutes', number>
>('analyticsCapacity', () => ({
  storageGb: 100_000,
  bandwidthGb: 250_000,
  videoMinutes: 2_200_000,
  apiRequests: 150_000_000,
  videoDeliveryMinutes: 15_000_000,
}));

/** When each meter was last measured (storage and API hourly; bandwidth and video delivery daily, as the backends do). */
const METER_UPDATED: Record<UsageMeter, () => string> = {
  storage: () => ago({ m: 25 }),
  bandwidth: () => ago({ h: 9 }),
  transcode: () => ago({ m: 40 }),
  api_requests: () => ago({ m: 55 }),
  video_delivery: () => ago({ h: 9 }),
};

const METER_FIELD: Record<UsageMeter, keyof Omit<TenantUsageRow, 'id'>> = {
  storage: 'storageGb',
  bandwidth: 'bandwidthGb',
  transcode: 'videoMinutes',
  api_requests: 'apiRequests',
  video_delivery: 'videoDeliveryMinutes',
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
    return { meter, used: round1(totals[f]), capacity: cap[f], usedPct, nearLimit: usedPct >= 80, updatedAt: METER_UPDATED[meter]() };
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
        videoDeliveryMinutes: u.videoDeliveryMinutes,
        sharePct: Math.round(share * 100),
        // Laravel sends the meter's display name here (AnalyticsController::METER_LABELS).
        overage: ov ? { meter: METER_LABELS[ov.meter], amount: ov.amount } : null,
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

/**
 * Thousand AI credits included per month in each plan (the backend's `ai_credits` plan limits: 50,000 · 600,000 ·
 * 2,000,000). A credit is ~1 token-equivalent at fixed per-task rates; the contract keeps the `tokens_k` names.
 */
export const AI_ALLOWANCE_K: Record<Plan, number> = { Launch: 50, Growth: 600, Scale: 2000 };
/** Our model cost per 1k credits, and what we bill tenants per 1k above their allowance. */
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
/** AI credits (thousands) used this month by tenants that have AI studio. */
export const aiUsageRows = collection<AiUsageRow>('analyticsAiUsage', () => [
  { id: 'tn_amplify', tokensK: 240, topFeature: 'outlines' },
  { id: 'tn_nordic', tokensK: 620, topFeature: 'quizzes' },
  { id: 'tn_devpath', tokensK: 2480, topFeature: 'summaries' },
  { id: 'tn_silva', tokensK: 180, topFeature: 'outlines' },
  { id: 'tn_northstar', tokensK: 92, topFeature: 'chat' },
  { id: 'tn_atlas', tokensK: 640, topFeature: 'quizzes' },
  { id: 'tn_peak', tokensK: 55, topFeature: 'summaries' },
]);

/**
 * What the model calls really cost per 1k credits. The backend sums each charge's `cost_micros` (priced per model and
 * token); the mock has no per-call rows, so it uses one blended rate for the seeded credits.
 */
export const AI_MODEL_COST_PER_1K = 0.31;

/** How a tenant's credits split across features: 55% on their heaviest feature, the rest in fixed order. */
const featureSplit = (top: AiFeature) => {
  const rest = AI_FEATURES.filter((f) => f !== top);
  return [{ feature: top, share: 0.55 }, ...rest.map((feature, i) => ({ feature, share: [0.2, 0.15, 0.1][i] ?? 0 }))];
};

const AI_SORTS = { tokens_k: (r: AiTenantUsage) => r.tokensK, name: (r: AiTenantUsage) => r.name };

/** Every tenant with AI usage this month, ranked by `sort` (default heaviest first). */
const aiTenantRanking = (sort = '-tokens_k') => ranked(aiUsage(true).tenants, sort, AI_SORTS, (r) => r.tenantId);

/** `all`: every tenant row (for the paginated list); otherwise only the TOP heaviest, as the backends return. */
function aiUsage(all = false): AiUsage {
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
      modelCost: round2(u.tokensK * AI_MODEL_COST_PER_1K),
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
      modelCost: round2(list.reduce((sum, r) => sum + r.modelCost, 0)),
      // The cap is enforced on the real model cost: at 100% every school routes to the fastest model.
      capUsedPct: s.monthlyCap ? Math.round((list.reduce((sum, r) => sum + r.modelCost, 0) / s.monthlyCap) * 100) : 0,
      capReached: s.monthlyCap > 0 && list.reduce((sum, r) => sum + r.modelCost, 0) >= s.monthlyCap,
    },
    tenants: all ? list : ranked(list, '-tokens_k', AI_SORTS, (r) => r.tenantId).slice(0, TOP),
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
  metric?: ExperimentMetric;
  allocationPct?: number;
  hypothesis?: string | null;
  /** The flag's state before the experiment (Stop restores it). */
  previousFlag?: { enabled: boolean; rollout: string } | null;
  startedAt?: string;
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
    flagKey: null,
    exposed: 3110,
    controlPct: 38.6,
    variantPct: 42.0,
    confidence: 0.81,
    status: 'running',
    endedAt: null,
  },
  {
    id: 'ex_advanced_reports',
    name: 'Advanced reports',
    surface: 'Analytics',
    flagKey: 'advanced_reports',
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

const MIN_TENANTS = 30;
const METRIC_LABEL: Record<ExperimentMetric, string> = {
  trial_converted: 'Trial converted to paid',
  activated_14d: 'Published a course within 14 days',
  active_30d: 'Active within 30 days',
  addon_purchased: 'Bought an add-on',
};
/** Exposed schools per arm (the mock splits `exposed` by the allocation). */
const armCounts = (r: ExperimentRow) => {
  const variantN = Math.round((r.exposed * (r.allocationPct ?? 50)) / 100);
  return { controlN: r.exposed - variantN, variantN };
};

function toExperiment(r: ExperimentRow): Experiment {
  const liftPct = r.controlPct ? round1(((r.variantPct - r.controlPct) / r.controlPct) * 100) : 0;
  const { controlN, variantN } = armCounts(r);
  const collecting = r.exposed > 0 && (controlN < MIN_TENANTS || variantN < MIN_TENANTS);
  const verdict: Experiment['verdict'] = collecting
    ? 'Collecting data'
    : r.confidence >= 0.9 && liftPct > 0
      ? 'Winning'
      : r.confidence >= 0.9 && liftPct < 0
        ? 'Losing'
        : 'Inconclusive';
  const metric = r.metric ?? 'trial_converted';
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
    significant: !collecting && r.confidence >= 0.95,
    verdict,
    status: r.status,
    endedAt: r.endedAt,
    metric,
    metricLabel: METRIC_LABEL[metric],
    allocationPct: r.allocationPct ?? 50,
    hypothesis: r.hypothesis ?? null,
    controlN,
    variantN,
    startedAt: r.startedAt ?? ago({ d: 21 }),
  };
}

function toDetail(r: ExperimentRow): ExperimentDetail {
  const e = toExperiment(r);
  const conv = (n: number, pct: number) => Math.round((n * pct) / 100);
  const arms = [
    { arm: 'control' as const, exposed: e.controlN, converted: conv(e.controlN, e.controlPct) },
    { arm: 'variant' as const, exposed: e.variantN, converted: conv(e.variantN, e.variantPct) },
  ].map((a) => ({ ...a, ratePct: a.exposed ? round2((a.converted / a.exposed) * 100) : 0 }));
  return { ...e, arms, previousFlag: r.previousFlag ?? null, minTenants: MIN_TENANTS };
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
    route('/analytics/growth/health-scores'),
    handle(({ request }) => {
      authorize('analytics.view');
      return paginate(healthRanking(query(request).sort), request);
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

  http.get(
    route('/analytics/ai/tenants'),
    handle(({ request }) => {
      authorize('analytics.view');
      return paginate(aiTenantRanking(query(request).sort), request);
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

  http.get(
    route('/analytics/experiments/:id'),
    handle<{ id: string }>(({ params }) => {
      authorize('analytics.view');
      const row = experiments.find(params.id);
      if (!row) throw notFound('Experiment');
      return ok(toDetail(row));
    }),
  ),

  http.post(
    route('/analytics/experiments'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<ExperimentInput>(request);
      const errors: Record<string, string> = {};
      if (!body.name?.trim()) errors.name = 'The name field is required.';
      else if (body.name.length > 120) errors.name = 'The name field must not be greater than 120 characters.';
      if (!body.surface?.trim()) errors.surface = 'The surface field is required.';
      const flag = body.flagKey ? flags.find(body.flagKey) : undefined;
      if (!flag) errors.flagKey = 'Choose a feature flag.';
      if (!(EXPERIMENT_METRICS as readonly string[]).includes(body.metric)) errors.metric = 'Choose a metric.';
      if (!Number.isInteger(body.allocationPct) || body.allocationPct < 1 || body.allocationPct > 50)
        errors.allocationPct = 'Send between 1% and 50% of schools to the variant.';
      if ((body.hypothesis ?? '').length > 300) errors.hypothesis = 'The hypothesis field must not be greater than 300 characters.';
      if (Object.keys(errors).length) throw invalid(errors);
      if (!flag!.gates) {
        throw new HttpError(
          422,
          'Nothing in the product reads this flag yet, so both groups would get the same experience. Choose a flag that gates a feature.',
          undefined,
          'experiment_flag_no_effect',
        );
      }
      if (experiments.where((e) => e.status === 'running' && e.flagKey === body.flagKey).length) {
        throw new HttpError(422, 'Another running experiment already uses this flag. Stop it first.', undefined, 'experiment_flag_busy');
      }
      // A flag that already reaches schools would be switched off for the control group (Beta list = overridden only).
      if (flag!.enabled && flag!.rollout !== 'Beta list') {
        throw new HttpError(
          422,
          flag!.rollout === 'All tenants'
            ? 'This feature is already on for every school; an experiment would switch it off for the control group.'
            : `This feature is already on for some schools (${flag!.rollout}); an experiment would switch it off for those in the control group. Turn the flag off first.`,
          undefined,
          'experiment_flag_already_live',
        );
      }
      const row: ExperimentRow = {
        id: `exa_${Date.now().toString(36)}`,
        name: body.name.trim(),
        surface: body.surface.trim(),
        flagKey: flag!.id,
        exposed: 0,
        controlPct: 0,
        variantPct: 0,
        confidence: 0,
        status: 'running',
        endedAt: null,
        metric: body.metric,
        allocationPct: body.allocationPct,
        hypothesis: body.hypothesis?.trim() || null,
        previousFlag: { enabled: flag!.enabled, rollout: flag!.rollout },
        startedAt: new Date().toISOString(),
      };
      experiments.insert(row);
      recordAudit(`Started experiment "${row.name}" on ${row.flagKey} (${row.allocationPct}% of schools in the variant)`, 'Flags');
      return ok(toDetail(row), 201);
    }),
  ),

  http.patch(
    route('/analytics/experiments/:id'),
    handle<{ id: string }>(async ({ params, request }) => {
      authorize('platform.manage');
      const row = experiments.find(params.id);
      if (!row) throw notFound('Experiment');
      const body = await readBody<{ name?: string; hypothesis?: string | null }>(request);
      if (body.name !== undefined && !body.name.trim()) throw invalid({ name: 'The name field is required.' });
      if ((body.hypothesis ?? '').length > 300)
        throw invalid({ hypothesis: 'The hypothesis field must not be greater than 300 characters.' });
      experiments.update(row.id, {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.hypothesis !== undefined ? { hypothesis: body.hypothesis?.trim() || null } : {}),
      });
      const fresh = experiments.find(row.id)!;
      recordAudit(`Edited experiment "${fresh.name}"`, 'Flags');
      return ok(toDetail(fresh));
    }),
  ),

  http.delete(
    route('/analytics/experiments/:id'),
    handle<{ id: string }>(({ params }) => {
      authorize('platform.manage');
      const row = experiments.find(params.id);
      if (!row) throw notFound('Experiment');
      if (row.status === 'running') throw new HttpError(409, 'Stop this experiment before deleting it.', undefined, 'conflict');
      experiments.remove(row.id);
      recordAudit(`Deleted experiment "${row.name}" and its results`, 'Flags');
      return noContent();
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
      // The flag goes back to the state saved when the experiment started.
      if (row.flagKey && row.previousFlag && flags.find(row.flagKey))
        flags.update(row.flagKey, { enabled: row.previousFlag.enabled, rollout: row.previousFlag.rollout as FlagRow['rollout'] });
      recordAudit(`Stopped experiment "${row.name}" — traffic returned to control`, 'Flags');
      return ok(experimentsBody());
    }),
  ),
];
