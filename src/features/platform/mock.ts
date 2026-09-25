// Mock implementation of /platform/* (what the Laravel platform controllers + policies will do):
// feature flags, system status & incidents, email deliverability, certificate registry,
// standards imports, API keys and webhooks.
import { http } from 'msw';
import { flags, platformSettings, platformStatus, tenants, type FlagRow } from '@/mocks/collections';
import { ago, collection, id, singleton } from '@/mocks/db';
import { authorize, handle, invalid, notFound, ok, paginate, query, readBody, recordAudit, route } from '@/mocks/http';
import {
  API_KEY_SCOPES,
  FLAG_ROLLOUTS,
  type ApiKey,
  type ApiKeyInput,
  type ApiKeyScope,
  type Certificate,
  type Deliverability,
  type DnsCheck,
  type FeatureFlag,
  type FlagUpdate,
  type PostIncidentInput,
  type RegistryPolicy,
  type SenderDomain,
  type SenderRisk,
  type Standards,
  type SystemStatus,
  type WebhookDelivery,
  type Webhooks,
} from './types';

const tenantName = (tenantId: string) => tenants.find(tenantId)?.name ?? 'Closed tenant';
const lower = (s: string) => s.toLowerCase();

// ---------- Feature-only tables ----------
interface ServiceRow {
  id: string;
  name: string;
  uptime90d: number;
}
const services = collection<ServiceRow>('platform_services', () => [
  { id: 'api', name: 'API', uptime90d: 99.99 },
  { id: 'video', name: 'Video processing & CDN', uptime90d: 99.93 },
  { id: 'checkout', name: 'Checkout & billing', uptime90d: 99.98 },
  { id: 'email', name: 'Email delivery', uptime90d: 99.95 },
]);

/** Services affected by the open incident (the incident itself lives in the shared `platformStatus`). */
const incidentScope = singleton<{ serviceIds: string[] }>('platform_incidentScope', () => ({ serviceIds: [] }));

interface SenderRow {
  id: string;
  tenantId: string;
  domain: string;
  spf: DnsCheck;
  dkim: DnsCheck;
  dmarc: string;
  sent30d: number;
  bounceRate: number;
  complaintRate: number;
  pausedAt: string | null;
  dnsCheckedAt: string;
}
const S = (
  tenantId: string,
  domain: string,
  spf: DnsCheck,
  dkim: DnsCheck,
  dmarc: string,
  bounceRate: number,
  complaintRate: number,
  sent30d: number,
): SenderRow => ({
  id: 'sd_' + tenantId.slice(3),
  tenantId,
  domain,
  spf,
  dkim,
  dmarc,
  sent30d,
  bounceRate,
  complaintRate,
  pausedAt: null,
  dnsCheckedAt: ago({ h: 6 }),
});
export const senders = collection<SenderRow>('platform_senderDomains', () => [
  S('tn_amplify', 'learn.amplifycoaching.com', 'Pass', 'Pass', 'p=quarantine', 0.4, 0.02, 41200),
  S('tn_nordic', 'academy.nordicyoga.se', 'Pass', 'Pass', 'p=reject', 0.2, 0.01, 88400),
  S('tn_devpath', 'learn.devpath.io', 'Pass', 'Fail', 'none', 2.9, 0.31, 22100),
  S('tn_silva', 'cursos.silvaculinary.com', 'Pass', 'Pass', 'p=none', 0.7, 0.04, 15600),
  S('tn_bloom', 'bloom.coursiva.io', 'Not set', 'Not set', 'none', 6.1, 0.62, 3200),
]);

const SUPPRESSION = [
  { list: 'Hard bounces', count: 1840, note: 'Permanent — never retried' },
  { list: 'Complaints', count: 96, note: 'Marked spam · auto-suppressed' },
  { list: 'Unsubscribes', count: 4210, note: 'Honoured across every tenant' },
  { list: 'Manual blocks', count: 32, note: 'Added by staff' },
];

/** Provider thresholds: complaints ≥ 0.3% or bounces ≥ 5% are over; ≥ 0.1% / ≥ 2% are on watch. */
const THRESHOLDS = { bounceWatch: 2, bounceMax: 5, complaintWatch: 0.1, complaintMax: 0.3 };
function senderRisk(bounce: number, complaint: number): SenderRisk {
  if (complaint >= THRESHOLDS.complaintMax || bounce >= THRESHOLDS.bounceMax) return 'Over threshold';
  if (complaint >= THRESHOLDS.complaintWatch || bounce >= THRESHOLDS.bounceWatch) return 'Watch';
  return 'Healthy';
}

interface CertificateRow {
  id: string;
  learnerName: string;
  tenantId: string;
  course: string;
  issuedAt: string;
  revokedAt: string | null;
}
export const certificates = collection<CertificateRow>('platform_certificates', () => [
  {
    id: 'AC-2026-0341',
    learnerName: 'Priya Nair',
    tenantId: 'tn_amplify',
    course: 'The Funnel Blueprint',
    issuedAt: '2026-08-12T10:00:00Z',
    revokedAt: null,
  },
  {
    id: 'AC-2026-0342',
    learnerName: 'Tom Okafor',
    tenantId: 'tn_amplify',
    course: 'Email Marketing Mastery',
    issuedAt: '2026-08-09T10:00:00Z',
    revokedAt: null,
  },
  {
    id: 'NY-2026-1188',
    learnerName: 'Freja Lind',
    tenantId: 'tn_nordic',
    course: '200-hr Teacher Training',
    issuedAt: '2026-07-30T10:00:00Z',
    revokedAt: null,
  },
  {
    id: 'DP-2025-0904',
    learnerName: 'Rahul Mehta',
    tenantId: 'tn_devpath',
    course: 'Full-Stack Immersive',
    issuedAt: '2025-11-02T10:00:00Z',
    revokedAt: null,
  },
  {
    id: 'BF-2026-0021',
    learnerName: 'Elif Kaya',
    tenantId: 'tn_bloom',
    course: 'Wedding Florals',
    issuedAt: '2026-06-18T10:00:00Z',
    revokedAt: null,
  },
]);
/** Registry-wide totals that aren't in the sample table above. */
const CERT_TOTALS = { issued: 18204, verified30d: 2140, revokedBefore: 12, orphaned: 308 };

export const policies = collection<RegistryPolicy & { id: string }>('platform_registryPolicies', () =>
  [
    [
      'outlive',
      'Certificates outlive the tenant',
      'A suspended or closed tenant’s certificates stay verifiable — we hold the registry.',
      true,
    ],
    ['issuer', 'Show the issuing school', 'Learners can prove who taught them even after a rebrand.', true],
    ['self_revoke', 'Allow tenant self-revocation', 'Tenants revoke their own certificates for fraud; staff can override.', true],
    ['ob3', 'Publish as Open Badges 3.0', 'Mirror each certificate as a portable verifiable credential.', false],
  ].map(([key, label, description, enabled]) => ({
    id: key as string,
    key: key as string,
    label: label as string,
    description: description as string,
    enabled: enabled as boolean,
  })),
);

const STANDARDS: Standards['standards'] = [
  {
    id: 'scorm12',
    name: 'SCORM 1.2',
    direction: 'Import',
    packages: 412,
    note: 'Converted to native lessons on upload',
    support: 'Supported',
  },
  {
    id: 'scorm2004',
    name: 'SCORM 2004 (4th ed.)',
    direction: 'Import',
    packages: 168,
    note: 'Sequencing rules partially mapped',
    support: 'Partial',
  },
  {
    id: 'xapi',
    name: 'xAPI (Tin Can)',
    direction: 'Export',
    packages: 24,
    note: 'Statements streamed to the tenant’s LRS',
    support: 'Supported',
  },
  { id: 'cmi5', name: 'cmi5', direction: 'Both', packages: 6, note: 'Beta — 3 tenants piloting', support: 'Partial' },
  {
    id: 'lti13',
    name: 'LTI 1.3 / Advantage',
    direction: 'Both',
    packages: 11,
    note: 'Launch from Canvas, Moodle and Blackboard',
    support: 'Supported',
  },
  {
    id: 'qti3',
    name: 'QTI 3.0',
    direction: 'Import',
    packages: 0,
    note: 'Not supported — quiz import is CSV only',
    support: 'Not supported',
  },
];
const ACCESSIBILITY: Standards['accessibility'] = [
  { surface: 'Learner site', level: 'WCAG 2.2 AA', status: 'Conformant', note: 'Audited Aug 2026 · 0 blockers' },
  { surface: 'Course player', level: 'WCAG 2.2 AA', status: 'Conformant', note: 'Captions, transcripts, keyboard nav' },
  { surface: 'Mobile apps', level: 'WCAG 2.2 AA', status: 'Partial', note: '2 issues · focus order in checkout' },
  { surface: 'Tenant dashboard', level: 'WCAG 2.1 AA', status: 'Partial', note: 'Colour contrast on 3 charts' },
];

interface ImportRow {
  id: string;
  tenantId: string;
  file: string;
  reason: string;
  failedAt: string;
  resolvedAt: string | null;
  outcome: 'imported' | 'rejected' | null;
}
export const imports = collection<ImportRow>('platform_failedImports', () => [
  {
    id: 'im_chef',
    tenantId: 'tn_silva',
    file: 'chef-basics-scorm2004.zip',
    reason: 'Manifest references a missing SCO',
    failedAt: ago({ d: 2 }),
    resolvedAt: null,
    outcome: null,
  },
  {
    id: 'im_react4',
    tenantId: 'tn_devpath',
    file: 'react-module-4.zip',
    reason: 'Package exceeds the 2 GB import limit',
    failedAt: ago({ d: 4 }),
    resolvedAt: null,
    outcome: null,
  },
]);

interface ApiKeyRow {
  id: string;
  name: string;
  /** Last four characters of the secret. Laravel stores only a hash of the full secret. */
  last4: string;
  scope: ApiKeyScope;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export const apiKeys = collection<ApiKeyRow>('platform_apiKeys', () => [
  {
    id: 'ak_prod',
    name: 'Production key',
    last4: '4f2a',
    scope: 'Full access',
    createdAt: '2025-03-10T10:00:00Z',
    lastUsedAt: ago({ m: 2 }),
    revokedAt: null,
  },
  {
    id: 'ak_zapier',
    name: 'Zapier integration',
    last4: '9c1d',
    scope: 'Read only',
    createdAt: '2025-06-02T10:00:00Z',
    lastUsedAt: ago({ h: 1 }),
    revokedAt: null,
  },
  {
    id: 'ak_analytics',
    name: 'Analytics export',
    last4: '7b3e',
    scope: 'Read only',
    createdAt: '2026-08-04T10:00:00Z',
    lastUsedAt: ago({ d: 3 }),
    revokedAt: null,
  },
]);
const masked = (last4: string) => `sk_live_••••${last4}`;

const ENDPOINTS: Webhooks['endpoints'] = [
  {
    id: 'wh_amplify',
    tenantId: 'tn_amplify',
    url: 'hooks.amplifycoaching.com/coursiva',
    events: 'order.completed, refund.created',
    successRate7d: 99.8,
    status: 'Healthy',
  },
  {
    id: 'wh_devpath',
    tenantId: 'tn_devpath',
    url: 'api.devpath.io/webhooks',
    events: 'All events',
    successRate7d: 97.1,
    status: 'Healthy',
  },
  {
    id: 'wh_zapier',
    tenantId: null,
    url: 'zaps.zapier.com/hooks/catch/8123',
    events: 'tenant.provisioned, invoice.paid',
    successRate7d: 88.4,
    status: 'Failing',
  },
];

interface DeliveryRow extends WebhookDelivery {
  tenantId: string | null;
}
export const deliveries = collection<DeliveryRow>('platform_failedDeliveries', () => [
  {
    id: 'dl_1',
    tenantId: null,
    event: 'order.completed',
    url: 'zaps.zapier.com/hooks/catch/8123',
    error: 'HTTP 500 — server error',
    attempts: 6,
    lastAttemptAt: ago({ h: 2 }),
  },
  {
    id: 'dl_2',
    tenantId: 'tn_devpath',
    event: 'invoice.paid',
    url: 'api.devpath.io/webhooks',
    error: 'Timeout after 30 s',
    attempts: 3,
    lastAttemptAt: ago({ h: 5 }),
  },
  {
    id: 'dl_3',
    tenantId: 'tn_bloom',
    event: 'tenant.suspended',
    url: 'hooks.bloomfloristry.com',
    error: 'HTTP 404 — endpoint gone',
    attempts: 8,
    lastAttemptAt: ago({ h: 9 }),
  },
]);

// ---------- Resource mappers ----------
function toFlag(f: FlagRow): FeatureFlag {
  return {
    key: f.id,
    name: f.name,
    description: f.description,
    enabled: f.enabled,
    rollout: f.rollout,
    tenantOverrides: tenants.where((t) => t.flagOverrides[f.id] != null).length,
  };
}

function systemStatus(): SystemStatus {
  const { incident } = platformStatus.get();
  const affected = incident ? incidentScope.get().serviceIds : [];
  return {
    incident: incident ? { ...incident, serviceIds: affected } : null,
    statusPageUrl: `https://status.${platformSettings.get().primaryDomain}`,
    services: services.all().map((s) => ({
      id: s.id,
      name: s.name,
      uptime90d: s.uptime90d,
      status: affected.includes(s.id) ? 'Degraded' : 'Operational',
    })),
  };
}

function toSender(s: SenderRow): SenderDomain {
  return {
    id: s.id,
    tenantId: s.tenantId,
    tenantName: tenantName(s.tenantId),
    domain: s.domain,
    spf: s.spf,
    dkim: s.dkim,
    dmarc: s.dmarc,
    sent30d: s.sent30d,
    bounceRate: s.bounceRate,
    complaintRate: s.complaintRate,
    risk: senderRisk(s.bounceRate, s.complaintRate),
    paused: !!s.pausedAt,
    pausedAt: s.pausedAt,
    dnsCheckedAt: s.dnsCheckedAt,
  };
}

const toCertificate = (c: CertificateRow): Certificate => ({
  id: c.id,
  learnerName: c.learnerName,
  tenantId: c.tenantId,
  tenantName: tenantName(c.tenantId),
  course: c.course,
  issuedAt: c.issuedAt,
  status: c.revokedAt ? 'Revoked' : 'Valid',
  revokedAt: c.revokedAt,
  verifyUrl: `https://verify.coursiva.io/${c.id}`,
});

const toPolicy = ({ key, label, description, enabled }: RegistryPolicy): RegistryPolicy => ({ key, label, description, enabled });

const toApiKey = (k: ApiKeyRow): ApiKey => ({
  id: k.id,
  name: k.name,
  prefix: masked(k.last4),
  scope: k.scope,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
  revokedAt: k.revokedAt,
});

const toDelivery = ({ tenantId: _t, ...d }: DeliveryRow): WebhookDelivery => d;

function findOr404<T>(row: T | undefined, what: string): T {
  if (!row) throw notFound(what);
  return row;
}

type IdParams = { id: string };
type KeyParams = { key: string };

export const handlers = [
  // ---------- Feature flags ----------
  http.get(
    route('/platform/flags'),
    handle(() => {
      authorize('platform.view');
      return ok(flags.all().map(toFlag));
    }),
  ),

  http.patch<KeyParams>(
    route('/platform/flags/:key'),
    handle<KeyParams>(async ({ request, params }) => {
      authorize('flags.manage');
      const f = findOr404(flags.find(params.key), 'Flag');
      const body = await readBody<FlagUpdate>(request);
      const errors: Record<string, string> = {};
      if (body.enabled !== undefined && typeof body.enabled !== 'boolean') errors.enabled = 'Enabled must be true or false.';
      if (body.rollout !== undefined && !FLAG_ROLLOUTS.includes(body.rollout)) errors.rollout = 'The selected rollout is invalid.';
      if (Object.keys(errors).length) throw invalid(errors);
      if (body.rollout !== undefined && body.rollout !== f.rollout) {
        flags.update(f.id, { rollout: body.rollout });
        recordAudit(`Set "${f.name}" rollout to ${lower(body.rollout)}`, 'Flags');
      }
      if (body.enabled !== undefined && body.enabled !== f.enabled) {
        flags.update(f.id, { enabled: body.enabled });
        recordAudit(`${body.enabled ? 'Enabled' : 'Disabled'} "${f.name}" for ${lower(f.rollout)}`, 'Flags');
      }
      return ok(toFlag(f));
    }),
  ),

  // ---------- System status & incidents ----------
  http.get(
    route('/platform/system'),
    handle(() => {
      authorize('platform.view');
      return ok(systemStatus());
    }),
  ),

  http.post(
    route('/platform/incident'),
    handle(async ({ request }) => {
      authorize('flags.manage');
      const body = await readBody<PostIncidentInput>(request);
      const title = (body.title ?? '').trim();
      const ids = Array.isArray(body.serviceIds) ? body.serviceIds : [];
      const errors: Record<string, string> = {};
      if (platformStatus.get().incident) errors.title = 'An incident is already posted — resolve it before posting another.';
      else if (title.length < 5) errors.title = 'Describe the incident in at least 5 characters.';
      else if (title.length > 120) errors.title = 'Keep the title under 120 characters.';
      if (!ids.length) errors.serviceIds = 'Pick at least one affected service.';
      else if (ids.some((sid) => !services.find(sid))) errors.serviceIds = 'One of the selected services does not exist.';
      if (Object.keys(errors).length) throw invalid(errors);
      platformStatus.set({ incident: { title, postedAt: new Date().toISOString() } });
      incidentScope.set({ serviceIds: [...new Set(ids)] });
      recordAudit(`Posted incident: ${title}`, 'Flags');
      return ok(systemStatus(), 201);
    }),
  ),

  http.delete(
    route('/platform/incident'),
    handle(() => {
      authorize('flags.manage');
      const { incident } = platformStatus.get();
      if (!incident) throw invalid({ incident: 'There is no open incident to resolve.' });
      platformStatus.set({ incident: null });
      incidentScope.set({ serviceIds: [] });
      recordAudit(`Resolved incident: ${incident.title}`, 'Flags');
      return ok(systemStatus());
    }),
  ),

  // ---------- Email deliverability ----------
  http.get(
    route('/platform/deliverability'),
    handle(() => {
      authorize('platform.view');
      const domains = senders.all().map(toSender);
      const sent = domains.reduce((s, d) => s + d.sent30d, 0);
      const weighted = (pick: (d: SenderDomain) => number) =>
        sent ? Math.round((domains.reduce((s, d) => s + pick(d) * d.sent30d, 0) / sent) * 100) / 100 : 0;
      const body: Deliverability = {
        summary: {
          sent30d: sent,
          bounceRate: weighted((d) => d.bounceRate),
          complaintRate: weighted((d) => d.complaintRate),
          domainsAtRisk: domains.filter((d) => d.risk === 'Over threshold' || d.spf !== 'Pass' || d.dkim !== 'Pass').length,
          thresholds: THRESHOLDS,
        },
        domains,
        suppression: SUPPRESSION,
      };
      return ok(body);
    }),
  ),

  http.post<{ id: string; action: string }>(
    route('/platform/sender-domains/:id/:action'),
    handle<{ id: string; action: string }>(({ params }) => {
      authorize('platform.manage');
      const s = findOr404(senders.find(params.id), 'Sender domain');
      const name = tenantName(s.tenantId);
      switch (params.action) {
        case 'pause':
          if (s.pausedAt) throw invalid({ paused: `Sending is already paused for ${name}.` });
          senders.update(s.id, { pausedAt: new Date().toISOString() });
          recordAudit(`Paused email sending for ${name}`, 'Tenants', s.tenantId);
          break;
        case 'resume':
          if (!s.pausedAt) throw invalid({ paused: `Sending isn’t paused for ${name}.` });
          senders.update(s.id, { pausedAt: null });
          recordAudit(`Resumed email sending for ${name}`, 'Tenants', s.tenantId);
          break;
        case 'dns-check':
          senders.update(s.id, { dnsCheckedAt: new Date().toISOString() });
          recordAudit(`Re-checked DNS for ${s.domain}`, 'Tenants', s.tenantId);
          break;
        default:
          throw notFound('Action');
      }
      return ok(toSender(s));
    }),
  ),

  // ---------- Certificate authority ----------
  http.get(
    route('/platform/certificates/summary'),
    handle(() => {
      authorize('platform.view');
      return ok({
        issued: CERT_TOTALS.issued,
        verified30d: CERT_TOTALS.verified30d,
        revoked: CERT_TOTALS.revokedBefore + certificates.where((c) => !!c.revokedAt).length,
        orphaned: CERT_TOTALS.orphaned,
      });
    }),
  ),

  http.get(
    route('/platform/certificates'),
    handle(({ request }) => {
      authorize('platform.view');
      const { search } = query(request);
      const rows = certificates
        .all()
        .filter((c) => !search || [c.id, c.learnerName, c.course, tenantName(c.tenantId)].some((s) => s.toLowerCase().includes(search)))
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
        .map(toCertificate);
      return paginate(rows, request);
    }),
  ),

  http.post<{ id: string; action: string }>(
    route('/platform/certificates/:id/:action'),
    handle<{ id: string; action: string }>(({ params }) => {
      authorize('platform.manage');
      const c = findOr404(certificates.find(params.id), 'Certificate');
      if (params.action === 'revoke') {
        if (c.revokedAt) throw invalid({ status: `${c.id} is already revoked.` });
        certificates.update(c.id, { revokedAt: new Date().toISOString() });
        recordAudit(`Revoked certificate ${c.id} (${c.learnerName})`, 'Security', c.tenantId);
      } else if (params.action === 'reinstate') {
        if (!c.revokedAt) throw invalid({ status: `${c.id} is not revoked.` });
        certificates.update(c.id, { revokedAt: null });
        recordAudit(`Reinstated certificate ${c.id} (${c.learnerName})`, 'Security', c.tenantId);
      } else throw notFound('Action');
      return ok(toCertificate(c));
    }),
  ),

  http.get(
    route('/platform/certificate-policies'),
    handle(() => {
      authorize('platform.view');
      return ok(policies.all().map(toPolicy));
    }),
  ),

  http.put<KeyParams>(
    route('/platform/certificate-policies/:key'),
    handle<KeyParams>(async ({ request, params }) => {
      authorize('platform.manage');
      const p = findOr404(policies.find(params.key), 'Policy');
      const { enabled } = await readBody<{ enabled: unknown }>(request);
      if (typeof enabled !== 'boolean') throw invalid({ enabled: 'Enabled must be true or false.' });
      if (enabled !== p.enabled) {
        policies.update(p.id, { enabled });
        recordAudit(`${enabled ? 'Enabled' : 'Disabled'} registry policy "${p.label}"`, 'Security');
      }
      return ok(toPolicy(p));
    }),
  ),

  // ---------- Standards & conformance ----------
  http.get(
    route('/platform/standards'),
    handle(() => {
      authorize('platform.view');
      const open = imports.where((i) => !i.resolvedAt);
      const body: Standards = {
        summary: {
          scormPackages: 580 + imports.where((i) => i.outcome === 'imported').length,
          xapiStatements24h: 1_200_000,
          ltiLaunches30d: 9410,
          failedImports: open.length,
        },
        standards: STANDARDS,
        failedImports: open
          .sort((a, b) => b.failedAt.localeCompare(a.failedAt))
          .map((i) => ({
            id: i.id,
            tenantId: i.tenantId,
            tenantName: tenantName(i.tenantId),
            file: i.file,
            reason: i.reason,
            failedAt: i.failedAt,
          })),
        accessibility: ACCESSIBILITY,
      };
      return ok(body);
    }),
  ),

  http.post<IdParams>(
    route('/platform/imports/:id/reprocess'),
    handle<IdParams>(({ params }) => {
      authorize('platform.manage');
      const row = findOr404(imports.find(params.id), 'Import');
      if (row.resolvedAt) throw invalid({ status: `${row.file} has already been re-processed.` });
      // A package over the size limit fails again; manifest problems are repaired by the converter.
      const outcome = /exceeds/i.test(row.reason) ? 'rejected' : 'imported';
      imports.update(row.id, { resolvedAt: new Date().toISOString(), outcome });
      const name = tenantName(row.tenantId);
      const message =
        outcome === 'imported'
          ? `${row.file} imported and converted to native lessons — ${name} notified`
          : `${row.file} is still over the 2 GB import limit — ${name} asked to split the package`;
      recordAudit(`Re-processed ${row.file} for ${name} — ${outcome}`, 'Tenants', row.tenantId);
      return ok({ id: row.id, file: row.file, tenantName: name, outcome, message });
    }),
  ),

  // ---------- API keys ----------
  http.get(
    route('/platform/api-keys'),
    handle(({ request }) => {
      authorize('platform.view');
      const rows = [...apiKeys.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toApiKey);
      return paginate(rows, request);
    }),
  ),

  http.post(
    route('/platform/api-keys'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<ApiKeyInput>(request);
      const name = (body.name ?? '').trim();
      const errors: Record<string, string> = {};
      if (name.length < 2) errors.name = 'Name the key (2+ characters) so you know where it’s used.';
      else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';
      else if (apiKeys.where((k) => !k.revokedAt && k.name.toLowerCase() === name.toLowerCase()).length)
        errors.name = 'An active key already has this name.';
      if (!API_KEY_SCOPES.includes(body.scope)) errors.scope = 'The selected scope is invalid.';
      if (Object.keys(errors).length) throw invalid(errors);
      const hex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      const secret = `sk_live_${hex}`;
      const row: ApiKeyRow = {
        id: id('ak'),
        name,
        last4: hex.slice(-4),
        scope: body.scope,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
      };
      apiKeys.insert(row);
      recordAudit(`Created API key "${name}" (${masked(row.last4)}, ${lower(body.scope)})`, 'Security');
      return ok({ ...toApiKey(row), secret }, 201);
    }),
  ),

  http.post<IdParams>(
    route('/platform/api-keys/:id/revoke'),
    handle<IdParams>(({ params }) => {
      authorize('platform.manage');
      const k = findOr404(apiKeys.find(params.id), 'API key');
      if (k.revokedAt) throw invalid({ status: `${k.name} is already revoked.` });
      apiKeys.update(k.id, { revokedAt: new Date().toISOString() });
      recordAudit(`Revoked API key "${k.name}" (${masked(k.last4)})`, 'Security');
      return ok(toApiKey(k));
    }),
  ),

  // ---------- Webhooks ----------
  http.get(
    route('/platform/webhooks'),
    handle(() => {
      authorize('platform.view');
      const body: Webhooks = {
        endpoints: ENDPOINTS,
        failedDeliveries: [...deliveries.all()].sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt)).map(toDelivery),
      };
      return ok(body);
    }),
  ),

  http.post<IdParams>(
    route('/platform/webhook-deliveries/:id/retry'),
    handle<IdParams>(({ params }) => {
      authorize('platform.manage');
      const d = findOr404(deliveries.find(params.id), 'Delivery');
      // A gone endpoint keeps answering 404; server errors and timeouts have recovered.
      const gone = /404/.test(d.error);
      if (gone) {
        deliveries.update(d.id, { attempts: d.attempts + 1, lastAttemptAt: new Date().toISOString() });
        recordAudit(`Retried webhook ${d.event} to ${d.url} — failed again (HTTP 404)`, 'Tenants', d.tenantId);
        return ok({ delivered: false, status: 404, delivery: toDelivery(d) });
      }
      deliveries.remove(d.id);
      recordAudit(`Retried webhook ${d.event} to ${d.url} — delivered (HTTP 200)`, 'Tenants', d.tenantId);
      return ok({ delivered: true, status: 200, delivery: null });
    }),
  ),
];
