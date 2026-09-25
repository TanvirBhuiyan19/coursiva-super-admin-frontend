// API resources for /platform/*. These types are the contract the Laravel platform controllers must match.

// ---------- Feature flags ----------
export const FLAG_ROLLOUTS = ['All tenants', 'Scale only', 'Growth and Scale', 'Beta list', '10% of tenants'] as const;
export type FlagRollout = (typeof FLAG_ROLLOUTS)[number];

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rollout: FlagRollout;
  /** Tenants that override this flag individually (from the tenant drawer). */
  tenantOverrides: number;
}

export type FlagUpdate = Partial<{ enabled: boolean; rollout: FlagRollout }>;

// ---------- System status ----------
export interface PlatformService {
  id: string;
  name: string;
  /** Uptime over the last 90 days, percent (e.g. 99.93). */
  uptime90d: number;
  status: 'Operational' | 'Degraded';
}

export interface SystemStatus {
  incident: { title: string; postedAt: string; serviceIds: string[] } | null;
  statusPageUrl: string;
  services: PlatformService[];
}

export interface PostIncidentInput {
  title: string;
  serviceIds: string[];
}

// ---------- Email deliverability ----------
export type DnsCheck = 'Pass' | 'Fail' | 'Not set';
/** Risk band from provider thresholds (computed server-side). */
export type SenderRisk = 'Healthy' | 'Watch' | 'Over threshold';

export interface SenderDomain {
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  spf: DnsCheck;
  dkim: DnsCheck;
  /** DMARC policy as published, e.g. `p=reject`, or `none`. */
  dmarc: string;
  sent30d: number;
  /** Percent, e.g. 2.9 */
  bounceRate: number;
  /** Percent, e.g. 0.31 */
  complaintRate: number;
  risk: SenderRisk;
  paused: boolean;
  pausedAt: string | null;
  dnsCheckedAt: string;
}

export interface Deliverability {
  summary: {
    sent30d: number;
    /** Volume-weighted percent across every domain. */
    bounceRate: number;
    complaintRate: number;
    domainsAtRisk: number;
    thresholds: { bounceWatch: number; bounceMax: number; complaintWatch: number; complaintMax: number };
  };
  domains: SenderDomain[];
  suppression: { list: string; count: number; note: string }[];
}

// ---------- Certificate authority ----------
export interface Certificate {
  /** Public certificate id, e.g. `AC-2026-0341`. */
  id: string;
  learnerName: string;
  tenantId: string;
  tenantName: string;
  course: string;
  issuedAt: string;
  status: 'Valid' | 'Revoked';
  revokedAt: string | null;
  verifyUrl: string;
}

export interface CertificateParams {
  page?: number;
  perPage?: number;
  search?: string;
}

export interface CertificateSummary {
  issued: number;
  verified30d: number;
  revoked: number;
  orphaned: number;
}

export interface RegistryPolicy {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

// ---------- Standards & conformance ----------
export type StandardSupport = 'Supported' | 'Partial' | 'Not supported';

export interface Standards {
  summary: { scormPackages: number; xapiStatements24h: number; ltiLaunches30d: number; failedImports: number };
  standards: {
    id: string;
    name: string;
    direction: 'Import' | 'Export' | 'Both';
    packages: number;
    note: string;
    support: StandardSupport;
  }[];
  failedImports: FailedImport[];
  accessibility: { surface: string; level: string; status: 'Conformant' | 'Partial' | 'Not conformant'; note: string }[];
}

export interface FailedImport {
  id: string;
  tenantId: string;
  tenantName: string;
  file: string;
  reason: string;
  failedAt: string;
}

export interface ReprocessResult {
  id: string;
  file: string;
  tenantName: string;
  outcome: 'imported' | 'rejected';
  message: string;
}

// ---------- API & webhooks ----------
export const API_KEY_SCOPES = ['Full access', 'Read only'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKey {
  id: string;
  name: string;
  /** Masked prefix, e.g. `sk_live_••••4f2a`. The full secret is never returned after creation. */
  prefix: string;
  scope: ApiKeyScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** `POST /platform/api-keys` response — the only time `secret` is ever sent. */
export interface CreatedApiKey extends ApiKey {
  secret: string;
}

export interface ApiKeyInput {
  name: string;
  scope: ApiKeyScope;
}

export interface Webhooks {
  endpoints: { id: string; tenantId: string | null; url: string; events: string; successRate7d: number; status: 'Healthy' | 'Failing' }[];
  failedDeliveries: WebhookDelivery[];
}

export interface WebhookDelivery {
  id: string;
  event: string;
  url: string;
  error: string;
  attempts: number;
  lastAttemptAt: string;
}

export interface RetryResult {
  delivered: boolean;
  /** HTTP status of the retry, or null on timeout. */
  status: number | null;
  delivery: WebhookDelivery | null;
}
