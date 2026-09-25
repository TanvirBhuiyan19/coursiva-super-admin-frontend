// API resources for /tenants. These types are the contract the Laravel TenantResource must match.
import type { LimitKey, Plan, Region, TenantHealth, TenantStatus } from '@/lib/domain';

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
  key: LimitKey;
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
  region: Region;
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
  invoices: { id: string; issuedAt: string; amount: number; status: 'Paid' | 'Past due' | 'Waived' }[];
  timeline: { at: string; text: string }[];
}

export interface ProvisionTenantInput {
  name: string;
  ownerEmail: string;
  plan: Plan;
}

export type TenantUpdate = Partial<{ plan: Plan; region: Region; notes: string | null }>;

export type TenantAction =
  'suspend' | 'reactivate' | 'extend-trial' | 'export' | 'purge' | 'revoke-sessions' | 'reset-password' | 'reissue-ssl';

export type BulkTenantAction = 'suspend' | 'watch' | 'export';

export interface Impersonation {
  tenantId: string;
  /** URL of the tenant dashboard with a short-lived, read-only impersonation token. */
  url: string;
  expiresAt: string;
}
