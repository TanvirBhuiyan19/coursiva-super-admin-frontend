// API resources for the analytics screens (Growth, Usage, Health, AI usage, Experiments).
// Numbers only: labels, colour bands and chart geometry are applied client-side.
import type { Plan } from '@/lib/domain';

// ---------- GET /analytics/growth ----------
export const FUNNEL_STAGES = ['visitors', 'signups', 'activated', 'trials', 'converted'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const ONBOARDING_STAGES = ['provisioned', 'branding', 'first_course', 'first_sale', 'paid'] as const;
export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

export interface Growth {
  /** Headline KPIs. `revenuePerTenant` = paying MRR ÷ paying tenants (same rule as `/tenants/summary` `arpa`). */
  kpis: {
    revenuePerTenant: number;
    payingTenants: number;
    trialConversionPct: number;
    trialConversionDeltaPts: number;
    netRevenueRetentionPct: number;
    netRevenueRetentionDeltaPts: number;
    nps: number;
    npsDelta: number;
    logoChurnPct: number;
    logoChurnDeltaPts: number;
  };
  /** Acquisition funnel, last 90 days, in stage order. `ratePct` = share of the previous stage (null for the first). */
  funnel: { stage: FunnelStage; count: number; ratePct: number | null }[];
  /** Monthly signup cohorts, oldest first. `retention[i]` = % of the cohort still active i months after signup. */
  cohorts: { month: string; retention: number[] }[];
  /** Per-tenant health scores (same score as the tenant drawer), best first. */
  healthScores: { tenantId: string; name: string; score: number; driver: string }[];
  /** Onboarding funnel, last 90 days, in stage order. */
  onboarding: { stage: OnboardingStage; tenants: number }[];
  /** Tenants idle at an onboarding stage for 10+ days. */
  stuck: { tenantId: string; name: string; stage: OnboardingStage; days: number }[];
  totalTenants: number;
}

// ---------- GET /analytics/usage ----------
export const USAGE_METERS = ['storage', 'bandwidth', 'transcode', 'api_requests'] as const;
export type UsageMeter = (typeof USAGE_METERS)[number];

export interface Usage {
  /** First day of the billing month the figures cover (ISO date). */
  period: string;
  /**
   * Platform capacity. Units: `storage` and `bandwidth` in GB, `transcode` in minutes, `api_requests` in requests.
   * `used` is the sum over all tenants. `nearLimit` when used ≥ 80% of capacity.
   */
  capacity: { meter: UsageMeter; used: number; capacity: number; usedPct: number; nearLimit: boolean }[];
  /** Top 5 tenants by share of platform usage (mean of their share of each meter). */
  topConsumers: {
    tenantId: string;
    name: string;
    storageGb: number;
    bandwidthGb: number;
    videoMinutes: number;
    apiRequests: number;
    sharePct: number;
    /** Unbilled overage on the tenant, if any. */
    overage: { meter: string; amount: number } | null;
  }[];
}

// ---------- GET /analytics/health ----------
export type ServiceStatus = 'Operational' | 'Degraded' | 'Outage';

export interface Health {
  services: { id: string; name: string; status: ServiceStatus; uptimePct: number; p95Ms: number | null; note: string | null }[];
  queues: JobQueue[];
  /** Email deliverability, last 7 days (percent of sent). */
  deliverability: { deliveredPct: number; softBouncePct: number; hardBouncePct: number; complaintPct: number };
}

export interface JobQueue {
  name: string;
  depth: number;
  failed: number;
}

// ---------- GET /analytics/ai ----------
export const ROUTING_POLICIES = ['cost_first', 'balanced', 'quality_first'] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export const AI_FEATURES = ['outlines', 'quizzes', 'summaries', 'chat'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface AiUsage {
  settings: { monthlyCap: number; routingPolicy: RoutingPolicy };
  /** Server pricing rules, so the explanation on screen always matches the maths. */
  pricing: { costPer1k: number; billedPer1k: number; allowances: { plan: Plan; tokensK: number }[] };
  totals: { spend: number; tokensK: number; tenants: number; throttled: number; capUsedPct: number };
  tenants: AiTenantUsage[];
  /** Our cost by AI feature, largest first. `sharePct` of total spend. */
  byFeature: { feature: AiFeature; cost: number; sharePct: number }[];
}

export interface AiTenantUsage {
  tenantId: string;
  name: string;
  plan: Plan;
  tokensK: number;
  allowanceK: number;
  /** Our model cost this month (USD). */
  cost: number;
  /** Overage billed to the tenant above their allowance (USD). */
  billed: number;
  /** (plan MRR + billed − cost) ÷ revenue, in %. Null when the tenant has no revenue (trial / suspended). */
  marginPct: number | null;
  topFeature: AiFeature;
  throttled: boolean;
}

export interface AiSettingsInput {
  monthlyCap?: number;
  routingPolicy?: RoutingPolicy;
}

// ---------- GET /analytics/experiments ----------
export type ExperimentStatus = 'running' | 'shipped' | 'stopped';
export type ExperimentVerdict = 'Winning' | 'Losing' | 'Inconclusive';

export interface Experiment {
  id: string;
  name: string;
  surface: string;
  /** Feature flag the experiment runs on (see Flags & status). */
  flagKey: string | null;
  exposed: number;
  controlPct: number;
  variantPct: number;
  /** Relative lift of variant over control, in % (one decimal). */
  liftPct: number;
  /** 0–100. */
  confidencePct: number;
  significant: boolean;
  verdict: ExperimentVerdict;
  status: ExperimentStatus;
  endedAt: string | null;
}

export interface Experiments {
  kpis: { running: number; significant: number; shipped90d: number; avgWinningLiftPct: number | null };
  experiments: Experiment[];
}

/** POST /analytics/health/queues/{queue}/retry result. */
export interface QueueRetryResult {
  /** Failed jobs pushed back onto the queue. */
  requeued: number;
  queue: JobQueue;
}
