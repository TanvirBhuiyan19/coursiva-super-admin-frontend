// API resources for /billing. These types are the contract the Laravel billing controllers must match.
import type { Plan } from '@/lib/domain';

// ---------- Revenue ----------
export type MovementKind = 'new' | 'expansion' | 'contraction' | 'churn';

/** GET /billing/revenue — headline revenue figures, derived server-side from tenants. */
export interface RevenueSummary {
  mrr: number;
  arr: number;
  /** Sum of every movement amount for `movementMonth` (not just the ones listed). */
  netChange: number;
  pastDueTenants: number;
  /** First day (ISO date) of the last closed month the movement covers. */
  movementMonth: string;
  /** The largest movements of the month (at most 12), biggest first; `id` is a stable key. */
  movements: { id: string; kind: MovementKind; label: string; detail: string; amount: number }[];
  /** How many movements the month had in total. */
  movementCount: number;
  churnReasons: { reason: string; pct: number }[];
  payouts: { id: string; date: string; amount: number; status: 'Scheduled' | 'Paid' }[];
}

/** Laravel BillingPresenter::adminInvoice. `Open` = issued, not charged yet; `Void` = cancelled. */
export type InvoiceStatus = 'Paid' | 'Past due' | 'Waived' | 'Void' | 'Open';

/** Merchants of record that bill schools themselves (the console's `billing_provider` setting picks one for new checkouts). */
export type InvoiceProvider = 'paddle' | 'lemon_squeezy';

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
  /**
   * The merchant of record that billed it, or null for Coursiva's own (Stripe) invoices. A provider retries its
   * invoices on its own schedule: retry, waive and pause dunning answer 422 for them — manage them at the provider.
   */
  provider: InvoiceProvider | null;
}

export interface InvoiceListParams {
  page?: number;
  perPage?: number;
  status?: InvoiceStatus;
  /** Returns the page that contains this invoice id (deep links from global search). */
  focus?: string;
  /** Only this tenant's invoices (the tenant drawer's "View all invoices"). */
  tenant?: string;
}

/** GET /billing/dunning — past-due invoices and the retry policy. */
export interface DunningQueue {
  /** Total attempts before suspension (first charge + automatic retries). */
  maxAttempts: number;
  /** Days after the failed charge on which retries run, e.g. [1, 3, 7]. */
  retryDays: number[];
  autoSuspend: boolean;
  /** One page, oldest failure first (the response's `meta` pages it). */
  items: Invoice[];
}

/** Metered usage billed beyond the plan allowance (Laravel `coursiva.billing.overage`). */
export const OVERAGE_METERS = ['ai_credits', 'live_room_minutes', 'sms_credits'] as const;
export type OverageMeter = (typeof OVERAGE_METERS)[number];

export interface Overage {
  id: string;
  tenantId: string;
  tenantName: string;
  meter: OverageMeter;
  /** Units used this month (credits, minutes). */
  usage: number;
  /** Units included in the tenant's plan (or its override). */
  allowance: number;
  /** Price in dollars per `per` units over the allowance. */
  rate: number;
  per: number;
  amount: number;
  billedAt: string | null;
}

/** GET /billing/overages — the current metering period. */
export interface OverageList {
  /** First day (ISO date) of the metering month. */
  period: string;
  /** Unbilled amount across the whole month, not just this page. */
  unbilledTotal: number;
  /** One page, largest first (the response's `meta` pages it). */
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
  /** The recommended plan (Laravel: Growth), badged on its card and on the marketing pricing page. */
  highlight: boolean;
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
  /** Free-trial length of new schools, 0–90 (0 = pay at sign-up). The single source: also `GET /settings` → `trialDays`. */
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
  /** 0–90; saved to the same platform setting as `PATCH /settings` → `trialDays`. */
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
