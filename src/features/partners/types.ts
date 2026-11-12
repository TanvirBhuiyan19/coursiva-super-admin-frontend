// Coursiva's partner programme (docs/api/partners.md) — the contract for Laravel's PartnerConsoleController and
// PartnerPayoutController (and Go's internal/modules/partners). Money is in minor units (cents).

export const PARTNER_STATUSES = ['Pending', 'Active', 'Paused', 'Declined', 'Banned'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const PARTNER_ACTIONS = ['approve', 'decline', 'pause', 'activate', 'ban'] as const;
export type PartnerAction = (typeof PARTNER_ACTIONS)[number];

export const COMMISSION_STATUSES = ['held', 'owed', 'paid', 'reversed'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const PAYOUT_RAILS = ['stripe', 'paypal'] as const;
export type PayoutRail = (typeof PAYOUT_RAILS)[number];

export const LINE_KINDS = [
  'plan',
  'extension',
  'bundle',
  'proration',
  'dedicated',
  'overage',
  'tax',
  'domain',
  'discount',
  'credit',
] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const BATCH_STATUSES = ['draft', 'approved', 'funding', 'funded', 'sending', 'completed', 'partially_failed', 'canceled'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export interface PartnerStats {
  clicks: number;
  clicks30d: number;
  signups: number;
  activeSchools: number;
  held: number;
  owed: number;
  paid: number;
  reversed: number;
  balance: number;
}

export interface Partner {
  id: string;
  name: string;
  email: string;
  slug: string;
  link: string;
  status: PartnerStatus;
  couponCode: string | null;
  /** Effective rate (the override, else the programme's). */
  commissionPct: number;
  cookieDays: number;
  emailVerified: boolean;
  createdAt: string | null;
  website: string | null;
  audience: string | null;
  pitch: string | null;
  statusNote: string | null;
  commissionPctOverride: number | null;
  cookieDaysOverride: number | null;
  accountId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  stats?: PartnerStats;
}

export interface PartnersSummary {
  applications: number;
  activePartners: number;
  referrals: number;
  clicks30d: number;
  held: number;
  owed: number;
  paid: number;
  reversed: number;
  currency: string;
}

export interface PartnerListParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: PartnerStatus | '';
  applications?: boolean;
}

export interface PartnerUpdate {
  name?: string;
  website?: string | null;
  commissionPct?: number | null;
  cookieDays?: number | null;
  couponCode?: string | null;
  accountEmail?: string | null;
}

export interface PartnerReferral {
  tenantId: string;
  tenantName: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  partnerId: string;
  partnerName: string;
  source: 'link' | 'coupon' | 'manual';
  clickId: string | null;
  attributedAt: string | null;
  firstPaidAt: string | null;
  endsAt: string | null;
  selfReferral: boolean;
  voidReason: string | null;
  voidedAt: string | null;
  note: string | null;
  createdBy: string | null;
}

export interface NewReferral {
  tenantId: string;
  partnerId: string;
  reason: string;
}

export interface PartnerCommission {
  id: string;
  school: string | null;
  base: number;
  rate: number;
  amount: number;
  currency: string;
  status: CommissionStatus;
  availableAt: string | null;
  paidAmount: number;
  paidAt: string | null;
  reversedAmount: number;
  reversedReason: string | null;
  due: number;
  frozen: boolean;
  createdAt: string | null;
  partnerId: string;
  partnerName: string;
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  payoutTransferId: string | null;
}

export interface PartnerTerms {
  commissionPct: number;
  cookieDays: number;
  holdDays: number;
  clawbackMonths: number;
  recurring: 'lifetime' | number;
  minPayoutUsd: number;
  payoutDay: number;
  rails: PayoutRail[];
  attribution: 'last_click' | 'first_click';
  excludedLineKinds: LineKind[];
  dualApprovalUsd: number;
}

export interface PartnerTermsSettings extends PartnerTerms {
  defaults: PartnerTerms;
  lineKinds: LineKind[];
}

export interface PayoutItem {
  id: string;
  batchId: string;
  payeeId: string;
  payeeName: string | null;
  rail: string;
  amount: number;
  currency: string;
  status: string;
  reference: string | null;
  providerRef: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  reversedAmount: number;
  attempt: number;
  sentAt: string | null;
  settledAt: string | null;
}

export interface BlockedPayee {
  id: string;
  name?: string;
  code: string;
  reason: string;
  amount: number;
}

export interface PayoutBatch {
  id: string;
  period: string;
  status: BatchStatus;
  total: number;
  currency: string;
  railTotals: Record<string, number>;
  blockedCount: number;
  fundedAmount: number;
  fundingFee: number;
  creditApplied: number;
  createdAt: string | null;
  approvedAt: string | null;
  fundedAt: string | null;
  completedAt: string | null;
  needsSecondApprover: boolean;
  itemCount?: number;
  createdBy?: string | null;
  approvedBy?: string | null;
  items?: PayoutItem[];
  blocked?: BlockedPayee[];
}

export interface PayoutFunding {
  currency: string;
  /** The platform's available Stripe balance (null: Stripe not connected or unreachable). */
  stripeBalance: number | null;
  minimum: number;
  dualApproval: number;
  payoutDay: number;
  rails: { rail: PayoutRail; available: boolean; reason: string | null }[];
}

export interface PartnerTaxForm {
  id: string;
  kind: 'w9' | 'w8ben' | 'w8bene';
  status: 'submitted' | 'accepted' | 'rejected' | 'superseded' | 'expired';
  legalName: string;
  country: string;
  tinType: string | null;
  tinLast4: string | null;
  signedAt: string | null;
  expiresAt: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  partnerId: string;
  partnerName: string | null;
}

export interface PartnerTaxForms {
  threshold: number;
  forms: PartnerTaxForm[];
}
