// API resources for /settings — platform-wide configuration shared by every staff member.
// Personal appearance (brand colour, light/dark) is client-only and never sent to the API.
import type { Plan } from '@/lib/domain';

export const SESSION_HOURS = [4, 8, 12, 24] as const;
export type SessionHours = (typeof SESSION_HOURS)[number];

export const IDLE_LOCK_MINUTES = [5, 10, 15, 30, 60] as const;

/** The `platformSettings` singleton. */
export interface PlatformSettings {
  supportEmail: string;
  primaryDomain: string;
  /** Trial length for new tenants, 7–60 days. */
  trialDays: number;
  defaultPlan: Plan;
  /** Failed-payment retries before a tenant is suspended, 1–5. */
  dunningRetries: number;
  autoSuspend: boolean;
  requireStaffTwoFactor: boolean;
  enforceSso: boolean;
  /** Staff inactivity timeout: 4, 8, 12 or 24 hours. */
  sessionHours: number;
  /** Idle lock: the console locks after this many minutes without activity (5, 10, 15, 30 or 60). */
  idleLockMinutes: number;
  weeklyDigest: boolean;
  billingAlerts: boolean;
  incidentAlerts: boolean;
}

export type PlatformSettingsUpdate = Partial<PlatformSettings>;

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
