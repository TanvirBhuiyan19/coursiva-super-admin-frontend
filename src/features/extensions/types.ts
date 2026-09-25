// API resources for /extensions. These types are the contract the Laravel ExtensionResource must match.
import type { Plan } from '@/lib/domain';

export type ExtensionStatus = 'Live' | 'Beta' | 'Hidden';

/** Row in the extension catalogue. Install and MRR figures are computed server-side. */
export interface Extension {
  key: string;
  name: string;
  category: string;
  blurb: string;
  /** Tenant module the extension belongs to. */
  module: string;
  /** True when the extension gates the whole module (its plan inclusion drives Plan entitlements). */
  gatesModule: boolean;
  /** Current price per month in USD. */
  price: number;
  /** `Hidden` when removed from the catalogue (existing installs keep working). */
  status: ExtensionStatus;
  hidden: boolean;
  /** Plans that get the extension free, in plan order. */
  includedPlans: Plan[];
  installs: number;
  payingInstalls: number;
  freeInstalls: number;
  /** price × payingInstalls. */
  mrr: number;
  /** installs ÷ tenants, 0–100. */
  attachPct: number;
}

export interface ExtensionSummary {
  /** Sum of `mrr` over visible extensions. */
  mrr: number;
  payingInstalls: number;
  freeInstalls: number;
  tenants: number;
  /** Tenants running at least one extension (free by plan, paying or comped). */
  tenantsWithAny: number;
  attachPct: number;
  avgPerTenant: number;
  trialConversionPct: number;
  extensions: number;
  categories: number;
}

export const EXTENSION_TRIAL_DAYS = [0, 7, 14, 30] as const;
export type ExtensionTrialDays = (typeof EXTENSION_TRIAL_DAYS)[number];

export const SELLING_RULES = ['self_serve', 'prorate', 'retain_data', 'auto_include_on_upgrade'] as const;
export type SellingRuleKey = (typeof SELLING_RULES)[number];

export interface SellingRule {
  key: SellingRuleKey;
  label: string;
  description: string;
  enabled: boolean;
}

export interface ExtensionSettings {
  bundlePrice: number;
  /** Sum of every visible extension's price (what the bundle is compared against). */
  separatePrice: number;
  /** Bundle discount vs buying separately, 0–100. */
  bundleDiscountPct: number;
  trialDays: ExtensionTrialDays;
  rules: SellingRule[];
}

export type ExtensionUpdate = Partial<{ price: number; hidden: boolean }>;

export type ExtensionSettingsUpdate = Partial<{
  bundlePrice: number;
  trialDays: ExtensionTrialDays;
  rules: { key: SellingRuleKey; enabled: boolean }[];
}>;
