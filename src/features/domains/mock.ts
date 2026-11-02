// Mock implementation of /domains (what the backend's domain registrar module does for the console).
// Contract: docs/api/domains.md. Registrar credentials are the platform connection `cloudflare_registrar`.
import { connectionStore } from '@/features/platform/mock';
import { tenants } from '@/mocks/collections';
import { ago, collection, fromNow, singleton } from '@/mocks/db';
import {
  authorize,
  handle,
  http,
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
import { resalePrice } from './pricing';
import {
  DOMAIN_ORDER_KINDS,
  DOMAIN_ORDER_STATUSES,
  DOMAIN_ROUNDINGS,
  REGISTRAR_KEYS,
  REGISTRAR_TASK_KINDS,
  REGISTRATION_STATUSES,
  TERM_KEYS,
  type CancelTaskInput,
  type CustomDomainLink,
  type DomainEnvironment,
  type TaskDetail,
  type TaskDetailKey,
  type CompleteTaskInput,
  type DomainOrderRow,
  type DomainSettings,
  type DomainSettingsUpdate,
  type RegistrantContact,
  type RegistrarCapabilities,
  type RegistrarKey,
  type RegistrarTask,
  type RegistrarTaskKind,
  type RegistrationDetail,
  type RegistrationRow,
  type RegistrationStatus,
} from './types';

const DAY = 86_400_000;
export const DEFAULT_TLDS = ['com', 'net', 'org', 'co', 'io', 'academy', 'school', 'courses', 'education', 'online', 'dev', 'app'];
const TLD_PATTERN = /^[a-z0-9-]{2,24}(\.[a-z0-9-]{2,24})?$/;
const MAX_TLDS = 50;
const MAX_NOTE = 500;

const REGISTRARS: { key: RegistrarKey; name: string; capabilities: RegistrarCapabilities }[] = [
  {
    key: 'cloudflare',
    name: 'Cloudflare Registrar',
    // Cloudflare's API can't renew, hand out transfer codes or change contacts yet: those become tasks.
    capabilities: { renew: false, autoRenewToggle: true, transferOut: false, contactUpdate: false, dns: true },
  },
  {
    key: 'fake',
    name: 'Test registrar (fake)',
    capabilities: { renew: true, autoRenewToggle: true, transferOut: true, contactUpdate: true, dns: true },
  },
];

/** What staff do in Cloudflare's dashboard, per task kind. */
const INSTRUCTIONS: Record<RegistrarTaskKind, string> = {
  transfer_out:
    'Unlock the domain in the Cloudflare dashboard (Domain Registration → Manage → Configuration), copy the auth code and paste it here. We email it to the school’s owners and never store it.',
  contact_update:
    'Update the registrant contact in the Cloudflare dashboard (Domain Registration → Manage → Contacts) to match the registration’s registrant, then complete.',
  disable_auto_renew: 'Turn auto-renew off for the domain in the Cloudflare dashboard (Domain Registration → Manage), then complete.',
  renew:
    'Renew the domain for one year in the Cloudflare dashboard (Domain Registration → Manage → Renew), then complete with the new expiry date if it shows.',
  registration_review:
    'Resolve the pending registration in the Cloudflare dashboard (Domain Registration → Manage), then complete so the order resumes. Cancelling refunds the school.',
};

// ---------- Tables ----------
interface RegistrationRowDb {
  id: string;
  tenantId: string;
  domain: string;
  provider: RegistrarKey;
  environment: DomainEnvironment;
  providerRef: string | null;
  status: RegistrationStatus;
  registeredAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  providerAutoRenew: boolean | null;
  renewalPrice: number | null;
  renewalCost: number | null;
  customDomain: CustomDomainLink | null;
  contactPending: boolean;
  privacy: boolean;
  transferLockedUntil: string | null;
  failureReason: string | null;
  lastReminder: 30 | 7 | 1 | null;
  registrant: RegistrantContact | null;
  createdAt: string;
}

interface OrderRowDb {
  id: string;
  tenantId: string;
  domain: string;
  kind: DomainOrderRow['kind'];
  environment?: DomainEnvironment;
  status: DomainOrderRow['status'];
  cost: number;
  price: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  registrationId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskRowDb {
  id: string;
  kind: RegistrarTaskKind;
  status: RegistrarTask['status'];
  registrationId: string;
  details: TaskDetail[];
  resolutionNote: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

const contact = (name: string, email: string, city: string, country: string, organization: string | null = null): RegistrantContact => ({
  name,
  organization,
  email,
  phone: '+44.2071234567',
  street: '12 Example Street',
  city,
  state: null,
  postalCode: 'EC1A 1BB',
  country,
});

function reg(
  id: string,
  tenantId: string,
  domain: string,
  status: RegistrationStatus,
  o: Partial<RegistrationRowDb> & { registeredDaysAgo?: number; expiresInDays?: number | null } = {},
): RegistrationRowDb {
  const { registeredDaysAgo = 300, expiresInDays = 65, ...rest } = o;
  const registered = status === 'registering' || status === 'failed' ? null : ago({ d: registeredDaysAgo });
  return {
    id,
    tenantId,
    domain,
    provider: 'cloudflare',
    environment: 'live',
    providerRef: registered ? domain : null,
    status,
    registeredAt: registered,
    expiresAt: registered && expiresInDays != null ? fromNow({ d: expiresInDays }) : null,
    autoRenew: true,
    providerAutoRenew: registered ? true : null,
    renewalPrice: 13.99,
    renewalCost: 10.44,
    customDomain:
      status === 'active' || status === 'expiring' ? { id: `dom_${id.slice(5)}`, domain, status: 'verified', isPrimary: true } : null,
    contactPending: false,
    privacy: true,
    transferLockedUntil: registered ? new Date(new Date(registered).getTime() + 60 * DAY).toISOString() : null,
    failureReason: null,
    lastReminder: null,
    registrant: contact('Owner Contact', 'owner@example.com', 'London', 'GB'),
    createdAt: registered ?? ago({ h: 6 }),
    ...rest,
  };
}

export const registrations = collection<RegistrationRowDb>('domainRegistrations', () => [
  reg('dreg_amplify', 'tn_amplify', 'amplifycoaching.academy', 'active', {
    expiresInDays: 200,
    contactPending: true,
    renewalPrice: 39.99,
    renewalCost: 29.18,
    registrant: contact('Maya Reyes', 'maya.reyes@amplifycoaching.com', 'Lisbon', 'PT', 'Amplify Coaching Lda'),
  }),
  reg('dreg_amplify_net', 'tn_amplify', 'amplify-coaching.net', 'active', {
    provider: 'fake',
    providerRef: 'fake-4412',
    registeredDaysAgo: 30,
    expiresInDays: 335,
    customDomain: null,
    renewalPrice: 15.99,
    renewalCost: 11.84,
    registrant: contact('Maya Reyes', 'maya.reyes@amplifycoaching.com', 'Porto', 'PT', 'Amplify Coaching Lda'),
  }),
  reg('dreg_nordic', 'tn_nordic', 'nordicyoga.school', 'active', {
    expiresInDays: 20,
    customDomain: { id: 'dom_nordic', domain: 'nordicyoga.school', status: 'pending', isPrimary: false },
    renewalPrice: 33.99,
    renewalCost: 26.5,
    lastReminder: 30,
    registrant: contact('Freja Lind', 'freja.lind@nordicyoga.se', 'Stockholm', 'SE'),
  }),
  reg('dreg_devpath', 'tn_devpath', 'devpath.dev', 'transfer_requested', {
    registeredDaysAgo: 400,
    expiresInDays: 330,
    renewalPrice: 15.99,
    renewalCost: 12.18,
    registrant: contact('Rahul Mehta', 'rahul.mehta@devpath.io', 'Austin', 'US'),
  }),
  reg('dreg_silva', 'tn_silva', 'silvaculinary.online', 'expiring', {
    expiresInDays: 4,
    autoRenew: false,
    providerAutoRenew: true,
    renewalPrice: 32.99,
    renewalCost: 25.03,
    lastReminder: 7,
    registrant: contact('João Silva', 'joao.silva@silvaculinary.com', 'Porto', 'PT'),
  }),
  reg('dreg_northstar', 'tn_northstar', 'northstarsales.co', 'grace', {
    registeredDaysAgo: 370,
    expiresInDays: -5,
    customDomain: { id: 'dom_northstar', domain: 'northstarsales.co', status: 'verified', isPrimary: false },
    renewalPrice: 26.99,
    renewalCost: 20.5,
    lastReminder: 1,
    registrant: contact('Chris Doyle', 'chris.doyle@northstar.co', 'Denver', 'US'),
  }),
  reg('dreg_atlas', 'tn_atlas', 'atlaslang.io', 'registering', {
    renewalPrice: 49.99,
    renewalCost: 38.25,
    registrant: contact('Marta Ruiz', 'marta.ruiz@atlaslang.com', 'Madrid', 'ES'),
  }),
  reg('dreg_peak', 'tn_peak', 'peakfitcert.com', 'expired', {
    registeredDaysAgo: 420,
    expiresInDays: -40,
    autoRenew: false,
    providerAutoRenew: false,
    customDomain: null,
    renewalPrice: 13.99,
    renewalCost: 10.44,
    lastReminder: 1,
    // Erased by a privacy request: the stored copy is redacted (the registry keeps its own).
    registrant: null,
  }),
  reg('dreg_kodo', 'tn_kodo', 'kodo-design.courses', 'failed', {
    expiresInDays: null,
    failureReason: 'The registrar kept the registration pending for 24 hours; cancelled by staff and refunded.',
    renewalPrice: null,
    renewalCost: null,
    registrant: contact('Yuki Mori', 'yuki.mori@kodo.coursiva.io', 'Osaka', 'JP'),
    createdAt: ago({ d: 3 }),
  }),
  reg('dreg_bloom', 'tn_bloom', 'bloomfloristry.net', 'transferred_out', {
    registeredDaysAgo: 500,
    expiresInDays: 230,
    autoRenew: false,
    providerAutoRenew: false,
    customDomain: null,
    registrant: contact('Elif Kaya', 'elif.kaya@bloom.coursiva.io', 'Istanbul', 'TR'),
  }),
]);

function order(
  id: string,
  tenantId: string,
  domain: string,
  kind: OrderRowDb['kind'],
  status: OrderRowDb['status'],
  cost: number,
  price: number,
  daysAgo: number,
  o: Partial<OrderRowDb> = {},
): OrderRowDb {
  const created = ago({ d: daysAgo });
  const invoiced = status !== 'quoted';
  return {
    id,
    tenantId,
    domain,
    kind,
    status,
    cost,
    price,
    invoiceId: invoiced ? `inv_d${id.slice(5)}` : null,
    invoiceNumber: invoiced ? `INV-D${id.slice(5).toUpperCase()}` : null,
    registrationId: null,
    failureReason: null,
    createdAt: created,
    updatedAt: created,
    ...o,
  };
}

export const orders = collection<OrderRowDb>('domainOrders', () => [
  order('dord_amp1', 'tn_amplify', 'amplifycoaching.academy', 'registration', 'completed', 29.18, 39.99, 300, {
    registrationId: 'dreg_amplify',
  }),
  order('dord_amp2', 'tn_amplify', 'amplify-coaching.net', 'registration', 'completed', 11.84, 15.99, 30, {
    registrationId: 'dreg_amplify_net',
  }),
  order('dord_nor1', 'tn_nordic', 'nordicyoga.school', 'registration', 'completed', 26.5, 33.99, 300, { registrationId: 'dreg_nordic' }),
  order('dord_nor2', 'tn_nordic', 'nordicyoga.school', 'renewal', 'charging', 26.5, 33.99, 0, { registrationId: 'dreg_nordic' }),
  order('dord_dev1', 'tn_devpath', 'devpath.dev', 'registration', 'completed', 12.18, 15.99, 400, { registrationId: 'dreg_devpath' }),
  order('dord_sil1', 'tn_silva', 'silvaculinary.online', 'registration', 'completed', 25.03, 32.99, 300, { registrationId: 'dreg_silva' }),
  order('dord_sil2', 'tn_silva', 'silvaculinary.online', 'renewal', 'failed', 25.03, 32.99, 25, {
    registrationId: 'dreg_silva',
    failureReason: 'The card was declined (insufficient funds) after 3 retries.',
  }),
  order('dord_nst1', 'tn_northstar', 'northstarsales.co', 'registration', 'completed', 20.5, 26.99, 370, {
    registrationId: 'dreg_northstar',
  }),
  order('dord_nst2', 'tn_northstar', 'northstarsales.co', 'renewal', 'paid', 20.5, 26.99, 1, { registrationId: 'dreg_northstar' }),
  order('dord_atl1', 'tn_atlas', 'atlaslang.io', 'registration', 'registering', 38.25, 49.99, 1, { registrationId: 'dreg_atlas' }),
  order('dord_pk1', 'tn_peak', 'peakfitcert.com', 'registration', 'completed', 10.44, 13.99, 420, { registrationId: 'dreg_peak' }),
  order('dord_kod1', 'tn_kodo', 'kodo-design.courses', 'registration', 'refunded', 31.2, 40.99, 3, {
    registrationId: 'dreg_kodo',
    failureReason: 'Registration cancelled by staff after review — refunded to the card.',
  }),
  order('dord_blm1', 'tn_bloom', 'bloomfloristry.net', 'registration', 'completed', 10.44, 13.99, 500, { registrationId: 'dreg_bloom' }),
  order('dord_blm2', 'tn_bloom', 'bloomfloristry.org', 'registration', 'credited', 10.44, 13.99, 60, {
    failureReason:
      'The registrar refused the registration (domain no longer available); the card refund failed, so the account was credited.',
  }),
  order('dord_led1', 'tn_ledger', 'ledgerfinance.academy', 'registration', 'quoted', 29.18, 39.99, 0),
]);

const DETAIL_LABELS: Record<TaskDetailKey, TaskDetail['label']> = {
  reason: 'Reason',
  detail: 'Details',
  requested_at: 'Requested',
  expires_at: 'Expires',
  order_id: 'Order',
};
const KEY_ORDER: readonly TaskDetailKey[] = ['reason', 'detail', 'requested_at', 'expires_at', 'order_id'];
/** Task details in the contract's key order, only keys with a value. */
const details = (values: Partial<Record<TaskDetailKey, string>>): TaskDetail[] =>
  KEY_ORDER.filter((k) => values[k]).map((k) => ({ key: k, label: DETAIL_LABELS[k], value: values[k]! }));

function task(id: string, kind: RegistrarTaskKind, registrationId: string, o: Partial<TaskRowDb> & { hoursAgo?: number } = {}): TaskRowDb {
  const { hoursAgo = 4, ...rest } = o;
  return {
    id,
    kind,
    status: 'open',
    registrationId,
    details: [],
    resolutionNote: null,
    completedBy: null,
    completedAt: null,
    createdAt: ago({ h: hoursAgo }),
    ...rest,
  };
}

export const tasks = collection<TaskRowDb>('registrarTasks', () => [
  task('rgt_transfer', 'transfer_out', 'dreg_devpath', { hoursAgo: 30, details: details({ requested_at: ago({ h: 30 }) }) }),
  task('rgt_review', 'registration_review', 'dreg_atlas', {
    hoursAgo: 26,
    details: details({
      reason: 'The registration stayed pending for 24 hours',
      detail: 'Cloudflare reports the registration as pending (registry review).',
      order_id: 'dord_atl1',
    }),
  }),
  task('rgt_renew', 'renew', 'dreg_northstar', {
    hoursAgo: 20,
    details: details({ reason: 'Renewal in the grace period (paid)', expires_at: ago({ d: 5 }), order_id: 'dord_nst2' }),
  }),
  task('rgt_autorenew', 'disable_auto_renew', 'dreg_silva', { hoursAgo: 8 }),
  task('rgt_contact', 'contact_update', 'dreg_amplify', { hoursAgo: 2, details: details({ requested_at: ago({ h: 2 }) }) }),
  task('rgt_done', 'transfer_out', 'dreg_bloom', {
    hoursAgo: 24 * 12,
    details: details({ requested_at: ago({ d: 12 }) }),
    status: 'done',
    resolutionNote: 'Code sent; the gaining registrar confirmed the transfer.',
    completedBy: 'Priya Nair',
    completedAt: ago({ d: 11 }),
  }),
  task('rgt_cancelled', 'registration_review', 'dreg_kodo', {
    hoursAgo: 72,
    status: 'cancelled',
    details: details({ reason: 'The registration stayed pending for 24 hours', order_id: 'dord_kod1' }),
    resolutionNote: 'Registry rejected the name; refunded the school.',
    completedBy: 'Sam Carter',
    completedAt: ago({ d: 2 }),
  }),
]);

type StoredSettings = Pick<
  DomainSettings,
  | 'registrar'
  | 'markupPercent'
  | 'markupMin'
  | 'rounding'
  | 'enabledTlds'
  | 'renewalLeadDays'
  | 'registrationAgreementUrl'
  | 'registrantBenefitsUrl'
  | 'registrantEducationUrl'
>;

export const ICANN_BENEFITS_URL = 'https://www.icann.org/resources/pages/benefits-2013-09-16-en';
export const ICANN_EDUCATION_URL = 'https://www.icann.org/resources/pages/educational-2012-02-25-en';
/** Each registrar's own registration agreement (used while `registration_agreement_url` is null). */
const REGISTRAR_AGREEMENT: Record<RegistrarKey, string> = {
  cloudflare: 'https://www.cloudflare.com/domain-registration-agreement/',
  fake: 'https://example.com/test-registrar/agreement',
};
const TERM_LABELS = {
  registration_agreement: 'Registration agreement',
  registrant_benefits: 'Registrant benefits and responsibilities',
  registrant_education: 'Registrant educational information',
} as const;

export const domainSettings = singleton<StoredSettings>('domainSettings', () => ({
  registrar: 'cloudflare',
  markupPercent: 20,
  markupMin: 3,
  rounding: 'x99',
  enabledTlds: [...DEFAULT_TLDS],
  renewalLeadDays: 30,
  registrationAgreementUrl: null,
  registrantBenefitsUrl: ICANN_BENEFITS_URL,
  registrantEducationUrl: ICANN_EDUCATION_URL,
}));

// ---------- Resources ----------
const tenantName = (id: string) => tenants.find(id)?.name ?? 'Unknown tenant';
const daysUntil = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / DAY) : null);
const openTaskCount = (registrationId: string) => tasks.where((t) => t.registrationId === registrationId && t.status === 'open').length;

/** Cloudflare counts as configured when its connection is saved (the env fallback is the backend's). */
const configured = (key: RegistrarKey) =>
  key === 'fake' || connectionStore.get().credentials.some((c) => c.connection === 'cloudflare_registrar');

/** Cloudflare's environment is its connection's `mode` (blank = sandbox); the fake registrar is live. */
const environmentOf = (key: RegistrarKey): DomainEnvironment => {
  if (key === 'fake') return 'live';
  const mode = connectionStore.get().credentials.find((c) => c.connection === 'cloudflare_registrar')?.values.mode;
  return mode === 'live' ? 'live' : 'sandbox';
};

export const SANDBOX_WARNING =
  'The registrar is in sandbox mode: purchases are test registrations, not real domains, and are never connected or renewed. Switch the Cloudflare Registrar connection to live before selling domains.';

function toSettings(): DomainSettings {
  const s = domainSettings.get();
  return {
    ...s,
    registrars: REGISTRARS.map((r) => ({ ...r, configured: configured(r.key), environment: environmentOf(r.key) })),
    environment: environmentOf(s.registrar),
    warnings: environmentOf(s.registrar) === 'sandbox' ? [SANDBOX_WARNING] : [],
    terms: TERM_KEYS.map((key) => ({
      key,
      label: TERM_LABELS[key],
      url:
        key === 'registration_agreement'
          ? (s.registrationAgreementUrl ?? REGISTRAR_AGREEMENT[s.registrar])
          : key === 'registrant_benefits'
            ? s.registrantBenefitsUrl
            : s.registrantEducationUrl,
    })),
    currency: 'USD',
    example: { cost: 10, price: resalePrice(10, s.markupPercent, s.markupMin, s.rounding) },
  };
}

function toRow(r: RegistrationRowDb): RegistrationRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    tenantName: tenantName(r.tenantId),
    domain: r.domain,
    provider: r.provider,
    environment: r.environment,
    status: r.status,
    registeredAt: r.registeredAt,
    expiresAt: r.expiresAt,
    daysUntilExpiry: daysUntil(r.expiresAt),
    autoRenew: r.autoRenew,
    providerAutoRenew: r.providerAutoRenew,
    renewalPrice: r.renewalPrice,
    renewalCost: r.renewalCost,
    currency: 'USD',
    openTasks: openTaskCount(r.id),
    connected: r.customDomain !== null,
    customDomain: r.customDomain,
    contactPending: r.contactPending,
    createdAt: r.createdAt,
  };
}

const toOrder = (o: OrderRowDb): DomainOrderRow => ({
  ...o,
  environment: o.environment ?? 'live',
  tenantName: tenantName(o.tenantId),
  currency: 'USD',
});

function toTask(t: TaskRowDb): RegistrarTask {
  const r = registrations.find(t.registrationId);
  return {
    ...t,
    domain: r?.domain ?? '',
    tenantId: r?.tenantId ?? '',
    tenantName: tenantName(r?.tenantId ?? ''),
    provider: r?.provider ?? 'cloudflare',
    instructions: INSTRUCTIONS[t.kind],
  };
}

const byNewest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);

function toDetail(r: RegistrationRowDb): RegistrationDetail {
  return {
    ...toRow(r),
    providerRef: r.providerRef,
    privacy: r.privacy,
    transferLockedUntil: r.transferLockedUntil,
    failureReason: r.failureReason,
    lastReminder: r.lastReminder,
    registrant: r.registrant,
    orders: orders
      .where((o) => o.registrationId === r.id)
      .sort(byNewest)
      .map(toOrder),
    tasks: tasks
      .where((t) => t.registrationId === r.id)
      .sort(byNewest)
      .map(toTask),
  };
}

function findTask(taskId: string | readonly string[] | undefined) {
  const t = typeof taskId === 'string' ? tasks.find(taskId) : undefined;
  if (!t) throw notFound('Task');
  return t;
}

function assertOpen(t: TaskRowDb) {
  if (t.status !== 'open') throw new HttpError(409, 'This task is already closed.', undefined, 'conflict', { reason: 'task_closed' });
}

const note = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > MAX_NOTE) throw invalid({ note: `The note is at most ${MAX_NOTE} characters.` });
  return text || null;
};

/** The order a task resumes or settles (named in its payload, else the registration's latest open one). */
function taskOrder(t: TaskRowDb) {
  const orderId = t.details.find((d) => d.key === 'order_id')?.value;
  const named = orderId ? orders.find(orderId) : undefined;
  return (
    named ??
    orders.where((o) => o.registrationId === t.registrationId && !['completed', 'failed', 'refunded', 'credited'].includes(o.status))[0]
  );
}

const SETTINGS_FIELDS: Record<keyof DomainSettingsUpdate, string> = {
  registrar: 'registrar',
  markupPercent: 'markup_percent',
  markupMin: 'markup_min',
  rounding: 'rounding',
  enabledTlds: 'enabled_tlds',
  renewalLeadDays: 'renewal_lead_days',
  registrationAgreementUrl: 'registration_agreement_url',
  registrantBenefitsUrl: 'registrant_benefits_url',
  registrantEducationUrl: 'registrant_education_url',
};

/** Up to 2 decimals. */
const twoDecimals = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

/** null/'' → default; else an https:// link ≤ 500 characters (undefined = invalid). */
function termUrl(v: unknown, fallback: string | null): string | null | undefined {
  if (v === null || v === '') return fallback;
  if (typeof v !== 'string') return undefined;
  const url = v.trim();
  if (url.length > 500 || !/^https:\/\/[^\s/$.?#][^\s]*$/i.test(url)) return undefined;
  return url;
}

/** The filters every list shares: page, per_page, tenant_id, search (422 for unknown values). */
function listFilters(request: Request) {
  const q = query(request);
  const errors: Record<string, string> = {};
  const page = q.get('page');
  const perPage = q.get('per_page');
  const tenantId = q.get('tenant_id');
  const search = q.get('search') ?? '';
  if (page != null && !(/^\d+$/.test(page) && Number(page) >= 1)) errors.page = 'The page must be 1 or more.';
  if (perPage != null && !(/^\d+$/.test(perPage) && Number(perPage) >= 1 && Number(perPage) <= 100)) errors.perPage = 'Per page is 1–100.';
  if (tenantId && tenantId.length > 40) errors.tenantId = 'Unknown tenant filter.';
  if (search.length > 253) errors.search = 'The search is at most 253 characters.';
  return { q, errors, tenantId };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

type Params = { id: string };

export const handlers = [
  http.get(
    route('/domains/settings'),
    handle(() => {
      authorize('tenants.view');
      return ok(toSettings());
    }),
  ),

  http.put(
    route('/domains/settings'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      requireRecentPassword();
      const body = await readBody<DomainSettingsUpdate>(request);
      const errors: Record<string, string> = {};
      const next = { ...domainSettings.get() };
      if (body.registrar !== undefined) {
        const known = REGISTRAR_KEYS.includes(body.registrar);
        if (!known) errors.registrar = 'Choose Cloudflare Registrar.';
        else if (!configured(body.registrar)) errors.registrar = 'Connect this registrar first.';
        else next.registrar = body.registrar;
      }
      if (body.markupPercent !== undefined) {
        if (!isNum(body.markupPercent) || body.markupPercent < 0 || body.markupPercent > 200 || !twoDecimals(body.markupPercent))
          errors.markupPercent = 'The markup is 0–200%, with up to 2 decimals.';
        else next.markupPercent = body.markupPercent;
      }
      if (body.markupMin !== undefined) {
        if (!isNum(body.markupMin) || body.markupMin < 0 || body.markupMin > 100 || !twoDecimals(body.markupMin))
          errors.markupMin = 'The minimum margin is 0–100, with up to 2 decimals.';
        else next.markupMin = Math.round(body.markupMin * 100) / 100;
      }
      if (body.rounding !== undefined) {
        if (!DOMAIN_ROUNDINGS.includes(body.rounding)) errors.rounding = 'Choose x99 or none.';
        else next.rounding = body.rounding;
      }
      if (body.enabledTlds !== undefined) {
        const list: unknown[] = Array.isArray(body.enabledTlds) ? body.enabledTlds : [];
        if (!list.length) errors.enabledTlds = 'Enable at least one extension.';
        else if (list.length > MAX_TLDS) errors.enabledTlds = `Enable at most ${MAX_TLDS} extensions.`;
        else {
          const cleaned = list.map((v) => (typeof v === 'string' ? v.trim().replace(/^\./, '').toLowerCase() : ''));
          cleaned.forEach((v, i) => {
            if (!TLD_PATTERN.test(v)) errors[`enabledTlds.${i}`] = 'Enter extensions like com or co.uk.';
            else if (cleaned.indexOf(v) !== i) errors[`enabledTlds.${i}`] = 'Each extension once.';
          });
          if (!Object.keys(errors).some((k) => k.startsWith('enabledTlds.'))) next.enabledTlds = cleaned;
        }
      }
      if (body.renewalLeadDays !== undefined) {
        const d = body.renewalLeadDays;
        if (!isNum(d) || !Number.isInteger(d) || d < 7 || d > 60) errors.renewalLeadDays = 'Renewals are charged 7–60 days before expiry.';
        else next.renewalLeadDays = d;
      }
      if (body.registrationAgreementUrl !== undefined) {
        const url = termUrl(body.registrationAgreementUrl, null);
        if (url === undefined)
          errors.registrationAgreementUrl = 'Enter an https:// link, or leave it empty for the registrar’s own agreement.';
        else next.registrationAgreementUrl = url;
      }
      for (const [field, fallback] of [
        ['registrantBenefitsUrl', ICANN_BENEFITS_URL],
        ['registrantEducationUrl', ICANN_EDUCATION_URL],
      ] as const) {
        if (body[field] === undefined) continue;
        const url = termUrl(body[field], fallback);
        if (url === undefined || url === null) errors[field] = 'Enter an https:// link, or leave it empty for ICANN’s page.';
        else next[field] = url;
      }
      if (Object.keys(errors).length) throw invalid(errors);

      const before = domainSettings.get();
      const changed = (Object.keys(SETTINGS_FIELDS) as (keyof DomainSettingsUpdate)[]).filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]),
      );
      domainSettings.set(next);
      if (changed.length) recordAudit(`Changed domain settings (${changed.map((k) => SETTINGS_FIELDS[k]).join(', ')})`, 'Billing');
      return ok(toSettings());
    }),
  ),

  http.get(
    route('/domains/registrations'),
    handle(({ request }) => {
      authorize('tenants.view');
      const { q, errors, tenantId } = listFilters(request);
      const status = q.get('status');
      const within = q.get('expiring_within_days');
      if (status && !(REGISTRATION_STATUSES as readonly string[]).includes(status)) errors.status = 'Unknown status filter.';
      const days = within != null ? Number(within) : null;
      if (days != null && (!Number.isInteger(days) || days < 1 || days > 365)) errors.expiringWithinDays = 'Expiring within is 1–365 days.';
      if (Object.keys(errors).length) throw invalid(errors);

      // Every filter except status (counts show what each status chip would list).
      let rows = registrations.all();
      if (tenantId) rows = rows.filter((r) => r.tenantId === tenantId);
      if (q.search) rows = rows.filter((r) => r.domain.includes(q.search));
      if (days != null)
        rows = rows
          .filter((r) => (r.status === 'active' || r.status === 'expiring') && r.expiresAt && (daysUntil(r.expiresAt) ?? Infinity) <= days)
          .sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''));
      else rows = [...rows].sort(byNewest);
      const counts = REGISTRATION_STATUSES.map((s) => ({ status: s, count: rows.filter((r) => r.status === s).length })).filter(
        (c) => c.count > 0,
      );
      if (status) rows = rows.filter((r) => r.status === status);
      return paginate(rows.map(toRow), request, { counts });
    }),
  ),

  http.get<Params>(
    route('/domains/registrations/:id'),
    handle<Params>(({ params }) => {
      authorize('tenants.view');
      const r = registrations.find(params.id);
      if (!r) throw notFound('Registration');
      if (r.registrant) recordAudit(`Viewed the registrant contact of ${r.domain}`, 'Security', r.tenantId);
      return ok(toDetail(r));
    }),
  ),

  http.get(
    route('/domains/tasks'),
    handle(({ request }) => {
      authorize('tenants.view');
      const { q, errors, tenantId } = listFilters(request);
      const status = q.get('status') ?? 'open';
      const kind = q.get('kind');
      if (!['open', 'done', 'cancelled', 'all'].includes(status)) errors.status = 'Unknown status filter.';
      if (kind && !(REGISTRAR_TASK_KINDS as readonly string[]).includes(kind)) errors.kind = 'Unknown kind filter.';
      if (Object.keys(errors).length) throw invalid(errors);
      const all = tasks.all();
      const ofTenant = (t: TaskRowDb) => !tenantId || registrations.find(t.registrationId)?.tenantId === tenantId;
      // Open tasks per kind, respecting tenant_id only; open_total is platform-wide (the nav badge).
      const counts = REGISTRAR_TASK_KINDS.map((k) => ({
        kind: k,
        count: all.filter((t) => t.status === 'open' && t.kind === k && ofTenant(t)).length,
      }));
      const openTotal = all.filter((t) => t.status === 'open').length;
      let rows = all.filter((t) => (status === 'all' || t.status === status) && ofTenant(t));
      if (kind) rows = rows.filter((t) => t.kind === kind);
      // Oldest open first; settled ones after them, most recent first.
      const rank = (t: TaskRowDb) => (t.status === 'open' ? 0 : 1);
      rows = [...rows].sort(
        (a, b) =>
          rank(a) - rank(b) ||
          (a.status === 'open' ? a.createdAt.localeCompare(b.createdAt) : (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
      );
      return paginate(rows.map(toTask), request, { counts, openTotal });
    }),
  ),

  http.post<Params>(
    route('/domains/tasks/:id/complete'),
    handle<Params>(async ({ request, params }) => {
      const user = authorize('tenants.manage');
      requireRecentPassword();
      const t = findTask(params.id);
      assertOpen(t);
      const body = await readBody<CompleteTaskInput>(request);
      const resolution = note(body.note);
      const r = registrations.find(t.registrationId);
      if (!r) throw notFound('Registration');

      if (t.kind === 'transfer_out') {
        const code = typeof body.authCode === 'string' ? body.authCode.trim() : '';
        if (!/^[\x21-\x7E]{6,64}$/.test(code)) throw invalid({ authCode: 'Paste the transfer code from the registrar.' });
        // The code is emailed to the school's owners here — and never stored, logged or audited.
      }
      let newExpiry: string | null = null;
      if (t.kind === 'renew' && body.expiresAt != null && body.expiresAt !== '') {
        // A date: the domain expires at the end of that day (UTC).
        const raw = typeof body.expiresAt === 'string' ? body.expiresAt : '';
        const at = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T23:59:59Z`) : new Date(NaN);
        if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== raw)
          throw invalid({ expiresAt: 'Enter the new expiry date (YYYY-MM-DD).' });
        const current = r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
        if (at.getTime() <= current) throw invalid({ expiresAt: 'Enter the new expiry date.' });
        newExpiry = at.toISOString();
      }

      const now = new Date().toISOString();
      // transfer_out: the registration stays transfer_requested until the daily sync no longer finds it.
      if (t.kind === 'disable_auto_renew') registrations.update(r.id, { providerAutoRenew: false });
      if (t.kind === 'contact_update') registrations.update(r.id, { contactPending: false });
      if (t.kind === 'renew') {
        const o = taskOrder(t);
        if (o) orders.update(o.id, { status: 'completed', updatedAt: now });
        registrations.update(r.id, { status: 'active', ...(newExpiry ? { expiresAt: newExpiry } : {}) });
      }
      if (t.kind === 'registration_review') {
        // The registration is polled again; the mock's registrar answers "registered".
        const o = taskOrder(t);
        if (o) orders.update(o.id, { status: 'completed', updatedAt: now });
        registrations.update(r.id, {
          status: 'active',
          registeredAt: now,
          expiresAt: new Date(Date.now() + 365 * DAY).toISOString(),
          providerRef: r.domain,
          providerAutoRenew: true,
        });
      }
      tasks.update(t.id, { status: 'done', resolutionNote: resolution, completedBy: user.name, completedAt: now });
      recordAudit(`Completed ${t.kind} task for ${r.domain}`, 'Tenants', r.tenantId);
      return ok(toTask(t));
    }),
  ),

  http.post<Params>(
    route('/domains/tasks/:id/cancel'),
    handle<Params>(async ({ request, params }) => {
      const user = authorize('tenants.manage');
      requireRecentPassword();
      const t = findTask(params.id);
      assertOpen(t);
      const body = await readBody<CancelTaskInput>(request);
      const resolution = note(body.note);
      const r = registrations.find(t.registrationId);
      if (!r) throw notFound('Registration');
      const now = new Date().toISOString();
      if (t.kind === 'registration_review') {
        // Fails the order and refunds the school (to the card in the mock).
        const o = taskOrder(t);
        if (o)
          orders.update(o.id, {
            status: 'refunded',
            failureReason: 'Registration cancelled by staff after review — refunded to the card.',
            updatedAt: now,
          });
        registrations.update(r.id, { status: 'failed', failureReason: resolution ?? 'Registration cancelled by staff after review.' });
      }
      if (t.kind === 'renew') {
        // A paid renewal is refunded (to the card in the mock).
        const o = taskOrder(t);
        if (o && o.status === 'paid')
          orders.update(o.id, { status: 'refunded', failureReason: 'Renewal cancelled by staff — refunded to the card.', updatedAt: now });
      }
      tasks.update(t.id, { status: 'cancelled', resolutionNote: resolution, completedBy: user.name, completedAt: now });
      recordAudit(`Cancelled ${t.kind} task for ${r.domain}`, 'Tenants', r.tenantId);
      return ok(toTask(t));
    }),
  ),

  http.get(
    route('/domains/orders'),
    handle(({ request }) => {
      authorize('tenants.view');
      const { q, errors, tenantId } = listFilters(request);
      const status = q.get('status');
      const kind = q.get('kind');
      if (status && status !== 'problem' && !(DOMAIN_ORDER_STATUSES as readonly string[]).includes(status))
        errors.status = 'Unknown status filter.';
      if (kind && !(DOMAIN_ORDER_KINDS as readonly string[]).includes(kind)) errors.kind = 'Unknown kind filter.';
      if (Object.keys(errors).length) throw invalid(errors);
      let rows = orders.all();
      if (status === 'problem') rows = rows.filter((o) => ['failed', 'refunded', 'credited'].includes(o.status));
      else if (status) rows = rows.filter((o) => o.status === status);
      else rows = rows.filter((o) => o.status !== 'quoted');
      if (kind) rows = rows.filter((o) => o.kind === kind);
      if (tenantId) rows = rows.filter((o) => o.tenantId === tenantId);
      return paginate([...rows].sort(byNewest).map(toOrder), request);
    }),
  ),
];
