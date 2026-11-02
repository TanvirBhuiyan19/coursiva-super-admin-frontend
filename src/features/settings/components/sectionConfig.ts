// Layout and client-side rules of the platform-settings sections. The server (mock.ts / Laravel FormRequest) stays
// the authority — these rules only let a form answer before the round trip. Defaults and "where read" come from
// `GET /settings/meta`.
import { z } from 'zod';
import { PLANS } from '@/lib/domain';
import { t as tc } from '@/lib/i18n/common';
import { t as translate } from '../i18n';
import {
  BILLING_PROVIDERS,
  DATA_REGIONS,
  IDLE_LOCK_MINUTES,
  SESSION_HOURS,
  type PlatformSettings,
  type ReadOnlySetting,
  type SettingKey,
  type SettingMeta,
  type SettingsSection,
} from '../types';
import { isEmail, isHexColor, isHttpsUrl, isIpOrCidr, isSubdomainLabel, isTimezone, splitLines } from '../validation';

/** Sections of the screen, in nav order: the `PlatformSettings` sections plus the other cards. */
export const SCREEN_SECTIONS = [
  'platform',
  'signup',
  'branding',
  'legal',
  'email',
  'security',
  'billing',
  'tax',
  'notifications',
  'integrations',
  'maintenance',
  'appearance',
] as const;
export type ScreenSection = (typeof SCREEN_SECTIONS)[number];

export const SECTION_ICONS: Record<ScreenSection, string> = {
  platform: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  signup: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
  branding: 'M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6-6.3 4.6L7.9 13.8 2 9.4h7.6z',
  legal: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  email: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  security: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  billing: 'M2 7h20v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 7l2-4h16l2 4M2 11h20',
  tax: 'M5 2h14v20l-3.5-2-3.5 2-3.5-2L5 22zM9 7h6M9 11h6M9 15h4',
  notifications: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  integrations: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6',
  maintenance: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4z',
  appearance:
    'M12 2a10 10 0 1 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.5-1.1-.3-.3-.4-.6-.4-1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.7-10-8.7zM6.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM15 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
};

/** List settings edited as one-per-line text. (Exempt tenants use a checkbox list.) */
export const LINE_FIELDS = ['reservedSubdomains', 'socialLinks', 'consoleIpAllowlist'] as const satisfies readonly SettingKey[];
type LineKey = (typeof LINE_FIELDS)[number];
const isLineKey = (k: SettingKey): k is LineKey => (LINE_FIELDS as readonly string[]).includes(k);

/** Amounts stored in minor units (cents) on the wire but edited in dollars. */
export const MONEY_FIELDS = ['cardCheckAmount'] as const satisfies readonly SettingKey[];
const isMoneyKey = (k: SettingKey) => (MONEY_FIELDS as readonly string[]).includes(k);
/** Card check bounds in minor units (Stripe's minimum charge is 50 = $0.50). */
export const CARD_CHECK_MIN = 50;
export const CARD_CHECK_MAX = 500;

/** Form values: the settings as edited (line lists as text). */
export type FormValues = Omit<PlatformSettings, ReadOnlySetting | LineKey> & Record<LineKey, string>;

export type FieldKind =
  | 'text'
  | 'email'
  | 'url'
  | 'textarea'
  | 'lines'
  | 'number'
  /** A money amount: minor units on the wire, dollars (2 decimals) in the form. `min`/`max` are in minor units. */
  | 'money'
  | 'select'
  | 'seg'
  | 'toggle'
  | 'color'
  | 'tenants'
  /** The billing provider: a segmented control that also says which providers aren't connected yet. */
  | 'provider';
export interface FieldSpec {
  key: SettingKey;
  kind: FieldKind;
  /** number: bounds. */
  min?: number;
  max?: number;
  /** select / seg options; labels resolve at render time (current locale). */
  options?: () => readonly (readonly [string | number, string])[];
  placeholder?: string;
  /** Shown but not editable: the platform can't act on it yet (the API refuses to turn it on). */
  unavailable?: boolean;
}

export const SECTION_FIELDS: Record<SettingsSection, readonly FieldSpec[]> = {
  platform: [
    { key: 'platformName', kind: 'text' },
    { key: 'supportEmail', kind: 'email' },
    { key: 'primaryDomain', kind: 'text' },
    { key: 'helpCentreUrl', kind: 'url', placeholder: 'https://' },
    { key: 'defaultTimezone', kind: 'text', placeholder: 'Europe/London' },
  ],
  signup: [
    { key: 'publicSignup', kind: 'toggle' },
    { key: 'defaultPlan', kind: 'seg', options: () => PLANS.map((p) => [p, tc(`enums.plan.${p}`)] as const) },
    { key: 'trialDays', kind: 'number', min: 0, max: 90 },
    { key: 'trialRequiresCard', kind: 'toggle' },
    { key: 'cardCheckAmount', kind: 'money', min: CARD_CHECK_MIN, max: CARD_CHECK_MAX },
    { key: 'reservedSubdomains', kind: 'lines' },
    { key: 'minSubdomainLength', kind: 'number', min: 3, max: 20 },
  ],
  branding: [
    { key: 'defaultBrandColor', kind: 'color' },
    { key: 'defaultDataRegion', kind: 'seg', options: () => DATA_REGIONS.map((r) => [r, r] as const) },
    { key: 'footerText', kind: 'textarea' },
  ],
  legal: [
    { key: 'legalCompanyName', kind: 'text' },
    { key: 'legalAddress', kind: 'textarea' },
    { key: 'termsUrl', kind: 'url', placeholder: 'https://' },
    { key: 'privacyUrl', kind: 'url', placeholder: 'https://' },
    { key: 'socialLinks', kind: 'lines' },
  ],
  email: [
    { key: 'mailFromName', kind: 'text' },
    { key: 'mailFromAddress', kind: 'email' },
    { key: 'mailReplyTo', kind: 'email' },
    { key: 'emailFooter', kind: 'textarea' },
  ],
  security: [
    { key: 'requireStaffTwoFactor', kind: 'toggle' },
    // No staff identity provider exists yet, so enforcing SSO would lock everyone out: shown, not editable.
    { key: 'enforceSso', kind: 'toggle', unavailable: true },
    {
      key: 'sessionHours',
      kind: 'select',
      options: () => SESSION_HOURS.map((h) => [h, translate('options.hours', { count: h })] as const),
    },
    {
      key: 'idleLockMinutes',
      kind: 'select',
      options: () => IDLE_LOCK_MINUTES.map((m) => [m, translate('options.minutes', { count: m })] as const),
    },
    { key: 'consoleIpAllowlist', kind: 'lines', placeholder: '203.0.113.0/24' },
    { key: 'impersonationRequiresReason', kind: 'toggle' },
    { key: 'impersonationMaxMinutes', kind: 'number', min: 15, max: 240 },
  ],
  billing: [
    {
      key: 'billingProvider',
      kind: 'provider',
      options: () => BILLING_PROVIDERS.map((p) => [p, translate(`options.provider.${p}`)] as const),
    },
    {
      key: 'dunningRetries',
      kind: 'select',
      options: () => [1, 2, 3, 4, 5].map((n) => [n, translate('options.retries', { count: n })] as const),
    },
    { key: 'autoSuspend', kind: 'toggle' },
  ],
  notifications: [
    { key: 'weeklyDigest', kind: 'toggle' },
    { key: 'billingAlerts', kind: 'toggle' },
    { key: 'incidentAlerts', kind: 'toggle' },
  ],
  maintenance: [
    { key: 'maintenanceMode', kind: 'toggle' },
    { key: 'maintenanceMessage', kind: 'textarea' },
    { key: 'maintenanceExemptTenants', kind: 'tenants' },
  ],
};

// ---------- Client-side rules ----------
type ValidationKey = Exclude<
  Extract<Parameters<typeof translate>[0], `validation.${string}`>,
  'validation.subdomain' | 'validation.socialLink' | 'validation.ip' | 'validation.tooMany' | 'validation.maxLength'
>;
// Messages resolve when validation runs, so they follow the current locale.
const msg = (key: ValidationKey) => ({ error: () => translate(key) });
const maxLen = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: () => translate('validation.maxLength', { max }) });
const httpsOrBlank = z
  .string()
  .trim()
  .refine((v) => v === '' || isHttpsUrl(v), msg('validation.https'));
const email = (key: ValidationKey) => z.string().trim().toLowerCase().refine(isEmail, msg(key));
const int = (min: number, max: number, key: ValidationKey) =>
  z.number(msg('validation.wholeNumber')).int(msg('validation.wholeNumber')).min(min, msg(key)).max(max, msg(key));
const oneOf = (values: readonly number[]) => z.number(msg('validation.choose')).refine((v) => values.includes(v), msg('validation.choose'));
/** One entry per line: at most `max`, each passing `valid`. */
const lines = (max: number, valid: (v: string) => boolean, bad: 'validation.subdomain' | 'validation.socialLink' | 'validation.ip') =>
  z.string().superRefine((v, ctx) => {
    const items = splitLines(v);
    if (items.length > max) ctx.addIssue({ code: 'custom', message: translate('validation.tooMany', { max }) });
    const wrong = items.find((i) => !valid(i));
    if (wrong !== undefined) ctx.addIssue({ code: 'custom', message: translate(bad, { value: wrong }) });
  });

const schema = z.object({
  platformName: z.string().trim().min(2, msg('validation.platformName')).max(60, msg('validation.platformName')),
  supportEmail: email('validation.supportEmail'),
  primaryDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, msg('validation.domain')),
  helpCentreUrl: httpsOrBlank,
  defaultTimezone: z.string().trim().refine(isTimezone, msg('validation.timezone')),
  publicSignup: z.boolean(),
  defaultPlan: z.enum(PLANS),
  trialDays: int(0, 90, 'validation.trialRange'),
  trialRequiresCard: z.boolean(),
  // Dollars in the form; whole cents only.
  cardCheckAmount: z
    .number(msg('validation.cardCheckRange'))
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, msg('validation.cents'))
    .refine((v) => Math.round(v * 100) >= CARD_CHECK_MIN && Math.round(v * 100) <= CARD_CHECK_MAX, msg('validation.cardCheckRange')),
  reservedSubdomains: lines(200, (v) => isSubdomainLabel(v.toLowerCase()), 'validation.subdomain'),
  minSubdomainLength: int(3, 20, 'validation.subdomainLength'),
  defaultBrandColor: z.string().trim().refine(isHexColor, msg('validation.color')),
  defaultDataRegion: z.enum(DATA_REGIONS),
  footerText: maxLen(300),
  legalCompanyName: maxLen(160),
  legalAddress: maxLen(300),
  termsUrl: httpsOrBlank,
  privacyUrl: httpsOrBlank,
  socialLinks: lines(10, isHttpsUrl, 'validation.socialLink'),
  mailFromName: z.string().trim().min(1, msg('validation.fromName')).max(80, msg('validation.fromName')),
  mailFromAddress: email('validation.email'),
  mailReplyTo: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || isEmail(v), msg('validation.emailOrBlank')),
  emailFooter: maxLen(500),
  billingProvider: z.enum(BILLING_PROVIDERS, msg('validation.choose')),
  dunningRetries: int(1, 5, 'validation.choose'),
  autoSuspend: z.boolean(),
  requireStaffTwoFactor: z.boolean(),
  enforceSso: z.boolean(),
  sessionHours: oneOf(SESSION_HOURS),
  idleLockMinutes: oneOf(IDLE_LOCK_MINUTES),
  consoleIpAllowlist: lines(50, isIpOrCidr, 'validation.ip'),
  impersonationRequiresReason: z.boolean(),
  impersonationMaxMinutes: int(15, 240, 'validation.impersonationRange'),
  weeklyDigest: z.boolean(),
  billingAlerts: z.boolean(),
  incidentAlerts: z.boolean(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: maxLen(300),
  maintenanceExemptTenants: z.array(z.string()).max(100),
}) satisfies z.ZodType<FormValues>;

/** The section's schema: only its fields, plus cross-field rules. */
export function sectionSchema(section: SettingsSection) {
  const mask = Object.fromEntries(SECTION_FIELDS[section].map((f) => [f.key, true])) as Partial<Record<SettingKey, true>>;
  return schema.pick(mask).superRefine((v, ctx) => {
    // Turning maintenance on needs the message tenants will see.
    if (section === 'maintenance' && v.maintenanceMode && !v.maintenanceMessage.trim())
      ctx.addIssue({ code: 'custom', path: ['maintenanceMessage'], message: translate('validation.maintenanceMessage') });
  });
}

/** The section's form values from saved settings. */
export function sectionValues(section: SettingsSection, s: PlatformSettings): FormValues {
  return Object.fromEntries(
    SECTION_FIELDS[section].map(({ key }) => {
      const v = s[key];
      if (isMoneyKey(key) && typeof v === 'number') return [key, v / 100];
      return [key, isLineKey(key) && Array.isArray(v) ? v.join('\n') : v];
    }),
  ) as unknown as FormValues;
}

/** Form value → wire value (line lists become arrays, dollars become minor units). */
export function toWire(key: SettingKey, value: unknown): unknown {
  if (isMoneyKey(key) && typeof value === 'number') return Math.round(value * 100);
  return isLineKey(key) && typeof value === 'string' ? splitLines(value) : value;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Saved settings that differ from their shipped default. Fields whose default is null never count. */
export function changedFromDefault(settings: PlatformSettings, meta: readonly SettingMeta[] | undefined, section?: SettingsSection) {
  return (meta ?? [])
    .filter((m) => (section ? m.section === section : true) && m.default !== null && !same(settings[m.key], m.default))
    .map((m) => m.key);
}
