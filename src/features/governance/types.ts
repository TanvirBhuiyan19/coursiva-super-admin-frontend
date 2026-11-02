// API resources for /governance/*. These types are the contract the Laravel governance controllers must match.
import type { Plan, Region } from '@/lib/domain';

// ---------- Compliance & privacy ----------
export const DSAR_TYPES = ['Access', 'Deletion', 'Portability'] as const;
export type DsarType = (typeof DSAR_TYPES)[number];

/** Data subject request (GDPR Art. 15 / 17 / 20). */
export interface Dsar {
  id: string;
  requester: string;
  tenantId: string;
  tenantName: string;
  type: DsarType;
  receivedAt: string;
  /** Statutory deadline (30 days after receipt). */
  dueAt: string;
  /** Set when fulfilled — for a Deletion request this is when the data was erased. */
  fulfilledAt: string | null;
}

export type DsarStatus = 'open' | 'fulfilled';

export interface ComplianceSummary {
  openDsars: number;
  overdueDsars: number;
  /** Deadline of the most urgent open request, or null when nothing is open. */
  nearestDueAt: string | null;
  subProcessors: number;
  /** Tenants that accepted the live Data Processing Agreement. */
  dpasSigned: number;
  tenants: number;
}

export const RETENTION_PERIODS = ['30 days', '90 days', '1 year', '3 years', '7 years'] as const;
export type RetentionPeriod = (typeof RETENTION_PERIODS)[number];

export interface RetentionSetting {
  /** Stable data-class key, e.g. `deleted_students`. */
  key: string;
  label: string;
  period: RetentionPeriod;
  defaultPeriod: RetentionPeriod;
}

export interface SubProcessor {
  id: string;
  name: string;
  purpose: string;
  location: string;
}

// ---------- Trust & moderation ----------
export const SEVERITIES = ['High', 'Medium', 'Low'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** `limited` is interim (hidden while the tenant responds); `removed` is an upheld violation (a strike). */
export const DECISIONS = ['removed', 'limited', 'kept'] as const;
export type ModerationDecision = (typeof DECISIONS)[number];

export interface ModerationReport {
  id: string;
  kind: string;
  tenantId: string;
  tenantName: string;
  /** Where on the tenant the content lives, e.g. "Course · “Pasta Masterclass”". */
  location: string;
  detail: string;
  source: string;
  severity: Severity;
  receivedAt: string;
  decision: ModerationDecision | null;
  decidedAt: string | null;
  decidedBy: string | null;
}

/** `open` = no final decision yet (undecided or access limited); `decided` = removed or kept. */
export type ReportStatus = 'open' | 'decided';

export interface ReportListParams {
  status?: ReportStatus;
  severity?: Severity;
  page?: number;
  perPage?: number;
}

export interface ReportListMeta {
  /** Reports per severity within the current `status` (ignores the severity filter). */
  severityCounts: { severity: Severity; count: number }[];
}

export interface ModerationSummary {
  openReports: number;
  openHigh: number;
  dmcaNotices90d: number;
  /** Median hours from receipt to a decision, over decided reports. Null when none decided. */
  medianHoursToAction: number | null;
  tenantsOnStrikes: number;
  /** Upheld strikes that suspend publishing. */
  strikeLimit: number;
}

export interface TenantStrikes {
  tenantId: string;
  tenantName: string;
  strikes: number;
  publishingSuspended: boolean;
  history: { kind: string; decidedAt: string }[];
}

// ---------- Policies & terms ----------
export type PolicyState = 'Draft' | 'Live' | 'Superseded';

/** Document families the console versions (Laravel GovernanceController::POLICY_FAMILIES). */
export const POLICY_FAMILIES = ['tos', 'dpa', 'aup', 'student_terms'] as const;
export type PolicyFamily = (typeof POLICY_FAMILIES)[number];

/** `POST /governance/policies` — a new Draft version (one draft per family; the version label must be new). */
export interface PolicyDraftInput {
  docKey: PolicyFamily;
  version: string;
  note?: string | null;
}

export interface PolicyDocument {
  id: string;
  /** Document family, e.g. `tos`, `dpa`. One Live version per family. */
  docKey: string;
  name: string;
  version: string;
  state: PolicyState;
  /** What changed in this version; null when none was given. */
  note: string | null;
  publishedAt: string | null;
  /** End of the 30-day acceptance window (Live versions). */
  acceptanceDeadline: string | null;
  /** Live versions only; null otherwise. */
  acceptance: { accepted: number; total: number } | null;
}

export interface PolicyOverview {
  documents: PolicyDocument[];
  nextReviewAt: string;
}

/** A tenant's standing on one document version. Acceptance and reminders are tracked separately. */
export interface PolicyAcceptance {
  tenantId: string;
  tenantName: string;
  plan: Plan;
  acceptedAt: string | null;
  lastRemindedAt: string | null;
  reminders: number;
}

// ---------- Data residency ----------
export interface RegionInfo {
  region: Region;
  label: string;
  framework: string;
  tenants: number;
  learners: number;
}

export interface TenantResidency {
  tenantId: string;
  name: string;
  plan: Plan;
  students: number;
  /** Where the data is now. A requested move doesn't change it (there is no automatic cutover). */
  region: Region;
  /** A move was requested and the platform team hasn't migrated the data yet. */
  migrating: boolean;
  /** Target of the pending move, or null. */
  requestedRegion: Region | null;
}

export interface RegionSummary {
  regions: RegionInfo[];
  tenants: TenantResidency[];
  pendingMigrations: number;
  subProcessors: number;
}

// ---------- Abuse & limits ----------
export interface AbuseSignal {
  id: string;
  severity: Severity;
  tenantId: string;
  tenantName: string;
  signal: string;
  /** Recommended action, e.g. `freeze_checkout`. */
  action: AbuseAction;
  actionLabel: string;
  detectedAt: string;
}

export type AbuseAction = 'freeze_checkout' | 'raise_limit' | 'acknowledge';

/** Result of applying a signal's recommended action. */
export interface AbuseActionResult {
  signalId: string;
  /** Operator-facing sentence describing what happened. */
  outcome: string;
}

export interface RateLimit {
  plan: Plan;
  perMinute: number;
  /** Plan default (`api_per_minute` in the plan limits). */
  defaultPerMinute: number;
  /** Highest per-tenant rate seen today on this plan; null = not sampled yet. */
  peakPerMinute: number | null;
}

export interface BlockedIp {
  id: string;
  /** IPv4, IPv6 or CIDR range. */
  ip: string;
  reason: string;
  blockedAt: string;
  blockedBy: string;
}
