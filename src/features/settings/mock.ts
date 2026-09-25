// Mock implementation of /settings (Laravel: a settings table / spatie-settings + a FormRequest per section).
import { http } from 'msw';
import { platformSettings, tenants } from '@/mocks/collections';
import { collection, singleton } from '@/mocks/db';
import { authorize, handle, invalid, noContent, notFound, ok, readBody, recordAudit, route } from '@/mocks/http';
import { PLANS } from '@/lib/domain';
import {
  IDLE_LOCK_MINUTES,
  SESSION_HOURS,
  type IntegrationSettings,
  type PlatformSettings,
  type PlatformSettingsUpdate,
  type TaxRegion,
  type TaxSettings,
  type TaxSettingsUpdate,
} from './types';

/** Domains the platform controls DNS for (a Laravel config value / verified-domains table). */
const VERIFIED_DOMAINS = ['coursiva.io', 'coursiva.com', 'coursiva.app'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export const FIELD_LABELS: Record<keyof PlatformSettings, string> = {
  supportEmail: 'support email',
  primaryDomain: 'primary domain',
  trialDays: 'trial length',
  defaultPlan: 'default plan',
  dunningRetries: 'payment retries',
  autoSuspend: 'auto-suspend',
  requireStaffTwoFactor: 'staff 2FA requirement',
  enforceSso: 'SSO enforcement',
  sessionHours: 'session timeout',
  idleLockMinutes: 'idle lock',
  weeklyDigest: 'weekly digest',
  billingAlerts: 'billing alerts',
  incidentAlerts: 'incident alerts',
};

const isInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const BOOLEAN_FIELDS = [
  'autoSuspend',
  'requireStaffTwoFactor',
  'enforceSso',
  'weeklyDigest',
  'billingAlerts',
  'incidentAlerts',
] as const satisfies readonly (keyof PlatformSettings)[];

/** Validates a PATCH /settings body like a Laravel FormRequest (`sometimes` rules). */
function validateSettings(body: PlatformSettingsUpdate): Record<string, string> {
  const e: Record<string, string> = {};
  if (body.supportEmail !== undefined && (typeof body.supportEmail !== 'string' || !EMAIL_RE.test(body.supportEmail.trim())))
    e.supportEmail = 'The support email must be a valid email address.';
  if (body.primaryDomain !== undefined) {
    const d = typeof body.primaryDomain === 'string' ? body.primaryDomain.trim().toLowerCase() : '';
    if (!DOMAIN_RE.test(d)) e.primaryDomain = 'Enter a domain like coursiva.io.';
    else if (!VERIFIED_DOMAINS.includes(d))
      e.primaryDomain = `${d} isn’t a verified platform domain. Verify its DNS first (verified: ${VERIFIED_DOMAINS.join(', ')}).`;
  }
  if (body.trialDays !== undefined && !isInt(body.trialDays, 7, 60)) e.trialDays = 'The trial length must be between 7 and 60 days.';
  if (body.defaultPlan !== undefined && !PLANS.includes(body.defaultPlan)) e.defaultPlan = 'The selected plan is invalid.';
  if (body.dunningRetries !== undefined && !isInt(body.dunningRetries, 1, 5)) e.dunningRetries = 'Payment retries must be between 1 and 5.';
  if (body.sessionHours !== undefined && !(SESSION_HOURS as readonly number[]).includes(body.sessionHours))
    e.sessionHours = 'Choose a session timeout of 4, 8, 12 or 24 hours.';
  if (body.idleLockMinutes !== undefined && !(IDLE_LOCK_MINUTES as readonly number[]).includes(body.idleLockMinutes))
    e.idleLockMinutes = 'Choose an idle lock of 5, 10, 15, 30 or 60 minutes.';
  for (const k of BOOLEAN_FIELDS) if (body[k] !== undefined && typeof body[k] !== 'boolean') e[k] = 'Must be on or off.';
  return e;
}

// ---------- Integration marketplace ----------
const policies = collection<IntegrationSettings['policies'][number] & { id: string }>('settingsIntegrationPolicies', () => [
  {
    id: 'byo_processor',
    key: 'byo_processor',
    label: 'Let tenants use their own processor',
    description: 'Paddle and Razorpay collect as merchant of record — your revenue share is invoiced separately, not deducted at checkout.',
    enabled: false,
  },
  {
    id: 'hris_scale_only',
    key: 'hris_scale_only',
    label: 'HRIS & SAML on Scale only',
    description: 'Okta, BambooHR and Workday stay gated to the enterprise plan.',
    enabled: true,
  },
  {
    id: 'proctoring',
    key: 'proctoring',
    label: 'Allow proctoring apps',
    description: 'Proctorio records exam sessions — some regions need explicit learner consent.',
    enabled: true,
  },
  {
    id: 'self_hosted',
    key: 'self_hosted',
    label: 'Allow self-hosted endpoints',
    description: 'n8n and custom LRS URLs point at tenant infrastructure — outbound only.',
    enabled: true,
  },
]);

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
    policies: policies.all().map(({ id: _id, ...p }) => p),
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

type KeyParams = { key: string };
type IdParams = { id: string };

export const handlers = [
  http.get(
    route('/settings'),
    handle(() => {
      authorize('platform.view');
      return ok(platformSettings.get());
    }),
  ),

  http.patch(
    route('/settings'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<PlatformSettingsUpdate>(request);
      const errors = validateSettings(body);
      if (Object.keys(errors).length) throw invalid(errors);
      const prev = platformSettings.get();
      const patch: Partial<PlatformSettings> = {};
      for (const key of Object.keys(FIELD_LABELS) as (keyof PlatformSettings)[]) {
        if (body[key] === undefined) continue;
        const value = key === 'supportEmail' || key === 'primaryDomain' ? body[key].trim().toLowerCase() : body[key];
        if (value !== prev[key]) Object.assign(patch, { [key]: value });
      }
      const next = platformSettings.patch(patch);
      const changed = Object.keys(patch) as (keyof PlatformSettings)[];
      if (changed.length) recordAudit(`Updated platform settings: ${changed.map((k) => FIELD_LABELS[k]).join(', ')}`, 'Security');
      return ok(next);
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

  http.put(
    route('/settings/integrations/policies/:key'),
    handle<KeyParams>(async ({ request, params }) => {
      authorize('platform.manage');
      const policy = policies.find(params.key);
      if (!policy) throw notFound('Integration policy');
      const { enabled } = await readBody<{ enabled: boolean }>(request);
      if (typeof enabled !== 'boolean') throw invalid({ enabled: 'Must be on or off.' });
      if (policy.enabled !== enabled) {
        policies.update(policy.id, { enabled });
        recordAudit(`${enabled ? 'Enabled' : 'Disabled'} integration policy "${policy.label}"`, 'Security');
      }
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
export const settingsTables = { policies, requests, tax, regions };
