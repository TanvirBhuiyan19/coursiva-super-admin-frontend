// API resources for /settings — platform-wide configuration shared by every staff member.
// Personal appearance (brand colour, light/dark) is client-only and never sent to the API.
import type { Plan } from '@/lib/domain';

export const SESSION_HOURS = [4, 8, 12, 24] as const;
export type SessionHours = (typeof SESSION_HOURS)[number];

export const IDLE_LOCK_MINUTES = [5, 10, 15, 30, 60] as const;

export const SETTINGS_SECTIONS = [
  'platform',
  'signup',
  'branding',
  'legal',
  'email',
  'security',
  'billing',
  'notifications',
  'maintenance',
] as const;
/** Sections of `PlatformSettings` (each has its own Save, Restore defaults and "where these values are read"). */
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DATA_REGIONS = ['US', 'EU', 'APAC'] as const;
export type DataRegion = (typeof DATA_REGIONS)[number];

/** Who bills schools' subscriptions for new checkouts. Paddle and Lemon Squeezy are merchants of record. */
export const BILLING_PROVIDERS = ['stripe', 'paddle', 'lemon_squeezy'] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

export const BRAND_ASSET_SLOTS = ['logo', 'logo_dark', 'favicon', 'og_image'] as const;
export type BrandAssetSlot = (typeof BRAND_ASSET_SLOTS)[number];

/** A platform brand image (uploaded separately: `POST /settings/brand-assets/{slot}`). */
export interface BrandAsset {
  slot: BrandAssetSlot;
  /** Public URL, or null when not uploaded. */
  url: string | null;
  updatedAt: string | null;
}

/** The `platformSettings` singleton. */
export interface PlatformSettings {
  // Platform
  /** Shown in the console, platform emails and to tenants that keep platform branding. 2–60 characters. */
  platformName: string;
  supportEmail: string;
  primaryDomain: string;
  /** Linked from tenant admin screens; '' hides the link. https URL. */
  helpCentreUrl: string;
  /** IANA zone applied to new workspaces and console date rendering. */
  defaultTimezone: string;

  // Signup & provisioning
  /** Self-service sign-up on the marketing site. Off: /signup refuses, the console can still create tenants. */
  publicSignup: boolean;
  /** Extra subdomains nobody may claim (on top of the platform's built-in reserved list). */
  reservedSubdomains: string[];
  /** Shortest subdomain a new workspace may take, 3–20. */
  minSubdomainLength: number;

  // Branding (images: `brandAssets`, uploaded separately)
  /** Brand colour new workspaces start with (#RRGGBB). */
  defaultBrandColor: string;
  /** Where new workspaces' data lives unless chosen otherwise. */
  defaultDataRegion: DataRegion;
  /** Footer line of platform emails and pages, ≤ 300 characters. */
  footerText: string;
  brandAssets: BrandAsset[];

  // Legal
  legalCompanyName: string;
  legalAddress: string;
  termsUrl: string;
  privacyUrl: string;
  /** https profile URLs shown in platform email footers, ≤ 10. */
  socialLinks: string[];

  // Email (platform mail; schools send under their own sender)
  mailFromName: string;
  mailFromAddress: string;
  /** '' = no Reply-To. */
  mailReplyTo: string;
  emailFooter: string;

  /**
   * Free-trial length of new schools, 0–90 days (section `signup`). The single source: the same value as
   * `GET /billing/pricing` → `trialDays`. 0 = no free trial, schools pay the first period at sign-up.
   */
  trialDays: number;
  /**
   * Sign-up needs a verified card before the trial starts (a refunded card check). Off restores card-less trials,
   * which pause at the trial's end until a card is added. Section `signup`.
   */
  trialRequiresCard: boolean;
  /**
   * The card check's amount in minor units of `billingCurrency`, 50–500 (Stripe's minimum is 50 = $0.50 in USD);
   * always refunded. Shown as `amount / 100` in that currency.
   */
  cardCheckAmount: number;
  /** Read-only ISO 4217 code Coursiva bills schools in (`USD` today; backend config). Ignored by `PATCH`. */
  billingCurrency: string;
  defaultPlan: Plan;
  /**
   * Where schools check out and pay (section `billing`). Changing it needs `billing.manage` too, and a connected
   * provider (Platform → Connections); schools already subscribed keep theirs. Not resettable.
   */
  billingProvider: BillingProvider;
  /** Failed-payment retries before a tenant is suspended, 1–5. */
  dunningRetries: number;
  autoSuspend: boolean;
  requireStaffTwoFactor: boolean;
  enforceSso: boolean;
  /** Staff inactivity timeout: 4, 8, 12 or 24 hours. */
  sessionHours: number;
  /** Idle lock: the console locks after this many minutes without activity (5, 10, 15, 30 or 60). */
  idleLockMinutes: number;
  /** IPs or CIDR ranges the console accepts sign-ins from; empty = anywhere. ≤ 50. */
  consoleIpAllowlist: string[];
  /** Staff must give a reason before impersonating a tenant. */
  impersonationRequiresReason: boolean;
  /** Impersonation sessions end after this many minutes, 15–240. */
  impersonationMaxMinutes: number;
  weeklyDigest: boolean;
  billingAlerts: boolean;
  incidentAlerts: boolean;

  // Maintenance
  /** Tenant dashboards and school sites answer 503 with `maintenanceMessage`; the console keeps working. */
  maintenanceMode: boolean;
  maintenanceMessage: string;
  /** Tenant ids exempt from maintenance mode (e.g. for testing a fix), ≤ 100. */
  maintenanceExemptTenants: string[];
}

/** Not editable through `PATCH /settings`: brand assets are uploaded separately; the billing currency is config. */
export type ReadOnlySetting = 'brandAssets' | 'billingCurrency';

/** Every editable setting (everything except the read-only ones). */
export type SettingKey = keyof Omit<PlatformSettings, ReadOnlySetting>;

export type PlatformSettingsUpdate = Partial<Omit<PlatformSettings, ReadOnlySetting>>;

/** A setting's shipped default and what reads it (`GET /settings/meta`). */
export interface SettingMeta {
  key: SettingKey;
  section: SettingsSection;
  /** Shipped default (JSON), or null when the setting has none or isn't resettable (primary domain, billing provider). */
  default: unknown;
  /** Where the value is read, e.g. "Marketing sign-up (POST /signup)". Not translated. */
  effect: string;
}

export interface SettingsMeta {
  fields: SettingMeta[];
}

/**
 * `GET /settings/meta` as Laravel sends it: `key` is a snake_case *value* (`public_signup`), which the API client
 * doesn't convert (it camelises object keys only). `useSettingsMeta` maps it to `SettingsMeta`.
 */
export interface SettingsMetaWire {
  fields: (Omit<SettingMeta, 'key'> & {
    /** @pattern ^[a-z][a-z0-9_]*$ */
    key: string;
  })[];
}

/** `POST /settings/email/test` → 202. */
export interface EmailTestResult {
  /** The signed-in staff member's address the test was sent to. */
  sentTo: string;
}

export interface IntegrationPolicy {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface IntegrationAdoption {
  name: string;
  category: string;
  /** Tenants that have connected the app. */
  tenants: number;
  totalTenants: number;
  note: string | null;
}

export interface IntegrationRequest {
  id: string;
  name: string;
  requests: number;
  onRoadmap: boolean;
}

export interface IntegrationSettings {
  liveApps: number;
  categories: number;
  /** Always empty: replaced by Platform → Feature availability. */
  policies: IntegrationPolicy[];
  adoption: IntegrationAdoption[];
  requests: IntegrationRequest[];
}

export interface TaxRegion {
  id: string;
  region: string;
  kind: string;
  rate: string;
}

export interface TaxSettings {
  stripeTax: boolean;
  taxInclusive: boolean;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  /** Lowest allowed next number (last issued + 1) — numbering is sequential and gap-free. */
  minNextInvoiceNumber: number;
  /** e.g. "CV-020261". */
  nextInvoicePreview: string;
  regions: TaxRegion[];
}

export type TaxSettingsUpdate = Partial<Pick<TaxSettings, 'stripeTax' | 'taxInclusive' | 'invoicePrefix' | 'nextInvoiceNumber'>>;
