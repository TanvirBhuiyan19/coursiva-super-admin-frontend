// API resources for /tenants. These types are the contract the Laravel TenantResource must match.
import type { LimitKeyWire, Plan, Region, TenantHealth, TenantStatus } from '@/lib/domain';

export const TENANT_SEGMENTS = ['all', 'watchlist', 'at_risk', 'trials_ending', 'past_due', 'dormant', 'top_mrr'] as const;
export type TenantSegment = (typeof TENANT_SEGMENTS)[number];

export type TenantSort =
  'name' | '-name' | 'students' | '-students' | 'mrr' | '-mrr' | 'created_at' | '-created_at' | 'last_active_at' | '-last_active_at';

export interface TenantListParams {
  page?: number;
  perPage?: number;
  search?: string;
  segment?: TenantSegment;
  plan?: Plan;
  status?: TenantStatus;
  sort?: TenantSort;
}

/** Known `suspension_reason` values; staff suspensions may carry any other string. */
export type SuspensionReason = 'billing' | 'canceled' | 'payment_method_required' | 'maintenance' | 'staff' | (string & {});

/** `TenantDetail.trial`: the subscription's trial and card state (null: no subscription yet). */
export interface TenantTrial {
  /** A card saved with Coursiva will be charged when the trial ends. */
  cardVerified: boolean;
  /** Trialing or paused with no way to charge (no card; or a merchant-of-record school that never checked out). */
  requiresCard: boolean;
  /** The trial ended without a card (`suspension_reason: payment_method_required`). */
  paused: boolean;
  /** While trialing or paused, else null. */
  trialEndsAt: string | null;
}

/** Row in the tenant directory. */
export interface Tenant {
  id: string;
  name: string;
  domain: string;
  ownerName: string;
  ownerEmail: string;
  plan: Plan;
  status: TenantStatus;
  students: number;
  /** Monthly recurring revenue in USD (0 while on trial or suspended). */
  mrr: number;
  health: TenantHealth;
  healthReason: string | null;
  /** Student-limit utilisation, 0–100. */
  utilization: number;
  /** Human lifecycle stage, e.g. "Trial", "Dunning · retry 2 of 4", "Dormant". */
  stage: string;
  createdAt: string;
  lastActiveAt: string;
  trialEndsAt: string | null;
  /**
   * Set only while `status` is `Suspended`, else null: `billing` (final failed payment), `canceled` (subscription
   * ended), `payment_method_required` (**paused**: the trial ended without a card; `extend-trial` reopens it),
   * `maintenance`, or a staff reason (any other string, e.g. `staff`). The first three are billing holds.
   */
  suspensionReason: SuspensionReason | null;
  /** Whether the signed-in staff member watches this tenant. */
  watched: boolean;
}

export interface TenantSummary {
  total: number;
  active: number;
  trials: number;
  mrr: number;
  arpa: number;
  atRisk: number;
  atRiskMrr: number;
  learners: number;
  /** Count per segment. An array (not a map) so segment ids survive the snake/camel key conversion. */
  segments: { segment: TenantSegment; count: number }[];
}

export interface TenantLimit {
  /** Snake_case value (`storage_gb`), as Laravel sends it; `limitKeyOf()` gives the app key. */
  key: LimitKeyWire;
  value: number;
  planDefault: number;
  overridden: boolean;
}

export interface TenantModule {
  id: string;
  label: string;
  group: string;
  enabled: boolean;
  planDefault: boolean;
  overridden: boolean;
}

export interface TenantDetail extends Tenant {
  /** Where the data is now. */
  region: Region;
  /**
   * A requested data-residency move the platform team hasn't carried out yet (there is no automatic cutover), or null.
   * Changing `region` via PATCH creates one; it never moves the data by itself.
   */
  regionRequest: { region: Region; requestedAt: string; requestedBy?: string } | null;
  notes: string | null;
  storageUsedGb: number;
  seatsUsed: number;
  healthScore: {
    score: number;
    churnRisk: 'Low' | 'Medium' | 'High';
    drivers: { label: string; value: string; trend: 'up' | 'down' }[];
  };
  limits: TenantLimit[];
  modules: TenantModule[];
  extensions: { key: string; name: string; price: number; state: 'comped' | 'paying' | 'none' }[];
  flags: { key: string; name: string; enabled: boolean; overridden: boolean }[];
  invoices: { id: string; issuedAt: string; amount: number; status: 'Paid' | 'Past due' | 'Waived' | 'Void' | 'Open' }[];
  timeline: { at: string; text: string }[];
  /** Trial and card state of the subscription; null when the tenant has no subscription yet. */
  trial: TenantTrial | null;
  /**
   * When the abuse queue's "Freeze checkout" blocked new card payments; null when not frozen. Lifted with
   * `DELETE /governance/tenants/{id}/checkout-freeze` (governance.manage).
   */
  checkoutFrozenAt: string | null;
}

/** Plan key on the provisioning wire (`launch|growth|scale`; the API also accepts the display names). */
export type PlanKey = 'launch' | 'growth' | 'scale';

/** `POST /tenants` body. */
export interface ProvisionTenantInput {
  name: string;
  ownerEmail: string;
  plan: PlanKey;
}

export type TenantUpdate = Partial<{ plan: Plan; region: Region; notes: string | null }>;

export type TenantAction =
  'suspend' | 'reactivate' | 'extend-trial' | 'export' | 'purge' | 'revoke-sessions' | 'reset-password' | 'reissue-ssl';

/** `POST /tenants/{id}/extend-trial` body. */
export interface ExtendTrialInput {
  /**
   * Days to add, 1–90 (default 14). A paused tenant gets a new trial of this many days from now.
   * @minimum 1
   * @maximum 90
   */
  days?: number;
}

export type BulkTenantAction = 'suspend' | 'watch' | 'export';

/** `POST /tenants/{id}/impersonate` body. */
export interface ImpersonationInput {
  /**
   * What the operator is investigating, 5–300 characters. Required when the platform setting
   * `impersonation_requires_reason` is on; appended to the audit entry.
   */
  reason?: string;
}

export interface Impersonation {
  tenantId: string;
  /** URL of the tenant dashboard with a short-lived, read-only impersonation token. */
  url: string;
  expiresAt: string;
}
