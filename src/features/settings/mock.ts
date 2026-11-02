// Mock implementation of /settings (Laravel: a settings table / spatie-settings + a FormRequest per section).
import { http } from 'msw';
import { connectionStore } from '@/features/platform/mock';
import { platformSettings, tenants, type StaffRow } from '@/mocks/collections';
import { collection, singleton } from '@/mocks/db';
import {
  authorize,
  handle,
  HttpError,
  invalid,
  noContent,
  notFound,
  ok,
  permissionsOf,
  readBody,
  recordAudit,
  requireRecentPassword,
  route,
} from '@/mocks/http';
import { toSnake } from '@/lib/api/case';
import { PLANS } from '@/lib/domain';
import {
  BILLING_PROVIDERS,
  BRAND_ASSET_SLOTS,
  DATA_REGIONS,
  IDLE_LOCK_MINUTES,
  SESSION_HOURS,
  SETTINGS_SECTIONS,
  type BillingProvider,
  type BrandAssetSlot,
  type EmailTestResult,
  type IntegrationSettings,
  type PlatformSettings,
  type PlatformSettingsUpdate,
  type SettingKey,
  type SettingsMetaWire,
  type SettingsSection,
  type TaxRegion,
  type TaxSettings,
  type TaxSettingsUpdate,
} from './types';
import { isEmail, isHexColor, isHttpsUrl, isIpOrCidr, isSubdomainLabel, isTimezone } from './validation';

/** Domains the platform controls DNS for (a Laravel config value / verified-domains table). */
const VERIFIED_DOMAINS = ['coursiva.io', 'coursiva.com', 'coursiva.app'];
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
/** The address the mock API sees every request coming from (also written on audit entries). */
export const REQUEST_IP = '203.0.113.10';

/** Audit wording for each field ("Updated platform settings: trial length, SSO enforcement"). */
export const FIELD_LABELS: Record<SettingKey, string> = {
  platformName: 'platform name',
  supportEmail: 'support email',
  primaryDomain: 'primary domain',
  helpCentreUrl: 'help centre URL',
  defaultTimezone: 'default timezone',
  publicSignup: 'public sign-up',
  defaultPlan: 'default plan',
  trialDays: 'trial length',
  trialRequiresCard: 'card requirement for trials',
  cardCheckAmount: 'card check amount',
  reservedSubdomains: 'reserved subdomains',
  minSubdomainLength: 'minimum subdomain length',
  defaultBrandColor: 'default brand colour',
  defaultDataRegion: 'default data region',
  footerText: 'platform footer',
  legalCompanyName: 'company name',
  legalAddress: 'registered address',
  termsUrl: 'terms URL',
  privacyUrl: 'privacy URL',
  socialLinks: 'social profiles',
  mailFromName: 'sender name',
  mailFromAddress: 'sender address',
  mailReplyTo: 'reply-to address',
  emailFooter: 'email footer',
  billingProvider: 'billing provider',
  dunningRetries: 'payment retries',
  autoSuspend: 'auto-suspend',
  requireStaffTwoFactor: 'staff two-factor requirement',
  enforceSso: 'SSO enforcement',
  sessionHours: 'session timeout',
  idleLockMinutes: 'idle lock',
  consoleIpAllowlist: 'console IP allowlist',
  impersonationRequiresReason: 'impersonation reason requirement',
  impersonationMaxMinutes: 'impersonation limit',
  weeklyDigest: 'weekly digest',
  billingAlerts: 'billing alerts',
  incidentAlerts: 'incident alerts',
  maintenanceMode: 'maintenance mode',
  maintenanceMessage: 'maintenance message',
  maintenanceExemptTenants: 'maintenance exemptions',
};

type MetaRow = [key: SettingKey, section: SettingsSection, defaultValue: unknown, effect: string, resettable?: false];
/**
 * Shipped defaults and where each value is read — mirrors the backend's SettingDefinitions. `null` = no default;
 * `resettable: false` = Restore defaults leaves it (the meta then reports `default: null`).
 */
const META: MetaRow[] = [
  ['platformName', 'platform', 'Coursiva', 'Sign-off of platform emails and invoice PDFs'],
  ['supportEmail', 'platform', 'support@coursiva.com', 'Billing emails, error pages and the “no such workspace” screen'],
  ['primaryDomain', 'platform', null, 'New tenants’ subdomains ({slug}.{primary_domain})'],
  ['helpCentreUrl', 'platform', '', 'Help link in the tenant dashboard'],
  ['defaultTimezone', 'platform', 'UTC', 'Timezone of new workspaces'],
  ['publicSignup', 'signup', true, 'Marketing-site sign-up (POST /api/v1/marketing/signup)'],
  ['defaultPlan', 'signup', 'Launch', 'Plan of new tenants (console and self-service sign-up)'],
  ['trialDays', 'signup', 14, 'Free-trial length of new schools (marketing sign-up, console provisioning, Plans & pricing)'],
  ['trialRequiresCard', 'signup', true, 'Marketing sign-up (card check before the trial starts) and trial end (pause without a card)'],
  ['cardCheckAmount', 'signup', 50, 'Card check at marketing sign-up (charged, then refunded)'],
  ['reservedSubdomains', 'signup', [], 'Subdomain checks at sign-up and tenant creation'],
  ['minSubdomainLength', 'signup', 3, 'Subdomain checks at sign-up and tenant creation'],
  ['defaultBrandColor', 'branding', '#4F46E5', 'Brand colour new workspaces start with'],
  ['defaultDataRegion', 'branding', 'US', 'Region of new workspaces when none is chosen'],
  ['footerText', 'branding', '', 'Footer of platform emails'],
  ['legalCompanyName', 'legal', '', 'Footer of platform emails and invoice PDFs'],
  ['legalAddress', 'legal', '', 'Footer of platform emails and invoice PDFs'],
  ['termsUrl', 'legal', '', 'Links in platform emails and marketing sign-up'],
  ['privacyUrl', 'legal', '', 'Links in platform emails and marketing sign-up'],
  ['socialLinks', 'legal', [], 'Footer of platform emails and invoice PDFs'],
  ['mailFromName', 'email', 'Coursiva', 'Sender of platform emails (schools send under their own sender)'],
  ['mailFromAddress', 'email', 'no-reply@coursiva.io', 'Sender of platform emails (schools send under their own sender)'],
  ['mailReplyTo', 'email', '', 'Sender of platform emails (schools send under their own sender)'],
  ['emailFooter', 'email', '', 'Footer of platform emails'],
  ['requireStaffTwoFactor', 'security', false, 'Staff sign-in'],
  ['enforceSso', 'security', false, 'Staff sign-in'],
  ['sessionHours', 'security', 12, 'Staff session lifetime'],
  ['idleLockMinutes', 'security', 15, 'Console idle lock (GET /auth/me)'],
  ['consoleIpAllowlist', 'security', [], 'Staff sign-in and every console request'],
  ['impersonationRequiresReason', 'security', true, 'Starting and ending tenant impersonation'],
  ['impersonationMaxMinutes', 'security', 30, 'Starting and ending tenant impersonation'],
  [
    'billingProvider',
    'billing',
    'stripe',
    'Where schools check out and pay their subscription (dashboard Plan & billing); schools already subscribed keep theirs',
    false,
  ],
  ['dunningRetries', 'billing', 3, 'Failed-payment retries and suspension (billing run)'],
  ['autoSuspend', 'billing', true, 'Failed-payment retries and suspension (billing run)'],
  ['weeklyDigest', 'notifications', true, 'Staff notification emails'],
  ['billingAlerts', 'notifications', true, 'Staff notification emails'],
  ['incidentAlerts', 'notifications', true, 'Staff notification emails'],
  ['maintenanceMode', 'maintenance', false, 'Tenant dashboards and school sites (503 while on)'],
  ['maintenanceMessage', 'maintenance', '', 'Tenant dashboards and school sites (503 while on)'],
  ['maintenanceExemptTenants', 'maintenance', [], 'Tenant dashboards and school sites (503 while on)'],
];

// Laravel PlatformSettingsController::meta: `key` is the snake_case setting name as a value.
const settingsMeta = (): SettingsMetaWire => ({
  fields: META.map(([key, section, defaultValue, effect, resettable]) => ({
    key: toSnake(key),
    section,
    default: resettable === false ? null : defaultValue,
    effect,
  })),
});

const BRAND_SLOT_LABELS: Record<BrandAssetSlot, string> = {
  logo: 'logo',
  logo_dark: 'logo for dark backgrounds',
  favicon: 'favicon',
  og_image: 'social share image',
};
const BRAND_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const brandLimit = (slot: BrandAssetSlot) => (slot === 'favicon' ? 512 * 1024 : 2 * 1024 * 1024);

/** The settings row, with defaults for fields added after a dev database was persisted. */
function current(): PlatformSettings {
  const row = platformSettings.get();
  const missing = META.filter(([key]) => (row as Partial<PlatformSettings>)[key] === undefined);
  if (!missing.length && Array.isArray(row.brandAssets) && row.billingCurrency) return row;
  return platformSettings.patch({
    // Laravel: config('coursiva.billing.currency') — read-only, never written by PATCH.
    billingCurrency: row.billingCurrency || 'USD',
    ...Object.fromEntries(missing.map(([key, , d]) => [key, d ?? ''])),
    ...(Array.isArray(row.brandAssets) ? {} : { brandAssets: BRAND_ASSET_SLOTS.map((slot) => ({ slot, url: null, updatedAt: null })) }),
  });
}

const isInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, max: number, min = 0): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const BOOLEAN_FIELDS = [
  'publicSignup',
  'trialRequiresCard',
  'autoSuspend',
  'requireStaffTwoFactor',
  'enforceSso',
  'impersonationRequiresReason',
  'weeklyDigest',
  'billingAlerts',
  'incidentAlerts',
  'maintenanceMode',
] as const satisfies readonly SettingKey[];
const LOWERCASE_FIELDS: readonly SettingKey[] = ['supportEmail', 'primaryDomain', 'mailFromAddress', 'mailReplyTo', 'reservedSubdomains'];

/** Trims strings, lowercases addresses and cleans lists (trimmed, no blanks, no duplicates). */
function normalise(key: SettingKey, value: unknown): unknown {
  const lower = LOWERCASE_FIELDS.includes(key);
  const clean = (v: string) => (lower ? v.trim().toLowerCase() : v.trim());
  if (key === 'defaultBrandColor' && typeof value === 'string') return value.trim().toUpperCase();
  if (typeof value === 'string') return clean(value);
  if (isStrList(value)) return [...new Set(value.map(clean).filter(Boolean))];
  return value;
}

/** IPv4 CIDR match (exact match for IPv6 and plain addresses — enough for the mock's single request IP). */
function ipMatches(ip: string, entry: string) {
  const [net = '', bits] = entry.split('/');
  if (bits === undefined || net.includes(':')) return net === ip;
  const toInt = (a: string) => a.split('.').reduce((n, o) => n * 256 + Number(o), 0);
  const size = 2 ** (32 - Number(bits));
  return Math.floor(toInt(ip) / size) === Math.floor(toInt(net) / size);
}

/** Validates a PATCH /settings body like a Laravel FormRequest (`sometimes` rules). Runs on normalised values. */
function validateSettings(body: PlatformSettingsUpdate, prev: PlatformSettings): Record<string, string> {
  const e: Record<string, string> = {};
  const url = (key: 'helpCentreUrl' | 'termsUrl' | 'privacyUrl', message: string) => {
    const v: unknown = body[key];
    if (v !== undefined && (typeof v !== 'string' || (v !== '' && !isHttpsUrl(v)))) e[key] = message;
  };
  const LIST_RULES = {
    reservedSubdomains: [200, isSubdomainLabel, 'Reserve up to 200 subdomains (letters, numbers and hyphens, 1–40 characters each).'],
    socialLinks: [10, isHttpsUrl, 'Add up to 10 https:// profile URLs.'],
    consoleIpAllowlist: [50, isIpOrCidr, 'Add up to 50 IP addresses or CIDR ranges, like 203.0.113.0/24.'],
    maintenanceExemptTenants: [100, (tid: string) => !!tenants.find(tid), 'Exempt up to 100 tenants.'],
  } as const satisfies Partial<Record<SettingKey, readonly [number, (v: string) => boolean, string]>>;
  for (const [key, [max, valid, message]] of Object.entries(LIST_RULES)) {
    const v: unknown = body[key as keyof typeof LIST_RULES];
    if (v === undefined) continue;
    if (!Array.isArray(v) || v.length > max) e[key] = message;
    else
      v.forEach((item: unknown, i) => {
        if (typeof item !== 'string' || !valid(item)) e[`${key}.${i}`] = message;
      });
  }
  // Platform
  if (body.platformName !== undefined && !isStr(body.platformName, 60, 2)) e.platformName = 'The platform name must be 2–60 characters.';
  if (body.supportEmail !== undefined && (typeof body.supportEmail !== 'string' || !isEmail(body.supportEmail)))
    e.supportEmail = 'The support email must be a valid email address.';
  if (body.primaryDomain !== undefined) {
    const d = typeof body.primaryDomain === 'string' ? body.primaryDomain : '';
    if (!DOMAIN_RE.test(d)) e.primaryDomain = 'Enter a domain like example.com.';
    else if (!VERIFIED_DOMAINS.includes(d))
      e.primaryDomain = `${d} isn’t a verified platform domain. Verify its DNS first (verified: ${VERIFIED_DOMAINS.join(', ')}).`;
  }
  url('helpCentreUrl', 'Enter an https:// URL, or leave it empty to hide the link.');
  if (body.defaultTimezone !== undefined && (typeof body.defaultTimezone !== 'string' || !isTimezone(body.defaultTimezone)))
    e.defaultTimezone = 'Choose a timezone from the list.';
  // Signup & provisioning
  if (body.trialDays !== undefined && !isInt(body.trialDays, 0, 90)) e.trialDays = 'The trial length must be between 0 and 90 days.';
  if (body.cardCheckAmount !== undefined && !isInt(body.cardCheckAmount, 50, 500))
    e.cardCheckAmount = "The card check must be between 50 and 500 (minor units; Stripe's minimum is 50).";
  if (body.defaultPlan !== undefined && !PLANS.includes(body.defaultPlan)) e.defaultPlan = 'The selected plan is invalid.';
  if (body.minSubdomainLength !== undefined && !isInt(body.minSubdomainLength, 3, 20))
    e.minSubdomainLength = 'The minimum subdomain length must be between 3 and 20.';
  // Branding
  if (body.defaultBrandColor !== undefined && (typeof body.defaultBrandColor !== 'string' || !isHexColor(body.defaultBrandColor)))
    e.defaultBrandColor = 'Use a hex colour like #4F46E5.';
  if (body.defaultDataRegion !== undefined && !(DATA_REGIONS as readonly string[]).includes(body.defaultDataRegion))
    e.defaultDataRegion = 'Choose US, EU or APAC.';
  if (body.footerText !== undefined && !isStr(body.footerText, 300)) e.footerText = 'Keep the footer under 300 characters.';
  // Legal
  if (body.legalCompanyName !== undefined && !isStr(body.legalCompanyName, 160))
    e.legalCompanyName = 'Keep the company name under 160 characters.';
  if (body.legalAddress !== undefined && !isStr(body.legalAddress, 300)) e.legalAddress = 'Keep the address under 300 characters.';
  url('termsUrl', 'Enter an https:// URL, or leave it empty.');
  url('privacyUrl', 'Enter an https:// URL, or leave it empty.');
  // Email
  if (body.mailFromName !== undefined && !isStr(body.mailFromName, 80, 1)) e.mailFromName = 'The sender name must be 1–80 characters.';
  if (body.mailFromAddress !== undefined && (typeof body.mailFromAddress !== 'string' || !isEmail(body.mailFromAddress)))
    e.mailFromAddress = 'The sender address must be a valid email address.';
  if (body.mailReplyTo !== undefined && (typeof body.mailReplyTo !== 'string' || (body.mailReplyTo !== '' && !isEmail(body.mailReplyTo))))
    e.mailReplyTo = 'The reply-to address must be a valid email address, or empty.';
  if (body.emailFooter !== undefined && !isStr(body.emailFooter, 500)) e.emailFooter = 'Keep the email footer under 500 characters.';
  // Security
  if (body.sessionHours !== undefined && !(SESSION_HOURS as readonly number[]).includes(body.sessionHours))
    e.sessionHours = 'Choose a session timeout of 4, 8, 12 or 24 hours.';
  if (body.idleLockMinutes !== undefined && !(IDLE_LOCK_MINUTES as readonly number[]).includes(body.idleLockMinutes))
    e.idleLockMinutes = 'Choose an idle lock of 5, 10, 15, 30 or 60 minutes.';
  const allow = body.consoleIpAllowlist;
  const listFailed = Object.keys(e).some((k) => k.startsWith('consoleIpAllowlist'));
  if (!listFailed && allow?.length && !allow.some((entry) => ipMatches(REQUEST_IP, entry)))
    e.consoleIpAllowlist = `Your own address (${REQUEST_IP}) isn’t on the list — saving it would lock you out.`;
  if (body.impersonationMaxMinutes !== undefined && !isInt(body.impersonationMaxMinutes, 15, 240))
    e.impersonationMaxMinutes = 'Impersonation sessions last between 15 and 240 minutes.';
  // Laravel: no staff identity provider exists, so SSO can't be enforced.
  if (body.enforceSso === true)
    e.enforceSso = 'Staff single sign-on isn’t available yet — staff sign in with a password and two-factor authentication.';
  // Billing & dunning
  if (body.billingProvider !== undefined && !(BILLING_PROVIDERS as readonly string[]).includes(body.billingProvider))
    e.billingProvider = 'Choose Stripe, Paddle or Lemon Squeezy.';
  if (body.dunningRetries !== undefined && !isInt(body.dunningRetries, 1, 5)) e.dunningRetries = 'Payment retries must be between 1 and 5.';
  // Maintenance
  if (body.maintenanceMessage !== undefined && !isStr(body.maintenanceMessage, 300))
    e.maintenanceMessage = 'Keep the message under 300 characters.';
  const on: unknown = body.maintenanceMode ?? prev.maintenanceMode;
  const message: unknown = body.maintenanceMessage ?? prev.maintenanceMessage;
  if (on === true && !e.maintenanceMessage && (typeof message !== 'string' || !message))
    e.maintenanceMessage = 'Tell tenants what’s happening before turning maintenance on.';
  for (const k of BOOLEAN_FIELDS) if (body[k] !== undefined && typeof body[k] !== 'boolean') e[k] = 'Must be on or off.';
  return e;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const PROVIDER_NAMES: Record<BillingProvider, string> = { stripe: 'Stripe', paddle: 'Paddle', lemon_squeezy: 'Lemon Squeezy' };

/**
 * Schools can only be sent to a provider the console has connected, and only billing staff choose it (403 before the
 * 422). Stripe always counts as connected: without its keys checkout falls back to the environment's.
 */
function checkBillingProvider(next: BillingProvider | undefined, prev: PlatformSettings, user: StaffRow) {
  if (next === undefined || next === prev.billingProvider) return;
  if (!permissionsOf(user).includes('billing.manage'))
    throw new HttpError(403, 'Changing the billing provider needs the billing.manage permission.');
  if (next !== 'stripe' && !connectionStore.get().credentials.some((c) => c.connection === next))
    throw invalid({ billingProvider: `Connect ${PROVIDER_NAMES[next]} in Platform → Connections first.` });
}

/** Applies a validated patch and writes the maintenance audit entry; returns the fields that actually changed. */
function applySettings(patch: Partial<Record<SettingKey, unknown>>): SettingKey[] {
  const prev = current();
  const changed = (Object.keys(patch) as SettingKey[]).filter((k) => !same(patch[k], prev[k]));
  if (!changed.length) return [];
  platformSettings.patch(Object.fromEntries(changed.map((k) => [k, patch[k]])));
  if (changed.includes('maintenanceMode'))
    recordAudit(
      patch.maintenanceMode ? 'Turned maintenance mode on — tenant dashboards and school sites answer 503' : 'Turned maintenance mode off',
      'Security',
    );
  return changed;
}

function toBase64(buf: ArrayBuffer) {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Test-email throttle: 5 per 10 minutes per staff member (Laravel: RateLimiter). */
const testEmailsSent = new Map<string, number[]>();

// ---------- Integration marketplace ----------
/** [name, category, share of tenants connected, note] — a real backend counts tenant connections. */
const ADOPTION: [string, string, number, string | null][] = [
  ['Stripe', 'Payments', 0.9, 'Required for 96% of revenue'],
  ['Google Analytics 4', 'Analytics', 0.7, null],
  ['Zoom', 'Live classes', 0.6, 'Built-in rooms used by 3 more'],
  ['Zapier', 'Automation', 0.5, null],
  ['Mailchimp', 'Email', 0.4, null],
  ['Twilio', 'SMS', 0.2, 'Blocks the SMS module until connected'],
  ['Okta', 'SSO', 0.1, 'Scale tenants only'],
];

const requests = collection<{ id: string; name: string; requests: number; onRoadmap: boolean }>('settingsIntegrationRequests', () => [
  { id: 'rq_kajabi', name: 'Kajabi import', requests: 3, onRoadmap: false },
  { id: 'rq_podia', name: 'Podia import', requests: 2, onRoadmap: false },
  { id: 'rq_xendit', name: 'Xendit (Indonesia)', requests: 2, onRoadmap: false },
  { id: 'rq_beehiiv', name: 'Beehiiv', requests: 1, onRoadmap: false },
]);

function integrations(): IntegrationSettings {
  const total = tenants.all().length;
  return {
    liveApps: 54,
    categories: 20,
    // Folded into Platform → Feature availability (`pay_stripe`, `sso`, `exams`); always empty.
    policies: [],
    adoption: ADOPTION.map(([name, category, share, note]) => ({
      name,
      category,
      tenants: total ? Math.max(1, Math.round(share * total)) : 0,
      totalTenants: total,
      note,
    })),
    requests: [...requests.all()].sort((a, b) => b.requests - a.requests),
  };
}

// ---------- Tax & invoicing ----------
const LAST_ISSUED_INVOICE = 20260;
const tax = singleton<Omit<TaxSettings, 'regions' | 'nextInvoicePreview' | 'minNextInvoiceNumber'>>('settingsTax', () => ({
  stripeTax: true,
  taxInclusive: false,
  invoicePrefix: 'CV-',
  nextInvoiceNumber: 20261,
}));
const regions = collection<TaxRegion>('settingsTaxRegions', () => [
  { id: 'eu', region: 'European Union', kind: 'VAT · OSS', rate: '20–27%' },
  { id: 'uk', region: 'United Kingdom', kind: 'VAT', rate: '20%' },
  { id: 'au', region: 'Australia', kind: 'GST', rate: '10%' },
  { id: 'ca', region: 'Canada', kind: 'GST/HST', rate: '5–15%' },
  { id: 'us', region: 'United States', kind: 'Sales tax · per state', rate: 'auto' },
]);

function taxSettings(): TaxSettings {
  const t = tax.get();
  return {
    ...t,
    minNextInvoiceNumber: LAST_ISSUED_INVOICE + 1,
    nextInvoicePreview: t.invoicePrefix + String(t.nextInvoiceNumber).padStart(6, '0'),
    regions: regions.all(),
  };
}

type SectionParams = { section: string };
type SlotParams = { slot: string };
type IdParams = { id: string };

export const handlers = [
  http.get(
    route('/settings'),
    handle(() => {
      authorize('platform.view');
      return ok(current());
    }),
  ),

  http.get(
    route('/settings/meta'),
    handle(() => {
      authorize('platform.view');
      return ok(settingsMeta());
    }),
  ),

  http.patch(
    route('/settings'),
    handle(async ({ request }) => {
      const user = authorize('platform.manage');
      const raw = await readBody<Record<string, unknown>>(request);
      const body = Object.fromEntries(
        (Object.keys(FIELD_LABELS) as SettingKey[]).filter((k) => raw[k] !== undefined).map((k) => [k, normalise(k, raw[k])]),
      ) as PlatformSettingsUpdate;
      const errors = validateSettings(body, current());
      if (Object.keys(errors).length) throw invalid(errors);
      checkBillingProvider(body.billingProvider, current(), user);
      // Like both backends: switching maintenance on takes every school offline (step-up).
      if (body.maintenanceMode === true && !current().maintenanceMode) requireRecentPassword();
      // Requiring staff 2FA while the operator has none would lock them out on the next request.
      if (body.requireStaffTwoFactor === true && !current().requireStaffTwoFactor && !user.twoFactorEnabled)
        throw invalid({
          requireStaffTwoFactor:
            'Turn on two-factor authentication for your own account first (Account → Security) — requiring it now would lock you out.',
        });
      const changed = applySettings(body).filter((k) => k !== 'maintenanceMode');
      if (changed.length) recordAudit(`Updated platform settings: ${changed.map((k) => FIELD_LABELS[k]).join(', ')}`, 'Security');
      return ok(current());
    }),
  ),

  http.post(
    route('/settings/sections/:section/reset'),
    handle<SectionParams>(({ params }) => {
      authorize('platform.manage');
      const section = SETTINGS_SECTIONS.find((s) => s === params.section);
      if (!section) throw notFound('Settings section');
      const rows = META.filter(([, s, d, , resettable]) => s === section && d !== null && resettable !== false);
      const changed = applySettings(Object.fromEntries(rows.map(([key, , d]) => [key, d])));
      if (changed.length)
        recordAudit(`Restored the default ${section} settings (${changed.map((k) => FIELD_LABELS[k]).join(', ')})`, 'Security');
      return ok(current());
    }),
  ),

  http.post(
    route('/settings/brand-assets/:slot'),
    handle<SlotParams>(async ({ request, params }) => {
      authorize('platform.manage');
      const slot = BRAND_ASSET_SLOTS.find((s) => s === params.slot);
      if (!slot) throw notFound('Brand asset slot');
      const form = await request.formData().catch(() => null);
      const file = form?.get('file');
      if (!file || typeof file === 'string') throw invalid({ file: 'Choose an image to upload.' });
      // SVG is refused with the other types: it can carry script (stored XSS from the platform's origin).
      if (!BRAND_TYPES.includes(file.type))
        throw invalid({ file: 'Upload a PNG, JPEG or WebP image. SVG isn’t accepted: it can carry script.' });
      if (file.size > brandLimit(slot)) throw invalid({ file: `That image is too large (max ${slot === 'favicon' ? '512 KB' : '2 MB'}).` });
      // A real backend stores the file and returns its public URL. The mock returns a data URL for small files
      // (deterministic, survives a reload) and an in-memory object URL for larger ones.
      const url = file.size <= 256 * 1024 ? `data:${file.type};base64,${toBase64(await file.arrayBuffer())}` : URL.createObjectURL(file);
      const brandAssets = current().brandAssets.map((a) => (a.slot === slot ? { slot, url, updatedAt: new Date().toISOString() } : a));
      platformSettings.patch({ brandAssets });
      recordAudit(`Uploaded the platform ${BRAND_SLOT_LABELS[slot]}`, 'Security');
      return ok(brandAssets);
    }),
  ),

  http.delete(
    route('/settings/brand-assets/:slot'),
    handle<SlotParams>(({ params }) => {
      authorize('platform.manage');
      const slot = BRAND_ASSET_SLOTS.find((s) => s === params.slot);
      if (!slot) throw notFound('Brand asset slot');
      const before = current().brandAssets;
      if (!before.find((a) => a.slot === slot)?.url) return ok(before);
      const brandAssets = before.map((a) => (a.slot === slot ? { slot, url: null, updatedAt: null } : a));
      platformSettings.patch({ brandAssets });
      recordAudit(`Removed the platform ${BRAND_SLOT_LABELS[slot]}`, 'Security');
      return ok(brandAssets);
    }),
  ),

  http.post(
    route('/settings/email/test'),
    handle(() => {
      const user = authorize('platform.manage');
      const now = Date.now();
      const recent = (testEmailsSent.get(user.id) ?? []).filter((at) => now - at < 10 * 60_000);
      if (recent.length >= 5) throw new HttpError(429, 'Too many test emails. Try again in a few minutes.');
      testEmailsSent.set(user.id, [...recent, now]);
      recordAudit(`Sent a test platform email to ${user.email}`, 'Security');
      return ok<EmailTestResult>({ sentTo: user.email }, 202);
    }),
  ),

  // ---------- Integrations ----------
  http.get(
    route('/settings/integrations'),
    handle(() => {
      authorize('platform.view');
      return ok(integrations());
    }),
  ),

  http.post(
    route('/settings/integrations/requests/:id/roadmap'),
    handle<IdParams>(({ params }) => {
      authorize('platform.manage');
      const req = requests.find(params.id);
      if (!req) throw notFound('Integration request');
      if (!req.onRoadmap) {
        requests.update(req.id, { onRoadmap: true });
        recordAudit(`Added "${req.name}" to the integration roadmap`, 'Security');
      }
      return ok(integrations());
    }),
  ),

  // ---------- Tax & invoicing ----------
  http.get(
    route('/settings/tax'),
    handle(() => {
      authorize('platform.view');
      return ok(taxSettings());
    }),
  ),

  http.patch(
    route('/settings/tax'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<TaxSettingsUpdate>(request);
      const errors: Record<string, string> = {};
      if (body.invoicePrefix !== undefined && (typeof body.invoicePrefix !== 'string' || !/^[A-Z0-9-]{1,8}$/.test(body.invoicePrefix)))
        errors.invoicePrefix = 'Use 1–8 capital letters, digits or dashes.';
      if (body.nextInvoiceNumber !== undefined) {
        if (!isInt(body.nextInvoiceNumber, 1, 999_999)) errors.nextInvoiceNumber = 'Enter a whole number up to 999999.';
        else if (body.nextInvoiceNumber <= LAST_ISSUED_INVOICE)
          errors.nextInvoiceNumber = `Numbering is sequential and gap-free — the next number must be at least ${LAST_ISSUED_INVOICE + 1}.`;
      }
      if (body.stripeTax !== undefined && typeof body.stripeTax !== 'boolean') errors.stripeTax = 'Must be on or off.';
      if (body.taxInclusive !== undefined && typeof body.taxInclusive !== 'boolean') errors.taxInclusive = 'Must be on or off.';
      if (Object.keys(errors).length) throw invalid(errors);
      const prev = tax.get();
      const next = tax.patch({
        ...(body.stripeTax !== undefined ? { stripeTax: body.stripeTax } : {}),
        ...(body.taxInclusive !== undefined ? { taxInclusive: body.taxInclusive } : {}),
        ...(body.invoicePrefix !== undefined ? { invoicePrefix: body.invoicePrefix } : {}),
        ...(body.nextInvoiceNumber !== undefined ? { nextInvoiceNumber: body.nextInvoiceNumber } : {}),
      });
      const changed: string[] = [];
      if (prev.stripeTax !== next.stripeTax) changed.push(next.stripeTax ? 'Stripe Tax on' : 'Stripe Tax off');
      if (prev.taxInclusive !== next.taxInclusive)
        changed.push(next.taxInclusive ? 'tax-inclusive pricing on' : 'tax-inclusive pricing off');
      if (prev.invoicePrefix !== next.invoicePrefix || prev.nextInvoiceNumber !== next.nextInvoiceNumber)
        changed.push(`invoice numbering → ${taxSettings().nextInvoicePreview}`);
      if (changed.length) recordAudit(`Updated tax & invoicing: ${changed.join(', ')}`, 'Billing');
      return ok(taxSettings());
    }),
  ),

  http.delete(
    route('/settings/tax/regions/:id'),
    handle<IdParams>(({ params }) => {
      authorize('platform.manage');
      const region = regions.find(params.id);
      if (!region) throw notFound('Tax region');
      regions.remove(region.id);
      recordAudit(`Removed tax registration for ${region.region} — checkout stops collecting ${region.kind}`, 'Billing');
      return noContent();
    }),
  ),
];

/** Exposed for tests. */
export const settingsTables = { requests, tax, regions, testEmailsSent };
