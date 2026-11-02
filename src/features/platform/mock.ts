// Mock implementation of /platform/* (what the Laravel platform controllers + policies will do):
// feature flags, system status & incidents, email deliverability, certificate registry,
// standards imports, API keys and webhooks, connections and feature availability.
import { http } from 'msw';
import { CONNECTIONS as MEDIA_CONNECTIONS, mediaStore } from '@/features/media/mock';
import { PLANS } from '@/lib/domain';
import { flags, invoices, platformSettings, platformStatus, tenants, type FlagRow, type TenantRow } from '@/mocks/collections';
import { ago, collection, id, singleton } from '@/mocks/db';
import { tenantModules } from '@/mocks/derive';
import {
  mergeCredentials,
  prefix,
  toConnection,
  type CredentialDef,
  type CredentialFieldDef,
  type StoredCredentials,
} from '@/mocks/credentials';
import {
  authorize,
  handle,
  HttpError,
  invalid,
  notFound,
  ok,
  paginate,
  query,
  readBody,
  recordAudit,
  requireRecentPassword,
  route,
} from '@/mocks/http';
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
  type Availability,
  type AvailabilityUpdate,
  type Capability,
  type CapabilityGroup,
  type ConnectionCapability,
  type ConnectionInput,
  type ConnectionKind,
  type PlatformConnection,
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
    events: ['order.completed', 'refund.created'],
    successRate7d: 99.8,
    status: 'Healthy',
  },
  {
    id: 'wh_devpath',
    tenantId: 'tn_devpath',
    url: 'api.devpath.io/webhooks',
    events: ['*'],
    successRate7d: 97.1,
    status: 'Healthy',
  },
  {
    id: 'wh_zapier',
    tenantId: null,
    url: 'zaps.zapier.com/hooks/catch/8123',
    events: ['tenant.provisioned', 'invoice.paid'],
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
const SENDER_ACTIONS = ['pause', 'resume', 'dns-check'] as const;
const CERTIFICATE_ACTIONS = ['revoke', 'reinstate'] as const;

// ---------- Connections (what the backend's platformconn module does) ----------
// Services connected by pasting credentials: verified before saving (the mock refuses values containing "invalid"),
// stored server-side only, writes need a password confirmed in the last 15 minutes (423 otherwise). Storage backends
// and DRM providers are the Media screen's.
/** The one redirect URI every provider's OAuth app registers. */
export const OAUTH_REDIRECT = 'https://api.coursiva.io/api/v1/oauth/callback';

interface Def extends CredentialDef {
  kind: ConnectionKind;
}

/** The access token the mock's Expo refuses. */
export const EXPO_REFUSED_TOKEN = 'expo-refused-token-xxxxxxxx';

/** The Discord bot tokens the mock's `GET /users/@me` refuses (401) and answers as a user, not a bot. */
export const DISCORD_REFUSED_BOT_TOKEN = 'MTAxNjQ1.refused.discord-bot-token-0123456789abcdefghij';
export const DISCORD_USER_TOKEN = 'MTAxNjQ1.user.discord-account-token-0123456789abcdefghijk';

/** The API token the mock's Cloudflare Registrar refuses (its extension list answers 403). */
export const REGISTRAR_REFUSED_TOKEN = 'cf-registrar-refused-token-0000';

/** The host where the mock's ClamAV daemon doesn't answer PING. */
export const CLAMAV_UNREACHABLE_HOST = 'clamav.down.internal';

/** FILTER_VALIDATE_IP: a dotted IPv4 address or an IPv6 address. */
const isIp = (v: string) =>
  /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(v) || (v.includes(':') && /^[0-9a-f:.]+$/i.test(v));

const f = (key: string, label: string, secret = true, check?: (v: string) => string | undefined) => ({ key, label, secret, check });
const hex = (label: string, n: number) => (v: string) =>
  new RegExp(`^[0-9a-f]{${n}}$`, 'i').test(v) ? undefined : `The ${label} is ${n} hexadecimal characters.`;
const minLength = (label: string, n: number) => (v: string) =>
  v.length < n || /[ \t]/.test(v) ? `That ${label} looks too short.` : undefined;
const digits = (label: string) => (v: string) => (/^[1-9]\d{0,18}$/.test(v) ? undefined : `The ${label} is a number, e.g. 12345.`);
const oneOf =
  (label: string, ...options: string[]) =>
  (v: string) =>
    options.includes(v) ? undefined : `The ${label} must be ${options.join(' or ')}.`;

/** OAuthProviders::names() of the backend: OAuth 2.0 families plus X (OAuth 1.0a), sorted by key. */
const OAUTH_PROVIDERS: [key: string, name: string][] = [
  ['canva', 'Canva'],
  ['discord', 'Discord'],
  ['google', 'Google'],
  ['hubspot', 'HubSpot'],
  ['intercom', 'Intercom'],
  ['linkedin', 'LinkedIn'],
  ['meta', 'Meta'],
  ['microsoft', 'Microsoft'],
  ['notion', 'Notion'],
  ['paypal', 'PayPal'],
  ['pinterest', 'Pinterest'],
  ['quickbooks', 'Intuit QuickBooks'],
  ['salesforce', 'Salesforce'],
  ['slack', 'Slack'],
  ['stripe', 'Stripe'],
  ['tiktok', 'TikTok for Business'],
  ['vimeo', 'Vimeo'],
  ['x', 'X'],
  ['xero', 'Xero'],
  ['yandex', 'Yandex'],
  ['zendesk', 'Zendesk'],
  ['zoom', 'Zoom'],
];

const optional = (fd: ReturnType<typeof f>) => ({ ...fd, optional: true });

/** The client fields of a provider's OAuth app (OAuthProvider clientSecretFrom / clientParams / clientFields). */
function oauthFields(key: string) {
  if (key === 'x') return [f('consumer_key', 'API key (consumer key)', false), f('consumer_secret', 'API key secret (consumer secret)')];
  if (key === 'stripe') return [f('client_id', 'Client ID', false, prefix('client ID', 'ca_'))]; // Stripe Connect signs with the Stripe secret key
  const fields: CredentialFieldDef[] = [f('client_id', 'Client ID', false), f('client_secret', 'Client secret')];
  if (key === 'meta')
    fields.push(
      optional(f('config_id', 'Login for Business configuration ID', false)),
      optional(f('pages_config_id', 'Login for Business configuration ID for Page and Instagram posting', false)),
    );
  // Discord role sync runs as the application's bot (DiscordBot::field()); its token is proven live.
  if (key === 'discord')
    fields.push({
      ...optional(
        f('bot_token', 'Bot token (Bot → Reset Token in the Discord developer portal)', true, (v) =>
          /^[A-Za-z0-9_.-]{50,200}$/.test(v) ? undefined : 'A Discord bot token is 50–200 letters, digits, dots, - or _.',
        ),
      ),
      maxLength: 200,
    });
  return fields;
}

export const CONNECTIONS: Def[] = [
  {
    key: 'stripe',
    kind: 'payments',
    name: 'Stripe',
    description: 'Card payments for school subscriptions · webhooks settle confirmations',
    role: null,
    fields: [
      f('secret_key', 'Secret key', true, prefix('secret key', 'sk_live_', 'sk_test_', 'rk_live_', 'rk_test_')),
      f('publishable_key', 'Publishable key', false, prefix('publishable key', 'pk_live_', 'pk_test_')),
      f('webhook_secret', 'Webhook signing secret', true, prefix('webhook signing secret', 'whsec_')),
      // Schools' Stripe Connect events (commerce) are signed by a second endpoint's secret.
      optional(f('connect_webhook_secret', 'Connect webhook signing secret', true, prefix('Connect webhook signing secret', 'whsec_'))),
    ],
  },
  {
    key: 'paddle',
    kind: 'payments',
    name: 'Paddle',
    description: 'School subscriptions through Paddle Billing (merchant of record: Paddle collects, handles tax and issues the invoices)',
    role: null,
    fields: [
      f('api_key', 'API key', true, minLength('API key', 20)),
      f('client_token', 'Client-side token', false, prefix('client-side token', 'live_', 'test_')),
      f('webhook_secret', 'Webhook secret key', true, prefix('webhook secret key', 'pdl_ntfset_')),
      f('product_id', 'Product ID', false, (v) => (/^pro_[a-z0-9]{26}$/.test(v) ? undefined : 'The product ID looks like pro_01h….')),
    ],
    // The backend then reads the product with the key on the token's environment (missing or archived → refused).
    verify: ({ api_key: key = '', client_token: token = '' }) => {
      const sandbox = token.startsWith('test_');
      if ((key.startsWith('pdl_sdbx_') && !sandbox) || (key.startsWith('pdl_live_') && sandbox))
        return 'the API key and the client-side token are from different environments (sandbox and live)';
      return undefined;
    },
  },
  {
    key: 'lemon_squeezy',
    kind: 'payments',
    name: 'Lemon Squeezy',
    description:
      'School subscriptions through Lemon Squeezy (merchant of record) · plans only: one subscription variant per plan and cycle',
    role: null,
    // The backend checks each variant is a monthly/yearly subscription of the store priced like the price book.
    fields: [
      f('api_key', 'API key', true, minLength('API key', 40)),
      f('store_id', 'Store ID', false, digits('store ID')),
      f('webhook_secret', 'Webhook signing secret', true, (v) =>
        v.length >= 6 && v.length <= 40 ? undefined : 'The webhook signing secret is 6–40 characters.',
      ),
      ...PLANS.flatMap((plan) =>
        (['monthly', 'annual'] as const).map((cycle) =>
          f(`variant_${plan.toLowerCase()}_${cycle}`, `${plan} ${cycle} variant ID`, false, digits(`${plan} ${cycle} variant ID`)),
        ),
      ),
    ],
  },
  {
    key: 'cloudflare',
    kind: 'cdn',
    name: 'Cloudflare for SaaS',
    description: 'Custom domains · SSL for school hostnames',
    role: null,
    fields: [f('api_token', 'API token'), f('zone_id', 'Zone ID', false, hex('zone ID', 32))],
  },
  {
    key: 'cloudflare_registrar',
    kind: 'cdn',
    name: 'Cloudflare Registrar',
    description:
      'Domain sales to schools (search, registration, DNS of bought domains) · an account API token with Registrar and DNS permissions',
    role: null,
    fields: [
      f('account_id', 'Account ID', false, (v) =>
        /^[0-9a-f]{32}$/i.test(v)
          ? undefined
          : 'The account ID is 32 hexadecimal characters (Cloudflare dashboard → Account home → Account ID).',
      ),
      f('api_token', 'API token', true, (v) => (v.length >= 20 ? undefined : 'The API token is at least 20 characters.')),
      // `sandbox` (blank = sandbox, the safe default: Cloudflare's Registrar Sandbox) or `live`.
      {
        ...optional(f('mode', 'Mode', false, oneOf('mode', 'live', 'sandbox'))),
        options: [
          { value: 'sandbox', label: 'Sandbox (test)' },
          { value: 'live', label: 'Live' },
        ],
        default: 'sandbox',
      },
    ],
    // Verified live with a read-only call on the mode's base path (the registrar's extension list); a refused token is a 401/403.
    verify: ({ api_token: token, mode }) =>
      token === REGISTRAR_REFUSED_TOKEN
        ? `Authentication error (the token needs ${mode === 'live' ? 'Registrar: Edit' : 'Registrar Sandbox Domains Admin'} on this account)`
        : undefined,
  },
  {
    key: 'expo',
    kind: 'push',
    name: 'Expo push',
    description: 'Push notifications of the schools’ mobile apps · only needed when the Expo project enables enhanced push security',
    role: null,
    fields: [f('access_token', 'Access token', true, minLength('access token', 20))],
    // The backend checks the token against Expo's API (values containing "invalid" are refused generically).
    verify: ({ access_token: token }) => (token === EXPO_REFUSED_TOKEN ? 'the access token was refused' : undefined),
  },
  {
    key: 'postmark',
    kind: 'email',
    name: 'Postmark',
    description: 'Platform email (sign-in, invitations, billing) through Postmark',
    role: null,
    fields: [
      f('server_token', 'Server API token'),
      { ...f('message_stream', 'Message stream', false), optional: true },
      // The HTTP Basic auth password of the bounce/complaint webhook {API}/api/v1/webhooks/postmark.
      {
        ...f('webhook_password', 'Webhook password (Basic auth)', true, (v) =>
          v.length >= 24 && /^[\x21-\x7E]+$/.test(v) && !v.includes(':')
            ? undefined
            : 'Use at least 24 characters without spaces or colons, e.g. from `openssl rand -hex 24`.',
        ),
        optional: true,
      },
    ],
  },
  {
    key: 'smtp',
    kind: 'email',
    name: 'SMTP',
    description: 'Platform email through any SMTP server (TLS required)',
    role: null,
    fields: [
      f('host', 'Host', false, (v) =>
        /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v)
          ? undefined
          : 'The host must be a hostname, e.g. smtp.postmarkapp.com.',
      ),
      f('port', 'Port', false, (v) => (/^\d+$/.test(v) && +v >= 1 && +v <= 65535 ? undefined : 'The port must be between 1 and 65535.')),
      f('security', 'Security', false, oneOf('security', 'STARTTLS', 'SSL/TLS')),
      f('username', 'Username', false),
      f('password', 'Password'),
    ],
  },
  // The ad networks' platform-wide developer tokens (Ads & channels). Neither network can prove a token without a
  // school's OAuth grant, so the backend only checks the format.
  {
    key: 'google_ads',
    kind: 'ads',
    name: 'Google Ads API',
    description:
      "Developer token of the platform's Google Ads manager account (API Center) · sent on every Google Ads call for every school; needs Basic or Standard access for production accounts",
    role: null,
    fields: [
      f('developer_token', 'Developer token', true, (v) =>
        /^[A-Za-z0-9_-]{22}$/.test(v) ? undefined : 'The developer token is 22 letters, digits, - or _ (Google Ads → Tools → API Center).',
      ),
    ],
  },
  {
    key: 'microsoft_ads',
    kind: 'ads',
    name: 'Microsoft Advertising API',
    description:
      'Developer token from the Microsoft Advertising Developer Portal · universal: it works for every school that authorises Coursiva',
    role: null,
    fields: [
      f('developer_token', 'Developer token', true, (v) =>
        /^[A-Za-z0-9]{8,64}$/.test(v)
          ? undefined
          : 'The developer token is 8–64 letters and digits (Microsoft Advertising Developer Portal → Account).',
      ),
    ],
  },
  // Core Web Vitals of every school site: a Cloud API key restricted to the Chrome UX Report API (format check only).
  {
    key: 'google_crux',
    kind: 'insights',
    name: 'Chrome UX Report API',
    description:
      'Core Web Vitals (LCP, INP, CLS at p75) of each school site from real Chrome users · a Google Cloud API key restricted to the Chrome UX Report API',
    role: null,
    fields: [
      f('api_key', 'API key', true, (v) =>
        /^AIza[0-9A-Za-z_-]{35}$/.test(v)
          ? undefined
          : 'A Google API key is 39 characters starting with AIza (Google Cloud → APIs & Services → Credentials).',
      ),
    ],
  },
  // AI studio: every generation for every school goes through the platform's Claude key; caption audio is transcribed
  // by AssemblyAI. The backend verifies both keys live with the provider.
  {
    key: 'anthropic',
    kind: 'ai',
    name: 'Anthropic',
    description:
      'Claude for the AI studio (outlines, quizzes, grading, copy, captions translation, tutor) · an API key from the Claude Console',
    role: null,
    fields: [
      f('api_key', 'API key', true, (v) =>
        /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v) ? undefined : 'An Anthropic API key starts with sk-ant- (Claude Console → API keys).',
      ),
    ],
  },
  {
    key: 'assemblyai',
    kind: 'ai',
    name: 'AssemblyAI',
    description: 'Speech-to-text for AI captions and lesson transcripts',
    role: null,
    fields: [
      f('api_key', 'API key', true, (v) =>
        /^[a-f0-9]{32}$/.test(v) ? undefined : 'An AssemblyAI API key is 32 hexadecimal characters (AssemblyAI dashboard → API keys).',
      ),
    ],
  },
  // Built-in live rooms: every school's room is a private Daily room on the platform's account. The backend verifies the
  // key live (GET https://api.daily.co/v1/ → the account's domain; a pasted domain must match it).
  {
    key: 'daily',
    kind: 'video',
    name: 'Daily',
    description:
      'Video for the built-in live rooms (Daily Prebuilt, private rooms, meeting tokens, cloud recording) · an API key from the Daily dashboard → Developers',
    role: null,
    fields: [
      f('api_key', 'API key', true, (v) =>
        /^[A-Za-z0-9]{32,128}$/.test(v) ? undefined : 'A Daily API key is letters and digits (Daily dashboard → Developers → API key).',
      ),
      optional(
        f('domain', 'Domain', false, (v) =>
          /^(https?:\/\/)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.daily\.co\/?$/i.test(v.trim())
            ? undefined
            : 'The domain looks like yourcompany.daily.co.',
        ),
      ),
      optional(
        f('webhook_secret', 'Webhook HMAC secret (base64)', true, (v) =>
          /^[A-Za-z0-9+/]{22,}={0,2}$/.test(v.trim())
            ? undefined
            : 'The webhook secret is the base64 HMAC secret the webhook was created with.',
        ),
      ),
    ],
  },
  // The bearer token Prometheus scrapes GET /api/metrics with. Nothing to call: the operator generates it and puts the
  // same value in the scrape config, so the backend only checks the format.
  {
    key: 'metrics',
    kind: 'monitoring',
    name: 'Prometheus metrics',
    description: 'Bearer token for scraping GET /api/metrics · without it (or METRICS_TOKEN) the endpoint answers 404',
    role: null,
    fields: [
      f('token', 'Scrape token', true, (v) =>
        /^[A-Za-z0-9._~+/=-]{32,256}$/.test(v)
          ? undefined
          : 'Use a random token of at least 32 characters (for example: openssl rand -hex 32).',
      ),
    ],
  },
  // Virus scanning of every upload: a clamd daemon, usually on the private network. The backend verifies it with
  // PING → PONG; the mock's clamd answers on every host except CLAMAV_UNREACHABLE_HOST.
  {
    key: 'clamav',
    kind: 'security',
    name: 'ClamAV',
    description: 'Virus scanning of every upload (media library, assignment files, SCORM packages) · a clamd daemon reachable over TCP',
    role: null,
    fields: [
      f('host', 'Host', false, (v) =>
        isIp(v) || /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(v)
          ? undefined
          : 'The host must be a hostname or an IP address, e.g. clamav.internal.',
      ),
      f('port', 'Port', false, (v) => (/^\d+$/.test(v) && +v >= 1 && +v <= 65535 ? undefined : 'The port must be between 1 and 65535.')),
    ],
    verify: ({ host = '', port = '' }) => (host === CLAMAV_UNREACHABLE_HOST ? `no clamd answered PING at ${host}:${port}` : undefined),
  },
  ...OAUTH_PROVIDERS.map(([key, name]): Def => ({
    key: `oauth_${key}`,
    kind: 'oauth',
    name: `${name} OAuth app`,
    description:
      key === 'x'
        ? `Lets schools connect their ${name} account. Register this callback URL in the ${name} app: ${OAUTH_REDIRECT}`
        : `Lets schools connect their ${name} account. Register this redirect URI with ${name}: ${OAUTH_REDIRECT}` +
          (key === 'discord'
            ? ' · The bot token (same application) lets Coursiva add students to a school’s server and sync their roles by course.'
            : ''),
    role: null,
    fields: oauthFields(key),
    // DiscordBot::verify: a bot token, when given, must be accepted by GET /users/@me as a bot.
    ...(key === 'discord' && {
      verify: ({ bot_token: token = '' }: Record<string, string>) =>
        token === DISCORD_REFUSED_BOT_TOKEN
          ? 'Discord refused the bot token'
          : token === DISCORD_USER_TOKEN
            ? 'the token is not a bot token'
            : undefined,
    }),
  })),
];

const seed = (connection: string, values: Record<string, string>, verifiedAt: string): StoredCredentials => ({
  connection,
  values,
  verifiedAt,
});

export const connectionStore = singleton<{ credentials: StoredCredentials[] }>('platformConnections', () => ({
  credentials: [
    seed('cloudflare', { api_token: 'cf-tok-9d2a61c4e8b7f03a', zone_id: '4f1c0e2b9a8d7c6b5a4f3e2d1c0b9a8d' }, ago({ d: 34 })),
    seed(
      'cloudflare_registrar',
      { account_id: '0123456789abcdef0123456789abcdef', api_token: 'cf-reg-tok-5b8e2d7a91c4f06e' },
      ago({ d: 9 }),
    ),
    seed('oauth_zoom', { client_id: 'zoom-client-7Fq2', client_secret: 'zoom-secret-c01d9e8f7a6b' }, ago({ d: 12 })),
    // Paddle (sandbox) bills one school already (see the Paddle invoice in the billing mock).
    seed(
      'paddle',
      {
        api_key: 'pdl_sdbx_apikey_01j9x4c7m2k8q5w3e6r1t0y9u8',
        client_token: 'test_7c1e4b9a2d6f8e0c3b5a7d9f1e2',
        webhook_secret: 'pdl_ntfset_01j9x4d2f7h3k6m9p1r4t7w0z3_mock',
        product_id: 'pro_01j9x4b6c8d0e2f4g6h8j0k2m4',
      },
      ago({ d: 20 }),
    ),
  ],
}));

const stored = (key: string) => connectionStore.get().credentials.find((c) => c.connection === key);
const view = (d: Def): PlatformConnection => ({
  ...toConnection(d, stored(d.key)),
  kind: d.kind,
  capabilities: capabilitiesNeeding(d.key),
});

function find(key: string | readonly string[] | undefined) {
  const d = CONNECTIONS.find((c) => c.key === key);
  if (!d) throw notFound('Connection');
  // Payment providers' credentials move money: they also need billing.manage.
  if (d.kind === 'payments') authorize('billing.manage');
  return d;
}

/** A merchant of record can't be disconnected while it is the billing provider or still bills schools. */
function assertDisconnectable(d: Def) {
  if (d.key !== 'paddle' && d.key !== 'lemon_squeezy') return;
  if (platformSettings.get().billingProvider === d.key)
    throw new HttpError(409, `${d.name} is the billing provider. Choose another one in Settings → Billing & dunning first.`);
  // A real backend counts live subscriptions at the provider; the mock counts schools with its invoices.
  const billed = new Set(invoices.where((v) => v.provider === d.key).map((v) => v.tenantId)).size;
  if (billed > 0)
    throw new HttpError(
      409,
      `${billed} ${billed === 1 ? 'school is' : 'schools are'} still billed through ${d.name}. Disconnecting would stop their renewals from being recorded.`,
    );
}

type Params = { key: string };

export const connectionHandlers = [
  http.get(
    route('/platform/connections'),
    handle(() => {
      authorize('platform.view');
      return ok(CONNECTIONS.map(view));
    }),
  ),

  http.put<Params>(
    route('/platform/connections/:key'),
    handle<Params>(async ({ request, params }) => {
      authorize('platform.manage');
      const d = find(params.key);
      requireRecentPassword();
      const { credentials } = await readBody<ConnectionInput>(request);
      const before = stored(d.key);
      const values = mergeCredentials(d, before, credentials);
      const rest = connectionStore.get().credentials.filter((c) => c.connection !== d.key);
      connectionStore.patch({ credentials: [...rest, { connection: d.key, values, verifiedAt: new Date().toISOString() }] });
      recordAudit(before ? `Updated credentials for ${d.name}` : `Connected ${d.name}`, 'Security');
      return ok(view(d));
    }),
  ),

  http.delete<Params>(
    route('/platform/connections/:key'),
    handle<Params>(({ params }) => {
      authorize('platform.manage');
      const d = find(params.key);
      requireRecentPassword();
      assertDisconnectable(d);
      if (stored(d.key)) {
        connectionStore.patch({ credentials: connectionStore.get().credentials.filter((c) => c.connection !== d.key) });
        recordAudit(`Disconnected ${d.name}`, 'Security');
      }
      return ok(view(d));
    }),
  ),

  http.post<Params>(
    route('/platform/connections/:key/test'),
    handle<Params>(({ params }) => {
      authorize('platform.manage');
      const d = find(params.key);
      const s = stored(d.key);
      if (!s) throw new HttpError(409, `${d.name} is not connected.`);
      s.verifiedAt = new Date().toISOString();
      connectionStore.patch({ credentials: [...connectionStore.get().credentials] });
      return ok({ ok: true, latencyMs: 184, message: `${d.name} accepted the credentials.` });
    }),
  ),
];

// ---------- Feature availability ----------
// The backend's `coursiva.availability.capabilities` (Laravel) / `internal/availability` (Go): one platform switch per
// capability, above plans, extensions and tenant overrides. Per-network, per-provider and per-app entries are generated
// from those catalogues. A missing switch is on; a switch that is on with a missing connection is still unavailable.
interface CapabilityDef {
  key: string;
  label: string;
  group: string;
  description: string;
  surfaces: string[];
  modules?: string[];
  extensions?: string[];
  requires?: string[];
  requiresAny?: boolean;
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  { key: 'video', label: 'Video & live' },
  { key: 'ai', label: 'AI' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'marketing', label: 'Marketing & growth' },
  { key: 'learning', label: 'Learning' },
  { key: 'commerce', label: 'Commerce' },
  { key: 'signin', label: 'Sign-in & security' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'other', label: 'Other modules' },
];

const cap = (
  group: string,
  key: string,
  label: string,
  description: string,
  surfaces: string[],
  extra: Pick<CapabilityDef, 'modules' | 'extensions' | 'requires' | 'requiresAny'> = {},
): CapabilityDef => ({ key, label, group, description, surfaces, ...extra });

/** A plain module switch: the module disappears from every school. */
const moduleCap = (group: string, key: string, label: string, extensions: string[] = []) =>
  cap(group, key, label, `Schools lose the ${label} module and everything in it.`, [`${label} in the dashboard nav and search`], {
    modules: [key],
    extensions,
  });

/** Ad networks the Channels hub connects (`channels/networks`). */
const AD_NETWORKS: [key: string, name: string, connection: string][] = [
  ['google', 'Google Ads', 'google_ads'],
  ['microsoft', 'Microsoft Advertising', 'microsoft_ads'],
  ['meta', 'Meta Ads', 'oauth_meta'],
  ['tiktok', 'TikTok Ads', 'oauth_tiktok'],
  ['linkedin', 'LinkedIn Ads', 'oauth_linkedin'],
  ['pinterest', 'Pinterest Ads', 'oauth_pinterest'],
  ['x', 'X Ads', 'oauth_x'],
];
/** Social sign-in providers the student site offers (SocialProviders::PROVIDERS). */
const SIGN_IN_PROVIDERS: [key: string, name: string][] = [['google', 'Google']];
/** Marketplace apps (the integrations catalogue); `oauth` = the platform OAuth app it signs in with. */
const MARKETPLACE_APPS: [key: string, name: string, oauth?: string][] = [
  ['slack', 'Slack', 'slack'],
  ['hubspot', 'HubSpot', 'hubspot'],
  ['salesforce', 'Salesforce', 'salesforce'],
  ['mailchimp', 'Mailchimp'],
  ['kit', 'Kit'],
  ['zapier', 'Zapier'],
  ['google-sheets', 'Google Sheets', 'google'],
  ['notion', 'Notion', 'notion'],
  ['intercom', 'Intercom', 'intercom'],
  ['zendesk', 'Zendesk', 'zendesk'],
  ['discord', 'Discord', 'discord'],
  ['quickbooks', 'QuickBooks', 'quickbooks'],
  ['xero', 'Xero', 'xero'],
  ['canva', 'Canva', 'canva'],
];

export const CAPABILITIES: CapabilityDef[] = [
  // Video & live
  cap(
    'video',
    'live_classes',
    'Live classes',
    'Schools can’t schedule or run live classes; learners lose the Live pages and webinars.',
    ['Live in the dashboard nav', 'Live pages and webinars on school sites', 'Live reminders and recaps'],
    { modules: ['liveadmin'] },
  ),
  cap(
    'video',
    'live_rooms',
    'Built-in live rooms',
    'The in-browser room (Daily) disappears; schools use Zoom, Meet or Teams instead.',
    ['Built-in room option when scheduling', 'Join and start for built-in sessions', 'Built-in live rooms extension in the store'],
    { extensions: ['rooms'], requires: ['daily'] },
  ),
  cap('video', 'live_zoom', 'Zoom', 'Schools can’t connect Zoom or host classes on it.', ['Zoom provider option', 'Zoom join links'], {
    requires: ['oauth_zoom'],
  }),
  cap(
    'video',
    'live_meet',
    'Google Meet',
    'Schools can’t connect Google Meet or host classes on it.',
    ['Meet provider option', 'Meet join links'],
    {
      requires: ['oauth_google'],
    },
  ),
  cap(
    'video',
    'live_teams',
    'Microsoft Teams',
    'Schools can’t connect Teams or host classes on it.',
    ['Teams provider option', 'Teams join links'],
    {
      requires: ['oauth_microsoft'],
    },
  ),
  cap(
    'video',
    'video_streaming',
    'Video streaming (Mux)',
    'Uploads stay plain files: no transcoding or adaptive playback.',
    ['Transcoding of new uploads', 'Adaptive and signed playback'],
    { requires: ['mux'] },
  ),
  cap(
    'video',
    'drm',
    'Video DRM',
    'Hardware DRM and its extension disappear; videos play without licence checks.',
    ['DRM settings in the media library', 'Video DRM extension in the store'],
    { extensions: ['drm'], requires: ['ezdrm', 'keyos', 'mux'], requiresAny: true },
  ),
  // AI
  cap(
    'ai',
    'ai',
    'AI (Claude)',
    'Every AI touchpoint disappears: the AI studio, tutor, grading suggestions, live recaps and builder AI.',
    [
      'AI studio in the dashboard nav',
      'AI buttons in the course and quiz builders',
      'AI grading suggestions and live recaps',
      'AI tutor for learners',
    ],
    { modules: ['aistudio'], extensions: ['ai'], requires: ['anthropic'] },
  ),
  cap(
    'ai',
    'captions',
    'Captions & transcripts',
    'No auto captions or transcripts, including live transcripts.',
    ['Caption buttons on videos', 'Live transcripts'],
    {
      requires: ['assemblyai'],
    },
  ),
  // Messaging
  cap(
    'messaging',
    'sms',
    'SMS',
    'Schools can’t send texts; SMS reminders and automation steps are skipped.',
    ['SMS & WhatsApp in the dashboard nav', 'SMS steps in automations and reminders'],
    { modules: ['sms'] },
  ),
  cap('messaging', 'whatsapp', 'WhatsApp', 'The WhatsApp channel disappears from SMS & WhatsApp.', [
    'WhatsApp tab',
    'WhatsApp steps in automations',
  ]),
  // The Expo access token is optional (push works without it), so push needs no connection.
  cap('messaging', 'push', 'Mobile push', 'No push notifications to the schools’ mobile apps.', ['Push channel in notifications']),
  cap(
    'messaging',
    'mobile_app',
    'Mobile app',
    'The white-label mobile app and its extension disappear.',
    ['Mobile app in the dashboard nav', 'White-label mobile app extension in the store'],
    { modules: ['mobileapp'], extensions: ['app'] },
  ),
  moduleCap('messaging', 'inbox', 'Inbox'),
  moduleCap('messaging', 'campaigns', 'Email campaigns'),
  moduleCap('messaging', 'automations', 'Automations'),
  // Marketing & growth
  cap(
    'marketing',
    'channels',
    'Ads & channels',
    'The ads and channels hub and its extension disappear; ad syncs stop.',
    ['Ads & channels in the dashboard nav', 'Ad syncs and social publishing', 'Ads & channels hub extension in the store'],
    { modules: ['channels'], extensions: ['ads'] },
  ),
  ...AD_NETWORKS.map(([key, name, connection]) =>
    cap('marketing', `ads_${key}`, name, `Schools can’t connect ${name} in Channels; its syncs stop.`, [`${name} in Channels`], {
      requires: [connection],
    }),
  ),
  moduleCap('marketing', 'affiliates', 'Affiliates & partners', ['aff']),
  moduleCap('marketing', 'coupons', 'Coupons & offers'),
  moduleCap('marketing', 'forms', 'Forms & leads'),
  moduleCap('marketing', 'blog', 'Blog'),
  moduleCap('marketing', 'seo', 'SEO'),
  moduleCap('marketing', 'sitebuilder', 'Site builder'),
  // Learning
  moduleCap('learning', 'community', 'Community', ['spaces']),
  cap(
    'learning',
    'certs',
    'Certificates',
    'Schools can’t issue certificates; learners lose them on the school site.',
    ['Certificates in the dashboard nav', 'Certificates on school sites', 'Advanced credentials extension in the store'],
    { modules: ['certs'], extensions: ['cred'] },
  ),
  cap(
    'learning',
    'scorm',
    'SCORM & xAPI',
    'SCORM imports and xAPI statements stop.',
    ['SCORM import', 'SCORM & xAPI extension in the store'],
    {
      extensions: ['scorm'],
    },
  ),
  cap(
    'learning',
    'exams',
    'Proctored exams',
    'Locked exam sessions and proctoring disappear.',
    ['Proctoring settings on quizzes', 'Proctored exams extension in the store'],
    { extensions: ['exam'] },
  ),
  moduleCap('learning', 'quizbuilder', 'Quiz builder'),
  moduleCap('learning', 'assignments', 'Assignments'),
  moduleCap('learning', 'reviews', 'Reviews'),
  moduleCap('learning', 'groups', 'Groups & seats'),
  moduleCap('learning', 'studentxp', 'Student experience'),
  // Commerce
  moduleCap('commerce', 'products', 'Products'),
  moduleCap('commerce', 'bookings', 'Bookings'),
  moduleCap('commerce', 'memberships', 'Memberships'),
  cap('commerce', 'pay_stripe', 'Stripe payouts', 'Schools can’t connect Stripe to get paid.', ['Stripe in payout settings'], {
    requires: ['oauth_stripe'],
  }),
  cap(
    'commerce',
    'domain_purchase',
    'Domain purchase',
    'Schools can’t buy a domain in the dashboard; connecting their own still works.',
    ['Buy a domain in Branding & domain'],
    { requires: ['cloudflare_registrar'] },
  ),
  // Sign-in & security
  cap('signin', 'sso', 'Single sign-on', 'SAML, SCIM and HRIS provisioning disappear.', ['SSO settings', 'SSO sign-in on school sites']),
  ...SIGN_IN_PROVIDERS.map(([key, name]) =>
    cap(
      'signin',
      `signin_${key}`,
      `Sign in with ${name}`,
      `Learners can’t sign in with ${name}; their passwords still work.`,
      [`“Continue with ${name}” on school sign-in pages`],
      { requires: [`oauth_${key}`] },
    ),
  ),
  // Integrations
  ...MARKETPLACE_APPS.map(([key, name, oauth]) =>
    cap(
      'integrations',
      `app_${key}`,
      name,
      `Schools can’t connect ${name}; connected schools stop syncing.`,
      [`${name} in the integrations catalogue`],
      {
        requires: oauth ? [`oauth_${oauth}`] : [],
      },
    ),
  ),
  cap(
    'integrations',
    'api_webhooks',
    'API keys & webhooks',
    'School API keys stop working and webhooks stop being delivered.',
    ['API keys and webhooks settings', 'API & webhooks extension in the store'],
    { extensions: ['api'] },
  ),
  cap(
    'integrations',
    'i18n',
    'Multi-language',
    'Schools can’t translate their content.',
    ['Translations', 'Multi-language extension in the store'],
    {
      extensions: ['i18n'],
    },
  ),
  // Other modules
  moduleCap('other', 'analytics', 'Analytics'),
  moduleCap('other', 'vidanalytics', 'Video analytics'),
  moduleCap('other', 'branding', 'Branding & domain'),
  moduleCap('other', 'emailsettings', 'Sending & senders'),
  moduleCap('other', 'audit', 'Audit log'),
  moduleCap('other', 'integrations', 'Integrations & API'),
];

/**
 * Switched-off capabilities (`platform_settings` `availability.switches`). The seed is the migration of the old
 * Media → Live rooms policies: a stored `built_in_rooms: false` turns `live_rooms` off, `byo_providers: false` the three
 * BYO providers.
 */
export const availabilityStore = singleton<{ off: string[] }>('platformAvailability', () => {
  const old = mediaStore.get().liveRoomPoliciesOff as string[];
  return {
    off: [
      ...(old.includes('built_in_rooms') ? ['live_rooms'] : []),
      ...(old.includes('byo_providers') ? ['live_zoom', 'live_meet', 'live_teams'] : []),
    ],
  };
});

const connectionName = (key: string) =>
  CONNECTIONS.find((c) => c.key === key)?.name ?? MEDIA_CONNECTIONS.find((c) => c.key === key)?.name ?? key;
const isConnected = (key: string) => !!stored(key) || mediaStore.get().credentials.some((c) => c.connection === key);
const switchedOn = (key: string) => !availabilityStore.get().off.includes(key);

/** Whether a school uses a capability (cheap counts only; null when it can't be told, as the backend returns). */
function usedBy(def: CapabilityDef, t: TenantRow): boolean | null {
  if (def.modules?.length) {
    const mods = tenantModules(t);
    return def.modules.some((m) => mods.find((x) => x.id === m)?.enabled);
  }
  if (def.extensions?.length) return def.extensions.some((e) => t.paidExtensions.includes(e) || t.compedExtensions.includes(e));
  return null;
}

function toCapability(def: CapabilityDef): Capability {
  const requires = (def.requires ?? []).map((key) => ({ key, label: connectionName(key), connected: isConnected(key) }));
  const connected = !requires.length || (def.requiresAny ? requires.some((r) => r.connected) : requires.every((r) => r.connected));
  const on = switchedOn(def.key);
  const live = tenants.where((t) => t.status !== 'Suspended');
  const uses = live.map((t) => usedBy(def, t));
  const exts = def.extensions ?? [];
  return {
    key: def.key,
    label: def.label,
    group: def.group,
    description: def.description,
    surfaces: def.surfaces,
    modules: def.modules ?? [],
    extensions: exts,
    requires,
    requiresAny: def.requiresAny ?? false,
    on,
    available: on && connected,
    schoolsUsing: uses.some((u) => u === null) ? null : uses.filter(Boolean).length,
    payingSchools: live.filter((t) => exts.some((e) => t.paidExtensions.includes(e))).length,
  };
}

/** The capabilities a connection is required for (its "Available to schools" switches). */
function capabilitiesNeeding(connection: string): ConnectionCapability[] {
  return CAPABILITIES.filter((c) => c.requires?.includes(connection)).map((c) => ({ key: c.key, label: c.label, on: switchedOn(c.key) }));
}

/** Capability keys unavailable to schools (the `unavailable` list of `/auth/me` and the public site). */
export const unavailableCapabilities = () =>
  CAPABILITIES.map(toCapability)
    .filter((c) => !c.available)
    .map((c) => c.key);

const availabilityHandlers = [
  http.get(
    route('/platform/availability'),
    handle(() => {
      authorize('platform.view');
      const data: Availability = { capabilities: CAPABILITIES.map(toCapability), groups: CAPABILITY_GROUPS };
      return ok(data);
    }),
  ),

  http.put<KeyParams>(
    route('/platform/availability/:key'),
    handle<KeyParams>(async ({ request, params }) => {
      authorize('platform.manage');
      const def = CAPABILITIES.find((c) => c.key === params.key);
      if (!def) throw notFound('Capability');
      const body = await readBody<AvailabilityUpdate>(request);
      if (typeof body.on !== 'boolean') throw invalid({ on: 'On must be true or false.' });
      // Like both backends: switching a capability off removes it from every school at once (step-up); on doesn't.
      if (!body.on) requireRecentPassword();
      if (body.on !== switchedOn(def.key)) {
        const off = availabilityStore.get().off.filter((k) => k !== def.key);
        availabilityStore.patch({ off: body.on ? off : [...off, def.key] });
        recordAudit(`Turned ${body.on ? 'on' : 'off'} ${def.label} for all schools`, 'Flags');
      }
      return ok(toCapability(def));
    }),
  ),
];

export const handlers = [
  ...connectionHandlers,
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
      // Like both backends: a platform flag switches a feature for every school at once (step-up).
      requireRecentPassword();
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
      // The demo models a connected mail provider (measured volumes and rates). Laravel answers null for
      // per-domain volume/rates and the bounce/complaint summary until the provider's event webhooks exist.
      const sent = domains.reduce((s, d) => s + (d.sent30d ?? 0), 0);
      const weighted = (pick: (d: SenderDomain) => number | null) =>
        sent ? Math.round((domains.reduce((s, d) => s + (pick(d) ?? 0) * (d.sent30d ?? 0), 0) / sent) * 100) / 100 : 0;
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

  ...SENDER_ACTIONS.map((action) =>
    http.post<IdParams>(
      route(`/platform/sender-domains/:id/${action}`),
      handle<IdParams>(({ params }) => {
        authorize('platform.manage');
        const s = findOr404(senders.find(params.id), 'Sender domain');
        const name = tenantName(s.tenantId);
        switch (action) {
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
        }
        return ok(toSender(s));
      }),
    ),
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

  ...CERTIFICATE_ACTIONS.map((action) =>
    http.post<IdParams>(
      route(`/platform/certificates/:id/${action}`),
      handle<IdParams>(({ params }) => {
        authorize('platform.manage');
        const c = findOr404(certificates.find(params.id), 'Certificate');
        if (action === 'revoke') {
          if (c.revokedAt) throw invalid({ status: `${c.id} is already revoked.` });
          certificates.update(c.id, { revokedAt: new Date().toISOString() });
          recordAudit(`Revoked certificate ${c.id} (${c.learnerName})`, 'Security', c.tenantId);
        } else {
          if (!c.revokedAt) throw invalid({ status: `${c.id} is not revoked.` });
          certificates.update(c.id, { revokedAt: null });
          recordAudit(`Reinstated certificate ${c.id} (${c.learnerName})`, 'Security', c.tenantId);
        }
        return ok(toCertificate(c));
      }),
    ),
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
          // Laravel doesn't count these platform-wide yet: null = not measured.
          xapiStatements24h: null,
          ltiLaunches30d: null,
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
      // Like both backends: a key outlives the session, so minting one needs a recently confirmed password.
      requireRecentPassword();
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

  ...availabilityHandlers,
];
