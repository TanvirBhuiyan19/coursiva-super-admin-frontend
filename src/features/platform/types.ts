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
  /** Per-domain volume and rates need the mail provider's event webhooks: null = not measured. */
  sent30d: number | null;
  /** Percent, e.g. 2.9 */
  bounceRate: number | null;
  /** Percent, e.g. 0.31 */
  complaintRate: number | null;
  risk: SenderRisk;
  paused: boolean;
  pausedAt: string | null;
  dnsCheckedAt: string;
}

export interface Deliverability {
  summary: {
    sent30d: number;
    /** Volume-weighted percent across every domain; null = not measured. */
    bounceRate: number | null;
    complaintRate: number | null;
    domainsAtRisk: number;
    thresholds: { bounceWatch: number; bounceMax: number; complaintWatch: number; complaintMax: number };
  };
  domains: SenderDomain[];
  /** `count` null = not aggregated platform-wide (suppressions live in each school's database). */
  suppression: { list: string; count: number | null; note: string }[];
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
  /** `xapiStatements24h` / `ltiLaunches30d`: null = not measured platform-wide yet. */
  summary: { scormPackages: number; xapiStatements24h: number | null; ltiLaunches30d: number | null; failedImports: number };
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
  endpoints: {
    id: string;
    /** null = a platform-level endpoint. */
    tenantId: string | null;
    url: string;
    /** Subscribed event names; `*` = every event. */
    events: string[];
    successRate7d: number;
    status: 'Healthy' | 'Failing';
  }[];
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

// ---------- Connections (Stripe, Cloudflare, Expo push, email, ad networks, insights, AI studio, ClamAV, metrics, OAuth apps) ----------
export const CONNECTION_KINDS = [
  'payments',
  'cdn',
  'push',
  'email',
  'ads',
  'insights',
  'ai',
  'security',
  'monitoring',
  'video',
  'oauth',
  'storage',
  'drm',
] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/** A credential field as the server shows it: never a secret. */
export interface ConnectionField {
  key: string;
  label: string;
  secret: boolean;
  configured: boolean;
  /** Last four characters of stored values of 12+ characters. */
  last4: string | null;
  /** Stored value of a non-secret field; always null for secrets. */
  value: string | null;
  /** A fixed choice (shown as a switch instead of a text box); null for free text. */
  options?: { value: string; label: string }[] | null;
  /** The value in effect while none is stored. */
  default?: string | null;
}

/** A service the platform connects to with credentials pasted here (storage and DRM live on the Media screen). */
export interface PlatformConnection {
  key: string;
  name: string;
  description: string;
  role: string | null;
  kind: ConnectionKind;
  connected: boolean;
  verifiedAt: string | null;
  fields: ConnectionField[];
  /** Capabilities that need this connection, each with its "Available to schools" switch (see Feature availability). */
  capabilities: ConnectionCapability[];
}

export interface ConnectionCapability {
  key: string;
  label: string;
  on: boolean;
}

/** PUT body: new values for any fields; blank or omitted fields keep their stored value. */
export interface ConnectionInput {
  credentials: { field: string; value: string }[];
}

/** `POST /platform/connections/{key}/test`. */
export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

// ---------- Feature availability ----------
/** A platform connection a capability needs. */
export interface CapabilityRequirement {
  key: string;
  label: string;
  connected: boolean;
}

/**
 * A switchable thing schools can see (a module, an extension, a provider, an app). Unavailable = hidden from every
 * school (dashboard, student site, API, jobs), above plans, extensions and tenant overrides.
 */
export interface Capability {
  key: string;
  label: string;
  /** Key of its group in `groups`. */
  group: string;
  /** What schools lose when it is off. */
  description: string;
  /** Short list of what disappears, for the confirm dialog. */
  surfaces: string[];
  /** Dashboard module ids it hides. */
  modules: string[];
  /** Extension keys it hides from the store, trials and pricing. */
  extensions: string[];
  requires: CapabilityRequirement[];
  /** true: any one of `requires` is enough; false: every one must be connected. */
  requiresAny: boolean;
  /** The owner's switch (a missing switch is on). */
  on: boolean;
  /** `on` and its connections are connected. */
  available: boolean;
  /** Schools using it now (cached 5 minutes); null = not counted. */
  schoolsUsing: number | null;
  /** Schools paying for one of its extensions; null = not counted (or no extension). */
  payingSchools: number | null;
}

export interface CapabilityGroup {
  key: string;
  label: string;
}

/** `GET /platform/availability`. Groups are in display order. */
export interface Availability {
  capabilities: Capability[];
  groups: CapabilityGroup[];
}

/** `PUT /platform/availability/{key}`. */
export interface AvailabilityUpdate {
  on: boolean;
}
