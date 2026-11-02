// API resources for /domains (domain resale through a registrar). Contract: docs/api/domains.md.
// Money is decimal USD (e.g. 12.99).

export const REGISTRAR_KEYS = ['cloudflare', 'fake'] as const;
/** `fake` exists only outside production. */
export type RegistrarKey = (typeof REGISTRAR_KEYS)[number];

export const DOMAIN_ENVIRONMENTS = ['live', 'sandbox'] as const;
/** `sandbox`: the registrar's test environment (free test registrations, not on the internet) — shown as a "Sandbox" badge. */
export type DomainEnvironment = (typeof DOMAIN_ENVIRONMENTS)[number];

export interface RegistrarCapabilities {
  renew: boolean;
  autoRenewToggle: boolean;
  transferOut: boolean;
  contactUpdate: boolean;
  dns: boolean;
}

export interface RegistrarOption {
  key: RegistrarKey;
  /** e.g. "Cloudflare Registrar". */
  name: string;
  /** Its connection is saved and verified (or the env fallback is set). */
  configured: boolean;
  /** Cloudflare: the connection's mode (blank = sandbox). */
  environment: DomainEnvironment;
  capabilities: RegistrarCapabilities;
}

export const DOMAIN_ROUNDINGS = ['x99', 'none'] as const;
/** `x99` rounds prices up to .99 (default). */
export type DomainRounding = (typeof DOMAIN_ROUNDINGS)[number];

export interface DomainSettings {
  /** The registrar new purchases go to. */
  registrar: RegistrarKey;
  registrars: RegistrarOption[];
  /** 0–200, up to 2 decimals, default 20. */
  markupPercent: number;
  /** USD 0–100, up to 2 decimals, default 3 — the minimum margin per year. */
  markupMin: number;
  rounding: DomainRounding;
  /** Without dots, lower case. */
  enabledTlds: string[];
  /** 7–60, default 30 — renewal is charged this many days before expiry. */
  renewalLeadDays: number;
  /** null = the registrar's own agreement. */
  registrationAgreementUrl: string | null;
  /** Default ICANN's "Registrant benefits and responsibilities". */
  registrantBenefitsUrl: string;
  /** Default ICANN's "Registrant educational information". */
  registrantEducationUrl: string;
  /** What schools link at checkout (resolved). */
  terms: DomainTerm[];
  /** The billing currency (read-only). */
  currency: 'USD';
  /** The price of a 10.00 cost under these settings. */
  example: { cost: number; price: number };
  /** The active registrar's environment ("sandbox" → badge). */
  environment: DomainEnvironment;
  /** Shown as a banner (e.g. the sandbox warning). */
  warnings: string[];
}

export const TERM_KEYS = ['registration_agreement', 'registrant_benefits', 'registrant_education'] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export interface DomainTerm {
  key: TermKey;
  label: string;
  url: string;
}

/** `PUT /domains/settings` body: any subset; `null` resets a URL to its default. */
export interface DomainSettingsUpdate {
  registrar?: RegistrarKey;
  markupPercent?: number;
  markupMin?: number;
  rounding?: DomainRounding;
  enabledTlds?: string[];
  renewalLeadDays?: number;
  registrationAgreementUrl?: string | null;
  registrantBenefitsUrl?: string | null;
  registrantEducationUrl?: string | null;
}

export const CUSTOM_DOMAIN_STATUSES = ['pending', 'verified', 'failed'] as const;

/** The school's custom-domain row for a registered domain ("dom_…"). */
export interface CustomDomainLink {
  id: string;
  domain: string;
  status: (typeof CUSTOM_DOMAIN_STATUSES)[number];
  isPrimary: boolean;
}

export const REGISTRATION_STATUSES = [
  'registering',
  'active',
  'expiring',
  'grace',
  'expired',
  'transfer_requested',
  'transferred_out',
  'failed',
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export interface RegistrationRow {
  /** "dreg_…" */
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  provider: RegistrarKey;
  /** "sandbox": a test registration — never renewed nor connected. */
  environment: DomainEnvironment;
  status: RegistrationStatus;
  registeredAt: string | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  /** The school's choice. */
  autoRenew: boolean;
  /** What the registrar is set to (null = unknown). */
  providerAutoRenew: boolean | null;
  renewalPrice: number | null;
  /** Registrar cost. */
  renewalCost: number | null;
  currency: 'USD';
  openTasks: number;
  /** customDomain !== null. */
  connected: boolean;
  customDomain: CustomDomainLink | null;
  /** A contact change waits for a contact_update task. */
  contactPending: boolean;
  createdAt: string;
}

/** Personal data: decrypted for staff; null after erasure. */
export interface RegistrantContact {
  name: string;
  organization: string | null;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
}

export const DOMAIN_ORDER_KINDS = ['registration', 'renewal'] as const;
export type DomainOrderKind = (typeof DOMAIN_ORDER_KINDS)[number];

export const DOMAIN_ORDER_STATUSES = ['quoted', 'charging', 'paid', 'registering', 'completed', 'failed', 'refunded', 'credited'] as const;
export type DomainOrderStatus = (typeof DOMAIN_ORDER_STATUSES)[number];

export interface DomainOrderRow {
  /** "dord_…" */
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  kind: DomainOrderKind;
  environment: DomainEnvironment;
  status: DomainOrderStatus;
  /** Registrar cost. */
  cost: number;
  /** Charged to the school. */
  price: number;
  currency: 'USD';
  invoiceId: string | null;
  invoiceNumber: string | null;
  registrationId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export const REGISTRAR_TASK_KINDS = ['transfer_out', 'contact_update', 'disable_auto_renew', 'renew', 'registration_review'] as const;
export type RegistrarTaskKind = (typeof REGISTRAR_TASK_KINDS)[number];

export const REGISTRAR_TASK_STATUSES = ['open', 'done', 'cancelled'] as const;
export type RegistrarTaskStatus = (typeof REGISTRAR_TASK_STATUSES)[number];

export const TASK_DETAIL_KEYS = ['reason', 'detail', 'requested_at', 'expires_at', 'order_id'] as const;
export type TaskDetailKey = (typeof TASK_DETAIL_KEYS)[number];

/** Task context as a list — never data values as keys. */
export interface TaskDetail {
  key: TaskDetailKey;
  label: 'Reason' | 'Details' | 'Requested' | 'Expires' | 'Order';
  /** ISO-8601 for requested_at / expires_at; a readable sentence for reason. */
  value: string;
}

export interface RegistrarTask {
  /** "rgt_…" */
  id: string;
  kind: RegistrarTaskKind;
  status: RegistrarTaskStatus;
  registrationId: string;
  domain: string;
  tenantId: string;
  tenantName: string;
  provider: RegistrarKey;
  /** What to do in the registrar's dashboard. */
  instructions: string;
  /** Context in a fixed key order; never secrets. */
  details: TaskDetail[];
  resolutionNote: string | null;
  /** Staff name ("System" when closed automatically). */
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface RegistrationDetail extends RegistrationRow {
  providerRef: string | null;
  privacy: boolean;
  transferLockedUntil: string | null;
  failureReason: string | null;
  lastReminder: 30 | 7 | 1 | null;
  registrant: RegistrantContact | null;
  orders: DomainOrderRow[];
  tasks: RegistrarTask[];
}

/** `POST /domains/tasks/{id}/complete` body. */
export interface CompleteTaskInput {
  /** ≤ 500 characters. */
  note?: string;
  /** transfer_out only (required for it): 6–64 printable characters. Emailed to the school's owners, never stored. */
  authCode?: string;
  /** renew only: a date YYYY-MM-DD after the current expiry. */
  expiresAt?: string;
}

/** `POST /domains/tasks/{id}/cancel` body. */
export interface CancelTaskInput {
  note?: string;
}

// ---------- List params and meta ----------
export interface RegistrationListParams {
  page?: number;
  perPage?: number;
  status?: RegistrationStatus;
  tenantId?: string;
  /** 1–365: active/expiring ones expiring within N days, soonest first. */
  expiringWithinDays?: number;
  /** Domain contains. */
  search?: string;
}

/** Counts respect every filter except status; statuses with no rows are left out. */
export interface RegistrationListMeta {
  counts: { status: RegistrationStatus; count: number }[];
}

export const TASK_STATUS_FILTERS = ['open', 'done', 'cancelled', 'all'] as const;
export type TaskStatusFilter = (typeof TASK_STATUS_FILTERS)[number];

export interface TaskListParams {
  page?: number;
  perPage?: number;
  /** Default `open`; `all` for every status. */
  status?: TaskStatusFilter;
  kind?: RegistrarTaskKind;
  tenantId?: string;
}

export interface TaskListMeta {
  /** Open tasks per kind, respecting tenantId only. */
  counts: { kind: RegistrarTaskKind; count: number }[];
  /** Every open task on the platform, whatever the filters (the nav badge). */
  openTotal: number;
}

/** `problem` = failed + refunded + credited. Quotes are listed only with `status=quoted`. */
export type OrderStatusFilter = DomainOrderStatus | 'problem';

export interface OrderListParams {
  page?: number;
  perPage?: number;
  status?: OrderStatusFilter;
  kind?: DomainOrderKind;
  tenantId?: string;
}
