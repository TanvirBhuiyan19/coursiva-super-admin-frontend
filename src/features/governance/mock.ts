// Mock implementation of /governance/* (what the Laravel governance controllers + policies will do).
import { http } from 'msw';
import { apiRateLimits, audit, dsars, tenants, type DsarRow } from '@/mocks/collections';
import { ago, collection, id, singleton } from '@/mocks/db';
import { effectiveLimits } from '@/mocks/derive';
import { authorize, handle, invalid, noContent, notFound, ok, paginate, query, readBody, recordAudit, route } from '@/mocks/http';
import { PLAN_LIMITS } from '@/mocks/reference';
import { PLANS, REGIONS, type Plan, type Region } from '@/lib/domain';
import { IP_ERROR, isIpOrCidr } from './ip';
import {
  RETENTION_PERIODS,
  SEVERITIES,
  type AbuseAction,
  type AbuseSignal,
  type BlockedIp,
  type ComplianceSummary,
  type Dsar,
  type ModerationDecision,
  type ModerationReport,
  type ModerationSummary,
  type PolicyAcceptance,
  type PolicyDocument,
  type PolicyState,
  type RateLimit,
  type RegionSummary,
  type RetentionPeriod,
  type RetentionSetting,
  type Severity,
  type SubProcessor,
  type TenantStrikes,
} from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STRIKE_LIMIT = 3;
const ACCEPTANCE_WINDOW_DAYS = 30;
const CUTOVER_MINUTES = 20;

const tenantName = (tenantId: string) => tenants.find(tenantId)?.name ?? 'Deleted tenant';
const plusHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * HOUR).toISOString();
const findOr404 = <T>(row: T | undefined, what: string): T => {
  if (!row) throw notFound(what);
  return row;
};

// ---------- Feature tables ----------
export const subProcessors = collection<SubProcessor>('governanceSubProcessors', () => [
  { id: 'sp_stripe', name: 'Stripe', purpose: 'Payments & subscription billing', location: 'US / EU' },
  { id: 'sp_aws', name: 'AWS', purpose: 'Application hosting & database', location: 'EU (Frankfurt)' },
  { id: 'sp_cloudflare', name: 'Cloudflare', purpose: 'CDN, WAF & custom domains', location: 'Global' },
  { id: 'sp_mux', name: 'Mux', purpose: 'Video encoding & delivery', location: 'US / EU' },
  { id: 'sp_postmark', name: 'Postmark', purpose: 'Transactional email', location: 'US' },
  { id: 'sp_zoom', name: 'Zoom', purpose: 'Live class hosting', location: 'US' },
]);

const RETENTION_CLASSES: { key: string; label: string; defaultPeriod: RetentionPeriod }[] = [
  { key: 'deleted_students', label: 'Deleted student records', defaultPeriod: '90 days' },
  { key: 'cancelled_workspaces', label: 'Cancelled tenant workspaces', defaultPeriod: '1 year' },
  { key: 'payment_records', label: 'Payment & invoice records', defaultPeriod: '7 years' },
  { key: 'audit_logs', label: 'Audit & security logs', defaultPeriod: '1 year' },
];
/** Data-class key → retention period. Absent = the class default. */
export const retention = singleton<{ periods: Record<string, RetentionPeriod> }>('governanceRetention', () => ({ periods: {} }));

export interface ReportRow {
  id: string;
  kind: string;
  tenantId: string;
  location: string;
  detail: string;
  source: string;
  severity: Severity;
  receivedAt: string;
  decision: ModerationDecision | null;
  decidedAt: string | null;
  decidedBy: string | null;
}
const decided = (
  rowId: string,
  kind: string,
  tenantId: string,
  location: string,
  detail: string,
  daysAgo: number,
  hoursToAction: number,
  decision: ModerationDecision,
): ReportRow => {
  const receivedAt = ago({ d: daysAgo });
  return {
    id: rowId,
    kind,
    tenantId,
    location,
    detail,
    source: kind === 'DMCA' ? 'Legal notice' : 'Rights holder complaint',
    severity: 'High',
    receivedAt,
    decision,
    decidedAt: plusHours(receivedAt, hoursToAction),
    decidedBy: 'Priya Nair',
  };
};
export const reports = collection<ReportRow>('governanceReports', () => [
  {
    id: 'rp_1',
    kind: 'DMCA',
    tenantId: 'tn_silva',
    location: 'Course · “Pasta Masterclass”',
    detail: 'Rights holder claims 4 lesson videos are re-uploads of their paid course.',
    source: 'Legal notice · 10-day counter window',
    severity: 'High',
    receivedAt: ago({ h: 2 }),
    decision: null,
    decidedAt: null,
    decidedBy: null,
  },
  {
    id: 'rp_2',
    kind: 'Reported post',
    tenantId: 'tn_amplify',
    location: 'Community · #wins',
    detail: 'Member posted an affiliate link for an unrelated crypto product.',
    source: '3 member reports',
    severity: 'Medium',
    receivedAt: ago({ h: 5 }),
    decision: null,
    decidedAt: null,
    decidedBy: null,
  },
  {
    id: 'rp_3',
    kind: 'Prohibited content',
    tenantId: 'tn_bloom',
    location: 'Storefront · Home page',
    detail: 'Automated scan flagged health claims that need substantiation.',
    source: 'Auto-detected · policy 4.2',
    severity: 'Medium',
    receivedAt: ago({ d: 1 }),
    decision: null,
    decidedAt: null,
    decidedBy: null,
  },
  {
    id: 'rp_4',
    kind: 'Impersonation',
    tenantId: 'tn_ledger',
    location: 'Branding · logo & domain',
    detail: 'Uses a competitor’s registered trademark in the wordmark.',
    source: 'Rights holder complaint',
    severity: 'High',
    receivedAt: ago({ d: 1, h: 3 }),
    decision: null,
    decidedAt: null,
    decidedBy: null,
  },
  {
    id: 'rp_5',
    kind: 'Spam signup',
    tenantId: 'tn_devpath',
    location: 'Students · bulk import',
    detail: '480 disposable-domain accounts created in 20 minutes.',
    source: 'Auto-detected · velocity rule',
    severity: 'Low',
    receivedAt: ago({ d: 2 }),
    decision: null,
    decidedAt: null,
    decidedBy: null,
  },
  // Decided history — upheld removals are the tenants' strikes.
  decided('rp_h1', 'DMCA', 'tn_silva', 'Course · “Knife Skills”', 'Lesson video matched a rights holder’s fingerprint.', 100, 6, 'removed'),
  decided('rp_h2', 'DMCA', 'tn_silva', 'Course · “Sourdough Basics”', 'Two lessons re-uploaded from a paid course.', 12, 9, 'removed'),
  decided('rp_h3', 'Prohibited content', 'tn_bloom', 'Course page · “Healing Herbs”', 'Unsubstantiated medical claims.', 18, 4, 'removed'),
  decided('rp_h4', 'Impersonation', 'tn_ledger', 'Storefront · About page', 'Claimed accreditation it doesn’t hold.', 9, 6, 'removed'),
  decided('rp_h5', 'DMCA', 'tn_nordic', 'Course · “Morning Flow”', 'Music track licence disputed — licence confirmed.', 40, 7, 'kept'),
  decided('rp_h6', 'DMCA', 'tn_devpath', 'Course · “React in 30 Days”', 'Claimed code samples — found to be MIT licensed.', 60, 5, 'kept'),
]);

export interface PolicyRow {
  id: string;
  docKey: string;
  name: string;
  version: string;
  state: PolicyState;
  note: string;
  publishedAt: string | null;
  acceptanceDeadline: string | null;
}
const live = (rowId: string, docKey: string, name: string, version: string, note: string, daysAgo: number): PolicyRow => ({
  id: rowId,
  docKey,
  name,
  version,
  state: 'Live',
  note,
  publishedAt: ago({ d: daysAgo }),
  acceptanceDeadline: ago({ d: daysAgo - ACCEPTANCE_WINDOW_DAYS }),
});
export const policies = collection<PolicyRow>('governancePolicies', () => [
  {
    id: 'pd_tos_42',
    docKey: 'tos',
    name: 'Platform Terms of Service',
    version: 'v4.2',
    state: 'Draft',
    note: 'Adds AI-feature terms and clarifies content ownership.',
    publishedAt: null,
    acceptanceDeadline: null,
  },
  live('pd_tos_41', 'tos', 'Platform Terms of Service', 'v4.1', 'Current terms for every tenant workspace', 12),
  live('pd_dpa_23', 'dpa', 'Data Processing Agreement', 'v2.3', 'Includes the updated sub-processor list', 120),
  live('pd_aup_18', 'aup', 'Acceptable Use Policy', 'v1.8', 'Prohibited content and abuse rules', 200),
  live('pd_st_30', 'student_terms', 'Student Terms template', 'v3.0', 'Rendered on every tenant storefront', 90),
]);

const SEED_TENANTS = [
  'tn_amplify',
  'tn_nordic',
  'tn_devpath',
  'tn_silva',
  'tn_northstar',
  'tn_atlas',
  'tn_peak',
  'tn_kodo',
  'tn_ledger',
  'tn_bloom',
];
export interface AcceptanceRow {
  id: string;
  documentId: string;
  tenantId: string;
  acceptedAt: string;
}
export const acceptances = collection<AcceptanceRow>('governancePolicyAcceptances', () => {
  const rows: AcceptanceRow[] = [];
  const add = (documentId: string, tenantIds: string[], daysAgo: number) =>
    tenantIds.forEach((tenantId, i) =>
      rows.push({ id: `pa_${documentId}_${tenantId}`, documentId, tenantId, acceptedAt: ago({ d: daysAgo - i }) }),
    );
  add('pd_tos_41', ['tn_amplify', 'tn_nordic'], 10);
  add(
    'pd_dpa_23',
    SEED_TENANTS.filter((t) => t !== 'tn_bloom'),
    115,
  );
  add('pd_aup_18', SEED_TENANTS, 190);
  add('pd_st_30', SEED_TENANTS, 85);
  return rows;
});

/** Reminders are a separate table: sending one never counts as acceptance. */
export interface ReminderRow {
  id: string;
  documentId: string;
  tenantId: string;
  sentAt: string;
}
export const reminders = collection<ReminderRow>('governancePolicyReminders', () => []);

const REGION_INFO: Record<Region, { label: string; framework: string }> = {
  EU: { label: 'EU · Frankfurt', framework: 'GDPR · Schrems II' },
  US: { label: 'US · Virginia', framework: 'SOC 2 · CCPA' },
  APAC: { label: 'AP · Sydney', framework: 'Australian Privacy Act' },
};

export interface SignalRow {
  id: string;
  severity: Severity;
  tenantId: string;
  signal: string;
  action: AbuseAction;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: 'actioned' | 'dismissed' | null;
}
const ACTION_LABELS: Record<AbuseAction, string> = {
  freeze_checkout: 'Freeze checkout',
  raise_limit: 'Raise limit',
  acknowledge: 'Acknowledge',
};
export const signals = collection<SignalRow>('governanceAbuseSignals', () => [
  {
    id: 'as_1',
    severity: 'High',
    tenantId: 'tn_bloom',
    signal: '412 failed card attempts in 1h — likely card testing',
    action: 'freeze_checkout',
    detectedAt: ago({ m: 40 }),
    resolvedAt: null,
    resolution: null,
  },
  {
    id: 'as_2',
    severity: 'Medium',
    tenantId: 'tn_kodo',
    signal: 'API rate limit hit 38× today (Launch cap 60/min)',
    action: 'raise_limit',
    detectedAt: ago({ h: 3 }),
    resolvedAt: null,
    resolution: null,
  },
  {
    id: 'as_3',
    severity: 'Low',
    tenantId: 'tn_devpath',
    signal: 'Bulk export of 3,112 student records by owner',
    action: 'acknowledge',
    detectedAt: ago({ h: 7 }),
    resolvedAt: null,
    resolution: null,
  },
]);

/** Per-plan API rate limits — the shared `apiRateLimits` table (tenant limits read it via `planLimits`). */
export const rateLimits = apiRateLimits;
const PEAKS: Record<Plan, number> = { Launch: 58, Growth: 211, Scale: 940 };

export const blockedIps = collection<BlockedIp>('governanceBlockedIps', () => [
  { id: 'ip_1', ip: '203.0.113.42', reason: 'Credential stuffing', blockedAt: ago({ m: 5 }), blockedBy: 'System' },
  { id: 'ip_2', ip: '198.51.100.7', reason: 'Card testing', blockedAt: ago({ h: 2 }), blockedBy: 'System' },
  { id: 'ip_3', ip: '192.0.2.115', reason: 'Scraper', blockedAt: ago({ d: 1 }), blockedBy: 'System' },
]);

// ---------- Resources ----------
const toDsar = (r: DsarRow): Dsar => ({ ...r, tenantName: tenantName(r.tenantId) });

const toReport = (r: ReportRow): ModerationReport => ({ ...r, tenantName: tenantName(r.tenantId) });
const isOpenReport = (r: ReportRow) => r.decision === null || r.decision === 'limited';

function strikeRecords(): TenantStrikes[] {
  const byTenant = new Map<string, ReportRow[]>();
  for (const r of reports.where((x) => x.decision === 'removed')) byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r]);
  return [...byTenant.entries()]
    .map(([tenantId, rows]) => ({
      tenantId,
      tenantName: tenantName(tenantId),
      strikes: rows.length,
      publishingSuspended: rows.length >= STRIKE_LIMIT,
      history: rows
        .map((r) => ({ kind: r.kind, decidedAt: r.decidedAt ?? r.receivedAt }))
        .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt)),
    }))
    .sort((a, b) => b.strikes - a.strikes || a.tenantName.localeCompare(b.tenantName));
}

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const acceptedBy = (documentId: string) => new Set(acceptances.where((a) => a.documentId === documentId).map((a) => a.tenantId));

function toPolicy(p: PolicyRow): PolicyDocument {
  const all = tenants.all();
  const accepted = acceptedBy(p.id);
  return {
    ...p,
    acceptance: p.state === 'Live' ? { accepted: all.filter((t) => accepted.has(t.id)).length, total: all.length } : null,
  };
}

function toAcceptance(p: PolicyRow, tenantId: string): PolicyAcceptance {
  const t = findOr404(tenants.find(tenantId), 'Tenant');
  const accepted = acceptances.where((a) => a.documentId === p.id && a.tenantId === tenantId)[0];
  const sent = reminders.where((r) => r.documentId === p.id && r.tenantId === tenantId).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  return {
    tenantId,
    tenantName: t.name,
    plan: t.plan,
    acceptedAt: accepted?.acceptedAt ?? null,
    lastRemindedAt: sent[0]?.sentAt ?? null,
    reminders: sent.length,
  };
}

const rateLimitFor = (plan: Plan) => rateLimits.get()[plan];

function toSignal(s: SignalRow): AbuseSignal {
  return {
    id: s.id,
    severity: s.severity,
    tenantId: s.tenantId,
    tenantName: tenantName(s.tenantId),
    signal: s.signal,
    action: s.action,
    actionLabel: ACTION_LABELS[s.action],
    detectedAt: s.detectedAt,
  };
}

function migratingTenants() {
  const since = Date.now() - CUTOVER_MINUTES * 60_000;
  return new Set(
    audit
      .where((a) => a.action.startsWith('Scheduled data-residency move') && new Date(a.createdAt).getTime() >= since)
      .map((a) => a.tenantId)
      .filter((x): x is string => !!x),
  );
}

const SEVERITY_RANK: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };

type Params = { id: string };

export const handlers = [
  // ---------- Compliance & privacy ----------
  http.get(
    route('/governance/compliance'),
    handle(() => {
      authorize('governance.view');
      const open = dsars.where((r) => !r.fulfilledAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      const dpa = policies.where((p) => p.docKey === 'dpa' && p.state === 'Live')[0];
      const all = tenants.all();
      const signed = dpa ? acceptedBy(dpa.id) : new Set<string>();
      const body: ComplianceSummary = {
        openDsars: open.length,
        overdueDsars: open.filter((r) => new Date(r.dueAt).getTime() <= Date.now()).length,
        nearestDueAt: open[0]?.dueAt ?? null,
        subProcessors: subProcessors.all().length,
        dpasSigned: all.filter((t) => signed.has(t.id)).length,
        tenants: all.length,
      };
      return ok(body);
    }),
  ),

  http.get(
    route('/governance/dsars'),
    handle(({ request }) => {
      authorize('governance.view');
      const status = query(request).get('status');
      const rows = dsars
        .all()
        .filter((r) => (status === 'open' ? !r.fulfilledAt : status === 'fulfilled' ? !!r.fulfilledAt : true))
        .sort((a, b) =>
          !a.fulfilledAt && !b.fulfilledAt
            ? a.dueAt.localeCompare(b.dueAt)
            : a.fulfilledAt && b.fulfilledAt
              ? b.fulfilledAt.localeCompare(a.fulfilledAt)
              : a.fulfilledAt
                ? 1
                : -1,
        );
      return paginate(rows.map(toDsar), request);
    }),
  ),

  http.post<Params>(
    route('/governance/dsars/:id/fulfil'),
    handle<Params>(({ params }) => {
      authorize('governance.manage');
      const r = findOr404(dsars.find(params.id), 'Request');
      if (r.fulfilledAt) throw invalid({ status: 'This request has already been fulfilled.' });
      dsars.update(r.id, { fulfilledAt: new Date().toISOString() });
      const tenant = tenantName(r.tenantId);
      recordAudit(
        r.type === 'Deletion'
          ? `Erased personal data for ${r.requester} (${tenant})`
          : `${r.type} request fulfilled for ${r.requester} (${tenant})`,
        'Security',
        r.tenantId,
      );
      return ok(toDsar(r));
    }),
  ),

  http.get(
    route('/governance/retention'),
    handle(() => {
      authorize('governance.view');
      const periods = retention.get().periods;
      return ok(RETENTION_CLASSES.map<RetentionSetting>((c) => ({ ...c, period: periods[c.key] ?? c.defaultPeriod })));
    }),
  ),

  http.put<{ key: string }>(
    route('/governance/retention/:key'),
    handle<{ key: string }>(async ({ request, params }) => {
      authorize('governance.manage');
      const cls = findOr404(
        RETENTION_CLASSES.find((c) => c.key === params.key),
        'Data class',
      );
      const { period } = await readBody<{ period: RetentionPeriod }>(request);
      if (!RETENTION_PERIODS.includes(period)) throw invalid({ period: 'Choose one of the listed retention periods.' });
      retention.set({ periods: { ...retention.get().periods, [cls.key]: period } });
      recordAudit(`Retention for ${cls.label.toLowerCase()} set to ${period}`, 'Security');
      return ok<RetentionSetting>({ ...cls, period });
    }),
  ),

  http.get(
    route('/governance/sub-processors'),
    handle(() => {
      authorize('governance.view');
      return ok(subProcessors.all());
    }),
  ),

  // ---------- Trust & moderation ----------
  http.get(
    route('/governance/moderation'),
    handle(() => {
      authorize('governance.view');
      const open = reports.where(isOpenReport);
      const since = Date.now() - 90 * DAY;
      const hours = reports
        .where((r) => !!r.decidedAt)
        .map((r) => (new Date(r.decidedAt!).getTime() - new Date(r.receivedAt).getTime()) / HOUR);
      const med = median(hours);
      const body: ModerationSummary = {
        openReports: open.length,
        openHigh: open.filter((r) => r.severity === 'High').length,
        dmcaNotices90d: reports.where((r) => r.kind === 'DMCA' && new Date(r.receivedAt).getTime() >= since).length,
        medianHoursToAction: med === null ? null : Math.round(med),
        tenantsOnStrikes: strikeRecords().length,
        strikeLimit: STRIKE_LIMIT,
      };
      return ok(body);
    }),
  ),

  http.get(
    route('/governance/moderation/strikes'),
    handle(() => {
      authorize('governance.view');
      return ok(strikeRecords());
    }),
  ),

  http.get(
    route('/governance/reports'),
    handle(({ request }) => {
      authorize('governance.view');
      const q = query(request);
      const status = q.get('status') === 'decided' ? 'decided' : 'open';
      const severity = q.get('severity');
      const inStatus = reports.where((r) => (status === 'open' ? isOpenReport(r) : !isOpenReport(r)));
      const rows = inStatus
        .filter((r) => !severity || r.severity === severity)
        .sort((a, b) =>
          status === 'open'
            ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.receivedAt.localeCompare(a.receivedAt)
            : (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''),
        );
      return paginate(rows.map(toReport), request, {
        severityCounts: SEVERITIES.map((s) => ({ severity: s, count: inStatus.filter((r) => r.severity === s).length })),
      });
    }),
  ),

  http.post<Params>(
    route('/governance/reports/:id/decision'),
    handle<Params>(async ({ request, params }) => {
      const user = authorize('governance.manage');
      const r = findOr404(reports.find(params.id), 'Report');
      const { decision } = await readBody<{ decision: ModerationDecision }>(request);
      if (!['removed', 'limited', 'kept'].includes(decision)) throw invalid({ decision: 'Choose remove, limit or no violation.' });
      if (!isOpenReport(r)) throw invalid({ decision: 'This report has already been decided.' });
      if (r.decision === 'limited' && decision === 'limited') throw invalid({ decision: 'Access is already limited.' });
      const tenant = tenantName(r.tenantId);
      const before = strikeRecords().find((s) => s.tenantId === r.tenantId)?.strikes ?? 0;
      reports.update(r.id, { decision, decidedAt: new Date().toISOString(), decidedBy: user.name });
      if (decision === 'removed') {
        recordAudit(`${r.kind} upheld — removed content on ${tenant}`, 'Tenants', r.tenantId);
        if (before + 1 === STRIKE_LIMIT)
          recordAudit(`Publishing suspended for ${tenant} — ${STRIKE_LIMIT} upheld strikes`, 'Tenants', r.tenantId);
      } else if (decision === 'limited') {
        recordAudit(`Limited access to reported content on ${tenant} (${r.kind})`, 'Tenants', r.tenantId);
      } else {
        recordAudit(`Closed ${r.kind} report on ${tenant} as no violation`, 'Tenants', r.tenantId);
      }
      return ok(toReport(r));
    }),
  ),

  // ---------- Policies & terms ----------
  http.get(
    route('/governance/policies'),
    handle(() => {
      authorize('governance.view');
      const order: Record<PolicyState, number> = { Draft: 0, Live: 1, Superseded: 2 };
      const docs = [...policies.all()].sort(
        (a, b) => a.name.localeCompare(b.name) || order[a.state] - order[b.state] || b.version.localeCompare(a.version),
      );
      const now = new Date();
      return ok({
        documents: docs.map(toPolicy),
        // Annual legal review each December.
        nextReviewAt: new Date(Date.UTC(now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(), 11, 1)).toISOString(),
      });
    }),
  ),

  http.get<Params>(
    route('/governance/policies/:id/acceptance'),
    handle<Params>(({ params }) => {
      authorize('governance.view');
      const p = findOr404(policies.find(params.id), 'Document');
      return ok(
        tenants
          .all()
          .map((t) => toAcceptance(p, t.id))
          .sort((a, b) => Number(!!a.acceptedAt) - Number(!!b.acceptedAt) || a.tenantName.localeCompare(b.tenantName)),
      );
    }),
  ),

  http.post<Params>(
    route('/governance/policies/:id/publish'),
    handle<Params>(({ params }) => {
      authorize('governance.manage');
      const p = findOr404(policies.find(params.id), 'Document');
      if (p.state !== 'Draft') throw invalid({ state: 'Only a draft can be published.' });
      const now = new Date();
      policies.where((x) => x.docKey === p.docKey && x.state === 'Live').forEach((x) => policies.update(x.id, { state: 'Superseded' }));
      policies.update(p.id, {
        state: 'Live',
        publishedAt: now.toISOString(),
        acceptanceDeadline: new Date(now.getTime() + ACCEPTANCE_WINDOW_DAYS * DAY).toISOString(),
      });
      recordAudit(`Published ${p.name} ${p.version}`, 'Tenants');
      return ok(toPolicy(p));
    }),
  ),

  http.post<Params>(
    route('/governance/policies/:id/reminders'),
    handle<Params>(async ({ request, params }) => {
      authorize('governance.manage');
      const p = findOr404(policies.find(params.id), 'Document');
      const { tenantId } = await readBody<{ tenantId: string }>(request);
      const t = tenants.find(tenantId);
      if (!t) throw invalid({ tenantId: 'Choose a tenant.' });
      if (p.state !== 'Live') throw invalid({ tenantId: 'Only the live version can be sent for acceptance.' });
      if (acceptedBy(p.id).has(t.id)) throw invalid({ tenantId: `${t.name} has already accepted ${p.version}.` });
      reminders.insert({ id: id('pr'), documentId: p.id, tenantId: t.id, sentAt: new Date().toISOString() });
      recordAudit(`Reminded ${t.name} to accept ${p.name} ${p.version}`, 'Tenants', t.id);
      return ok(toAcceptance(p, t.id));
    }),
  ),

  // ---------- Data residency ----------
  // Moves themselves go through PATCH /tenants/:id { region } (tenants.manage).
  http.get(
    route('/governance/regions'),
    handle(() => {
      authorize('governance.view');
      const all = tenants.all();
      const migrating = migratingTenants();
      const body: RegionSummary = {
        regions: REGIONS.map((region) => {
          const rows = all.filter((t) => t.region === region);
          return {
            region,
            ...REGION_INFO[region],
            tenants: rows.length,
            learners: rows.reduce((s, t) => s + t.students, 0),
          };
        }),
        tenants: [...all]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({
            tenantId: t.id,
            name: t.name,
            plan: t.plan,
            students: t.students,
            region: t.region,
            migrating: migrating.has(t.id),
          })),
        pendingMigrations: all.filter((t) => migrating.has(t.id)).length,
        subProcessors: subProcessors.all().length,
      };
      return ok(body);
    }),
  ),

  // ---------- Abuse & limits ----------
  http.get(
    route('/governance/abuse-signals'),
    handle(() => {
      authorize('governance.view');
      return ok(
        signals
          .where((s) => !s.resolvedAt)
          .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.detectedAt.localeCompare(a.detectedAt))
          .map(toSignal),
      );
    }),
  ),

  http.post<Params>(
    route('/governance/abuse-signals/:id/action'),
    handle<Params>(({ params }) => {
      authorize('governance.manage');
      const s = findOr404(signals.find(params.id), 'Signal');
      if (s.resolvedAt) throw invalid({ status: 'This signal has already been handled.' });
      const t = findOr404(tenants.find(s.tenantId), 'Tenant');
      let outcome = `${ACTION_LABELS[s.action]} applied to ${t.name}`;
      if (s.action === 'raise_limit') {
        const current = t.limitOverrides.apiPerMinute ?? Math.max(rateLimitFor(t.plan), effectiveLimits(t).apiPerMinute);
        const next = current * 2;
        tenants.update(t.id, { limitOverrides: { ...t.limitOverrides, apiPerMinute: next } });
        outcome = `API limit for ${t.name} raised to ${next} req/min`;
      } else if (s.action === 'freeze_checkout') {
        outcome = `Checkout frozen for ${t.name} — new card payments are blocked until you lift it`;
      }
      signals.update(s.id, { resolvedAt: new Date().toISOString(), resolution: 'actioned' });
      recordAudit(`${ACTION_LABELS[s.action]} applied to ${t.name}`, 'Security', t.id);
      return ok({ signalId: s.id, outcome });
    }),
  ),

  http.post<Params>(
    route('/governance/abuse-signals/:id/dismiss'),
    handle<Params>(({ params }) => {
      authorize('governance.manage');
      const s = findOr404(signals.find(params.id), 'Signal');
      if (s.resolvedAt) throw invalid({ status: 'This signal has already been handled.' });
      signals.update(s.id, { resolvedAt: new Date().toISOString(), resolution: 'dismissed' });
      recordAudit(`Dismissed abuse signal for ${tenantName(s.tenantId)}: ${s.signal}`, 'Security', s.tenantId);
      return noContent();
    }),
  ),

  http.get(
    route('/governance/rate-limits'),
    handle(() => {
      authorize('governance.view');
      return ok(
        PLANS.map<RateLimit>((plan) => ({
          plan,
          perMinute: rateLimitFor(plan),
          defaultPerMinute: PLAN_LIMITS[plan].apiPerMinute,
          peakPerMinute: PEAKS[plan],
        })),
      );
    }),
  ),

  http.put(
    route('/governance/rate-limits'),
    handle(async ({ request }) => {
      authorize('governance.manage');
      const { limits } = await readBody<{ limits: { plan: Plan; perMinute: number }[] }>(request);
      if (!Array.isArray(limits) || !limits.length) throw invalid({ limits: 'Provide a limit for at least one plan.' });
      const errors: Record<string, string> = {};
      const next = { ...rateLimits.get() };
      limits.forEach((l, i) => {
        if (!PLANS.includes(l.plan)) errors[`limits.${i}.plan`] = 'The selected plan is invalid.';
        else if (!Number.isInteger(l.perMinute) || l.perMinute < 1 || l.perMinute > 100_000)
          errors[`limits.${i}.perMinute`] = `${l.plan}: enter a whole number from 1 to 100,000.`;
        else next[l.plan] = l.perMinute;
      });
      if (Object.keys(errors).length) throw invalid(errors);
      rateLimits.set(next);
      recordAudit(`Set API rate limits — ${PLANS.map((p) => `${p} ${next[p]}`).join(' · ')} req/min`, 'Security');
      return ok(
        PLANS.map<RateLimit>((plan) => ({
          plan,
          perMinute: next[plan],
          defaultPerMinute: PLAN_LIMITS[plan].apiPerMinute,
          peakPerMinute: PEAKS[plan],
        })),
      );
    }),
  ),

  http.get(
    route('/governance/blocked-ips'),
    handle(() => {
      authorize('governance.view');
      return ok([...blockedIps.all()].sort((a, b) => b.blockedAt.localeCompare(a.blockedAt)));
    }),
  ),

  http.post(
    route('/governance/blocked-ips'),
    handle(async ({ request }) => {
      const user = authorize('governance.manage');
      const body = await readBody<{ ip?: string; reason?: string }>(request);
      const ip = (body.ip ?? '').trim().toLowerCase();
      if (!isIpOrCidr(ip)) throw invalid({ ip: IP_ERROR });
      if (blockedIps.where((b) => b.ip === ip).length) throw invalid({ ip: `${ip} is already blocked.` });
      const reason = (body.reason ?? '').trim();
      if (reason.length > 120) throw invalid({ reason: 'Keep the reason under 120 characters.' });
      const row: BlockedIp = {
        id: id('ip'),
        ip,
        reason: reason || 'Blocked manually',
        blockedAt: new Date().toISOString(),
        blockedBy: user.name,
      };
      blockedIps.insert(row);
      recordAudit(`Blocked IP ${ip}`, 'Security');
      return ok(row, 201);
    }),
  ),

  http.delete<Params>(
    route('/governance/blocked-ips/:id'),
    handle<Params>(({ params }) => {
      authorize('governance.manage');
      const row = findOr404(blockedIps.find(params.id), 'Blocked IP');
      blockedIps.remove(row.id);
      recordAudit(`Unblocked IP ${row.ip}`, 'Security');
      return noContent();
    }),
  ),
];
