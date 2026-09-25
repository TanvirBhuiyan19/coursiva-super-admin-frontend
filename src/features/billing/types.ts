// API resources for /billing. These types are the contract the Laravel billing controllers must match.
import type { Plan } from '@/lib/domain';

// ---------- Revenue ----------
export type MovementKind = 'new' | 'expansion' | 'contraction' | 'churn';

/** GET /billing/revenue — headline revenue figures, derived server-side from tenants. */
export interface RevenueSummary {
  mrr: number;
  arr: number;
  /** Sum of the movement amounts for `movementMonth`. */
  netChange: number;
  pastDueTenants: number;
  /** First day (ISO date) of the last closed month the movement covers. */
  movementMonth: string;
  movements: { kind: MovementKind; label: string; detail: string; amount: number }[];
  churnReasons: { reason: string; pct: number }[];
  payouts: { id: string; date: string; amount: number; status: 'Scheduled' | 'Paid' }[];
}

export type InvoiceStatus = 'Paid' | 'Past due' | 'Waived';

export interface Invoice {
  id: string;
  number: string;
  tenantId: string;
  tenantName: string;
  plan: Plan;
  amount: number;
  issuedAt: string;
  status: InvoiceStatus;
  /** Charge attempts made so far (the first charge counts as attempt 1). */
  attempts: number;
  nextRetryAt: string | null;
  dunningPaused: boolean;
}

export interface InvoiceListParams {
  page?: number;
  perPage?: number;
  status?: InvoiceStatus;
  /** Returns the page that contains this invoice id (deep links from global search). */
  focus?: string;
}

/** GET /billing/dunning — past-due invoices and the retry policy. */
export interface DunningQueue {
  /** Total attempts before suspension (first charge + automatic retries). */
  maxAttempts: number;
  /** Days after the failed charge on which retries run, e.g. [1, 3, 7]. */
  retryDays: number[];
  autoSuspend: boolean;
  items: Invoice[];
}

export interface Overage {
  id: string;
  tenantId: string;
  tenantName: string;
  meter: string;
  usage: string;
  rate: string;
  amount: number;
  billedAt: string | null;
}

/** GET /billing/overages — the current metering period. */
export interface OverageList {
  /** First day (ISO date) of the metering month. */
  period: string;
  unbilledTotal: number;
  items: Overage[];
}

// ---------- Plans & pricing ----------
export interface PlanPricing {
  plan: Plan;
  /** Current list price for new signups. */
  price: number;
  tenants: number;
  /** Tenants currently paying (not on trial or suspended). */
  payingTenants: number;
  mrr: number;
  /** Plan default limits. `0` = unlimited. */
  limits: { staffSeats: number; students: number; storageGb: number; liveRoomMinutes: number };
  highlight: string;
}

export interface Addon {
  key: string;
  label: string;
  price: number;
  availability: string;
}

export interface PlanFeature {
  key: string;
  label: string;
  plans: Plan[];
}

/** GET /billing/pricing */
export interface PricingConfig {
  plans: PlanPricing[];
  annualDiscountPct: number;
  trialDays: number;
  addons: Addon[];
  features: PlanFeature[];
}

export const ROLLOUTS = ['new_signups', 'migrate_all'] as const;
export type Rollout = (typeof ROLLOUTS)[number];

/** PUT /billing/pricing */
export interface PricingUpdate {
  prices: { plan: Plan; price: number }[];
  annualDiscountPct: number;
  trialDays: number;
  addons: { key: string; price: number }[];
  rollout: Rollout;
}

export interface PricingUpdateResult {
  pricing: PricingConfig;
  /** Tenants whose locked-in price changed (only with `migrate_all`). */
  migratedTenants: number;
}

export const PROMO_DURATIONS = ['1 month', '2 months', '3 months', '12 months', 'Forever'] as const;
export type PromoDuration = (typeof PROMO_DURATIONS)[number];

export interface PromoCode {
  id: string;
  code: string;
  percentOff: number;
  duration: PromoDuration;
  audience: string;
  redemptions: number;
  createdAt: string;
}

export interface PromoInput {
  code: string;
  percentOff: number;
  duration: PromoDuration;
}

/** PUT /billing/pricing request body: every key is optional; only actual changes are applied and audited. */
export type PricingUpdateInput = Partial<PricingUpdate>;
