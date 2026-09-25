// Core mock tables shared across features (the rows a Laravel backend would keep in MySQL).
// Rows are storage models, not API resources: handlers map rows → resources.
// Feature-only tables live next to the feature's handlers (src/features/<f>/api/mock.ts).
import type { AuditCategory, Limits, Plan, Region, TenantStatus } from '@/lib/domain';
import { ROLE_PERMISSIONS, type Permission, type Role } from '@/features/auth/permissions';
import { ago, collection, fromNow, singleton } from './db';
import { FEATURE_FLAGS, LIST_PRICE, LIVE_ROOM_DEFAULTS, PLAN_LIMITS } from './reference';

// ---------- Tenants ----------
export interface TenantRow {
  id: string;
  name: string;
  domain: string;
  ownerName: string;
  ownerEmail: string;
  plan: Plan;
  /** Monthly price locked in for this tenant (plan price at signup or last migration). */
  monthlyPrice: number;
  students: number;
  status: TenantStatus;
  createdAt: string;
  lastActiveAt: string;
  trialEndsAt: string | null;
  region: Region;
  notes: string | null;
  limitOverrides: Partial<Limits>;
  /** module id → granted (true) / revoked (false). Absent = plan default. */
  entitlementOverrides: Record<string, boolean>;
  /** feature flag key → on/off for this tenant. Absent = platform flag. */
  flagOverrides: Record<string, boolean>;
  compedExtensions: string[];
  paidExtensions: string[];
}

const T = (
  id: string,
  name: string,
  domain: string,
  ownerName: string,
  plan: Plan,
  students: number,
  status: TenantStatus,
  createdAt: string,
  lastActiveMin: number,
  region: Region,
  paidExtensions: string[] = [],
): TenantRow => ({
  id,
  name,
  domain,
  ownerName,
  ownerEmail: ownerName.toLowerCase().replace(/[^a-z]+/g, '.') + '@' + domain.split('.').slice(-2).join('.'),
  plan,
  monthlyPrice: LIST_PRICE[plan],
  students,
  status,
  createdAt,
  lastActiveAt: ago({ m: lastActiveMin }),
  trialEndsAt: status === 'Trial' ? fromNow({ d: 6 }) : null,
  region,
  notes: null,
  limitOverrides: {},
  entitlementOverrides: {},
  flagOverrides: {},
  compedExtensions: [],
  paidExtensions,
});

export const tenants = collection<TenantRow>('tenants', () => [
  T(
    'tn_amplify',
    'Amplify Coaching',
    'learn.amplifycoaching.com',
    'Maya Reyes',
    'Growth',
    1284,
    'Active',
    '2025-03-04T10:00:00Z',
    12,
    'EU',
    ['drm'],
  ),
  T('tn_nordic', 'Nordic Yoga School', 'academy.nordicyoga.se', 'Freja Lind', 'Scale', 4860, 'Active', '2025-01-12T10:00:00Z', 40, 'EU', [
    'scorm',
  ]),
  T('tn_devpath', 'DevPath Bootcamp', 'learn.devpath.io', 'Rahul Mehta', 'Scale', 3112, 'Active', '2024-11-20T10:00:00Z', 180, 'US', [
    'drm',
    'scorm',
  ]),
  T(
    'tn_silva',
    'Silva Culinary Arts',
    'cursos.silvaculinary.com',
    'João Silva',
    'Growth',
    922,
    'Active',
    '2025-02-08T10:00:00Z',
    900,
    'EU',
  ),
  T(
    'tn_northstar',
    'Northstar Sales Training',
    'sell.northstar.co',
    'Chris Doyle',
    'Growth',
    1730,
    'Active',
    '2025-04-15T10:00:00Z',
    2600,
    'US',
  ),
  T('tn_atlas', 'Atlas Language Lab', 'learn.atlaslang.com', 'Marta Ruiz', 'Growth', 2044, 'Active', '2025-09-02T10:00:00Z', 5, 'EU'),
  T('tn_peak', 'Peak Fitness Cert Co', 'cert.peakfit.io', 'Dana White', 'Scale', 5210, 'Active', '2025-07-09T10:00:00Z', 70, 'APAC', [
    'drm',
  ]),
  T('tn_kodo', 'Kodo Design School', 'kodo.coursiva.io', 'Yuki Mori', 'Launch', 146, 'Active', '2026-05-18T10:00:00Z', 4200, 'APAC'),
  T(
    'tn_ledger',
    'Ledger Finance Academy',
    'ledgeracademy.coursiva.io',
    'Grace Obi',
    'Launch',
    218,
    'Trial',
    '2026-08-14T10:00:00Z',
    260,
    'EU',
  ),
  T('tn_bloom', 'Bloom Floristry Courses', 'bloom.coursiva.io', 'Elif Kaya', 'Launch', 84, 'Past due', '2026-06-21T10:00:00Z', 11000, 'EU'),
]);

// ---------- Staff (also the auth user table) ----------
export interface StaffRow {
  id: string;
  name: string;
  email: string;
  /** Mock only — the real backend stores a bcrypt hash. */
  password: string;
  role: Role;
  twoFactorEnabled: boolean;
  status: 'Active' | 'Invited' | 'Suspended';
  lastSeenAt: string | null;
  location: string;
  actions30d: number;
  /** Tenant ids this staff member watches. */
  watchlist: string[];
  /** Just-in-time Owner elevation expiry (ISO). While in the future the user has every permission. */
  elevatedUntil: string | null;
}

export const staff = collection<StaffRow>('staff', () => [
  {
    id: 'st_sam',
    name: 'Sam Ortega',
    email: 'sam@coursiva.io',
    password: 'password',
    role: 'Owner',
    twoFactorEnabled: true,
    status: 'Active',
    lastSeenAt: ago({ m: 4 }),
    location: 'San Francisco · Chrome',
    actions30d: 128,
    watchlist: [],
    elevatedUntil: null,
  },
  {
    id: 'st_priya',
    name: 'Priya Shah',
    email: 'priya@coursiva.io',
    password: 'password',
    role: 'Admin',
    twoFactorEnabled: true,
    status: 'Active',
    lastSeenAt: ago({ h: 2 }),
    location: 'London · Safari',
    actions30d: 86,
    watchlist: [],
    elevatedUntil: null,
  },
  {
    id: 'st_lee',
    name: 'Lee Chen',
    email: 'lee@coursiva.io',
    password: 'password',
    role: 'Support',
    twoFactorEnabled: false,
    status: 'Active',
    lastSeenAt: ago({ d: 1 }),
    location: 'Singapore · Chrome',
    actions30d: 214,
    watchlist: [],
    elevatedUntil: null,
  },
  {
    id: 'st_fin',
    name: 'Omar Haddad',
    email: 'omar@coursiva.io',
    password: 'password',
    role: 'Finance',
    twoFactorEnabled: true,
    status: 'Active',
    lastSeenAt: ago({ h: 5 }),
    location: 'Dubai · Edge',
    actions30d: 41,
    watchlist: [],
    elevatedUntil: null,
  },
  {
    id: 'st_noah',
    name: 'Noah Kim',
    email: 'noah@coursiva.io',
    password: 'password',
    role: 'Read-only',
    twoFactorEnabled: true,
    status: 'Active',
    lastSeenAt: ago({ d: 3 }),
    location: 'Toronto · Firefox',
    actions30d: 7,
    watchlist: [],
    elevatedUntil: null,
  },
  {
    id: 'st_dana',
    name: 'Dana Whitfield',
    email: 'dana@coursiva.io',
    password: 'password',
    role: 'Read-only',
    twoFactorEnabled: true,
    status: 'Invited',
    lastSeenAt: null,
    location: 'Invite sent Sep 8',
    actions30d: 0,
    watchlist: [],
    elevatedUntil: null,
  },
]);

/** Role → permissions. Seeded from ROLE_PERMISSIONS; editable from the Staff screen (Owner stays complete). */
export const rolePermissions = singleton<Record<Role, Permission[]>>(
  'rolePermissions',
  () => Object.fromEntries(Object.entries(ROLE_PERMISSIONS).map(([r, p]) => [r, [...p]])) as Record<Role, Permission[]>,
);

// ---------- Audit log (written by handlers, never by the client) ----------
export interface AuditRow {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  action: string;
  category: AuditCategory;
  tenantId: string | null;
  ip: string | null;
}

let auditSeq = 0;
const A = (at: string, actorName: string, action: string, category: AuditCategory, tenantId: string | null = null): AuditRow => ({
  id: `au_seed${++auditSeq}`,
  createdAt: at,
  actorId: actorName === 'System' ? null : 'st_' + actorName.split(' ')[0]!.toLowerCase(),
  actorName,
  action,
  category,
  tenantId,
  ip: actorName === 'System' ? null : '203.0.113.10',
});

export const audit = collection<AuditRow>('audit', () => [
  A(ago({ m: 5 }), 'Sam Ortega', 'Retried failed charge for Bloom Floristry Courses', 'Billing', 'tn_bloom'),
  A(ago({ h: 1 }), 'Sam Ortega', 'Enabled "AI outline assistant" for all tenants', 'Flags'),
  A(ago({ h: 3 }), 'System', 'Ledger Finance Academy trial converts in 6 days', 'Tenants', 'tn_ledger'),
  A(ago({ h: 20 }), 'Priya Shah', 'Signed in as owner of DevPath Bootcamp (read-only)', 'Security', 'tn_devpath'),
  A(ago({ h: 22 }), 'System', 'Auto-suspended 0 tenants after dunning', 'Billing'),
  A(ago({ d: 5 }), 'Sam Ortega', 'Created tenant "Kodo Design School" manually', 'Tenants', 'tn_kodo'),
  A(ago({ d: 5, h: 2 }), 'Priya Shah', 'Rotated platform signing keys', 'Security'),
  A(ago({ d: 6 }), 'System', 'Failed sign-in attempt (5×) on admin console — IP blocked', 'Auth'),
  A(ago({ d: 7 }), 'Sam Ortega', 'Moved Peak Fitness Cert Co from Growth to Scale', 'Tenants', 'tn_peak'),
]);

// ---------- Support tickets ----------
export interface TicketMessage {
  id: string;
  author: 'tenant' | 'staff';
  authorName: string;
  body: string;
  createdAt: string;
  internal: boolean;
}
export interface TicketRow {
  id: string;
  number: number;
  tenantId: string;
  requesterName: string;
  subject: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'Pending' | 'Resolved';
  channel: 'Email' | 'In-app chat';
  createdAt: string;
  assigneeId: string | null;
  tags: string[];
  escalated: boolean;
  messages: TicketMessage[];
}

const M = (author: 'tenant' | 'staff', authorName: string, body: string, at: string, n: number): TicketMessage => ({
  id: `msg_${n}`,
  author,
  authorName,
  body,
  createdAt: at,
  internal: false,
});

export const tickets = collection<TicketRow>('tickets', () => [
  {
    id: 'tk_1041',
    number: 1041,
    tenantId: 'tn_bloom',
    requesterName: 'Elif Kaya',
    subject: 'Card keeps failing on renewal',
    priority: 'High',
    status: 'Open',
    channel: 'Email',
    createdAt: ago({ h: 2 }),
    assigneeId: 'st_sam',
    tags: [],
    escalated: false,
    messages: [
      M(
        'tenant',
        'Elif Kaya',
        'Our card keeps getting declined for the August invoice but it works everywhere else. Can you check on your side?',
        ago({ h: 2 }),
        1,
      ),
      M(
        'staff',
        'Sam Ortega',
        'Looking into it now — I can see two failed attempts from Stripe. It may be a 3DS issue with your bank.',
        ago({ h: 1, m: 40 }),
        2,
      ),
    ],
  },
  {
    id: 'tk_1040',
    number: 1040,
    tenantId: 'tn_devpath',
    requesterName: 'Rahul Mehta',
    subject: 'Webhook deliveries delayed ~10 min',
    priority: 'Medium',
    status: 'Open',
    channel: 'In-app chat',
    createdAt: ago({ h: 5 }),
    assigneeId: 'st_priya',
    tags: [],
    escalated: false,
    messages: [
      M('tenant', 'Rahul Mehta', 'Since yesterday our enrollment webhooks arrive with a big delay. Anything going on?', ago({ h: 5 }), 3),
    ],
  },
  {
    id: 'tk_1038',
    number: 1038,
    tenantId: 'tn_kodo',
    requesterName: 'Yuki Mori',
    subject: 'How do we enable SSO for our team?',
    priority: 'Low',
    status: 'Pending',
    channel: 'Email',
    createdAt: ago({ d: 1 }),
    assigneeId: 'st_sam',
    tags: [],
    escalated: false,
    messages: [
      M(
        'tenant',
        'Yuki Mori',
        'We want Google Workspace SSO for instructors. Is that available on Launch or do we need to upgrade?',
        ago({ d: 1 }),
        4,
      ),
      M(
        'staff',
        'Sam Ortega',
        'SSO is part of the Scale plan. Happy to set up a trial of Scale so you can test it first.',
        ago({ h: 20 }),
        5,
      ),
    ],
  },
  {
    id: 'tk_1033',
    number: 1033,
    tenantId: 'tn_nordic',
    requesterName: 'Freja Lind',
    subject: 'Feature request: cohort analytics',
    priority: 'Low',
    status: 'Resolved',
    channel: 'In-app chat',
    createdAt: ago({ d: 2 }),
    assigneeId: 'st_lee',
    tags: ['Feature request'],
    escalated: false,
    messages: [
      M('tenant', 'Freja Lind', 'Would love completion analytics per cohort, not just per course.', ago({ d: 2 }), 6),
      M('staff', 'Lee Chen', 'Great idea — added to the roadmap. Flagging your account for the beta.', ago({ d: 2, h: -3 }), 7),
    ],
  },
]);

// ---------- Billing ----------
export interface InvoiceRow {
  id: string;
  number: string;
  tenantId: string;
  plan: Plan;
  amount: number;
  issuedAt: string;
  status: 'Paid' | 'Past due' | 'Waived';
  attempts: number;
  nextRetryAt: string | null;
  dunningPaused: boolean;
}
export const invoices = collection<InvoiceRow>('invoices', () => [
  {
    id: 'in_20260818',
    number: 'CV-20260818',
    tenantId: 'tn_bloom',
    plan: 'Launch',
    amount: 99,
    issuedAt: '2026-08-18T06:00:00Z',
    status: 'Past due',
    attempts: 2,
    nextRetryAt: fromNow({ d: 1 }),
    dunningPaused: false,
  },
  {
    id: 'in_20260815',
    number: 'CV-20260815',
    tenantId: 'tn_peak',
    plan: 'Scale',
    amount: 899,
    issuedAt: '2026-08-15T06:00:00Z',
    status: 'Paid',
    attempts: 1,
    nextRetryAt: null,
    dunningPaused: false,
  },
  {
    id: 'in_20260801a',
    number: 'CV-20260801A',
    tenantId: 'tn_amplify',
    plan: 'Growth',
    amount: 399,
    issuedAt: '2026-08-01T06:00:00Z',
    status: 'Paid',
    attempts: 1,
    nextRetryAt: null,
    dunningPaused: false,
  },
  {
    id: 'in_20260801b',
    number: 'CV-20260801B',
    tenantId: 'tn_nordic',
    plan: 'Scale',
    amount: 899,
    issuedAt: '2026-08-01T06:00:00Z',
    status: 'Paid',
    attempts: 1,
    nextRetryAt: null,
    dunningPaused: false,
  },
  {
    id: 'in_20260801c',
    number: 'CV-20260801C',
    tenantId: 'tn_atlas',
    plan: 'Growth',
    amount: 399,
    issuedAt: '2026-08-01T06:00:00Z',
    status: 'Paid',
    attempts: 1,
    nextRetryAt: null,
    dunningPaused: false,
  },
  {
    id: 'in_20260728',
    number: 'CV-20260728',
    tenantId: 'tn_kodo',
    plan: 'Launch',
    amount: 99,
    issuedAt: '2026-07-28T06:00:00Z',
    status: 'Paid',
    attempts: 1,
    nextRetryAt: null,
    dunningPaused: false,
  },
]);

export interface OverageRow {
  id: string;
  tenantId: string;
  meter: string;
  usage: string;
  rate: string;
  amount: number;
  billedAt: string | null;
}
export const overages = collection<OverageRow>('overages', () => [
  {
    id: 'ov_1',
    tenantId: 'tn_devpath',
    meter: 'Video storage',
    usage: '2.14 TB of 1 TB',
    rate: '$10 / 100 GB',
    amount: 114,
    billedAt: null,
  },
  {
    id: 'ov_2',
    tenantId: 'tn_peak',
    meter: 'SMS credits',
    usage: '14,208 of 10,000 sent',
    rate: '$15 / 1,000',
    amount: 63,
    billedAt: null,
  },
  {
    id: 'ov_3',
    tenantId: 'tn_nordic',
    meter: 'Video transcode',
    usage: '712k of 500k min',
    rate: '$8 / 100k min',
    amount: 17,
    billedAt: null,
  },
  { id: 'ov_4', tenantId: 'tn_atlas', meter: 'Staff seats', usage: '12 of 10 seats', rate: '$8 / seat', amount: 16, billedAt: null },
]);

// ---------- Privacy requests ----------
export interface DsarRow {
  id: string;
  requester: string;
  tenantId: string;
  type: 'Access' | 'Deletion' | 'Portability';
  receivedAt: string;
  dueAt: string;
  fulfilledAt: string | null;
}
export const dsars = collection<DsarRow>('dsars', () => [
  {
    id: 'ds_1',
    requester: 'nadia.osei@gmail.com',
    tenantId: 'tn_amplify',
    type: 'Access',
    receivedAt: ago({ d: 26 }),
    dueAt: fromNow({ d: 4 }),
    fulfilledAt: null,
  },
  {
    id: 'ds_2',
    requester: 'carl.j@outlook.com',
    tenantId: 'tn_devpath',
    type: 'Deletion',
    receivedAt: ago({ d: 22 }),
    dueAt: fromNow({ d: 8 }),
    fulfilledAt: null,
  },
  {
    id: 'ds_3',
    requester: 'm.lindqvist@proton.me',
    tenantId: 'tn_nordic',
    type: 'Portability',
    receivedAt: ago({ d: 20 }),
    dueAt: fromNow({ d: 10 }),
    fulfilledAt: null,
  },
  {
    id: 'ds_4',
    requester: 'beth.alvarez@gmail.com',
    tenantId: 'tn_peak',
    type: 'Deletion',
    receivedAt: ago({ d: 32 }),
    dueAt: ago({ d: 2 }),
    fulfilledAt: null,
  },
]);

// ---------- Platform configuration ----------
export interface FlagRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rollout: 'All tenants' | 'Scale only' | 'Growth and Scale' | 'Beta list' | '10% of tenants';
}
export const flags = collection<FlagRow>('flags', () =>
  FEATURE_FLAGS.map((f) => ({ id: f.key, name: f.name, description: f.description, enabled: f.enabled, rollout: 'All tenants' as const })),
);

export interface PlatformStatus {
  incident: { title: string; postedAt: string } | null;
}
export const platformStatus = singleton<PlatformStatus>('platformStatus', () => ({ incident: null }));

export interface PlatformSettings {
  supportEmail: string;
  primaryDomain: string;
  trialDays: number;
  defaultPlan: Plan;
  dunningRetries: number;
  autoSuspend: boolean;
  requireStaffTwoFactor: boolean;
  enforceSso: boolean;
  sessionHours: number;
  weeklyDigest: boolean;
  billingAlerts: boolean;
  incidentAlerts: boolean;
}
export const platformSettings = singleton<PlatformSettings>('platformSettings', () => ({
  supportEmail: 'support@coursiva.com',
  primaryDomain: 'coursiva.io',
  trialDays: 14,
  defaultPlan: 'Launch',
  dunningRetries: 3,
  autoSuspend: true,
  requireStaffTwoFactor: true,
  enforceSso: false,
  sessionHours: 12,
  weeklyDigest: true,
  billingAlerts: true,
  incidentAlerts: true,
}));

export interface Pricing {
  prices: Record<Plan, number>;
  annualDiscountPct: number;
}
export const pricing = singleton<Pricing>('pricing', () => ({ prices: { ...LIST_PRICE }, annualDiscountPct: 20 }));

/** Extension key → plans that get it free (owned by Extensions, read by Entitlements and tenants). */
export const extensionInclusions = singleton<Record<string, Plan[]>>('extensionInclusions', () => ({}));
/** `${moduleId}:${plan}` → on/off override of the plan default (owned by Entitlements). */
export const entitlementOverrides = singleton<Record<string, boolean>>('entitlementOverrides', () => ({}));
/** Per-plan API rate limit, requests/min per tenant (owned by Abuse & limits; tenant limits read it). */
export const apiRateLimits = singleton<Record<Plan, number>>('apiRateLimits', () => ({
  Launch: PLAN_LIMITS.Launch.apiPerMinute,
  Growth: PLAN_LIMITS.Growth.apiPerMinute,
  Scale: PLAN_LIMITS.Scale.apiPerMinute,
}));

/** Extension catalogue settings (owned by Extensions; the tenant drawer reads prices). */
export interface ExtensionSettings {
  /** extension key -> price override (server-side storage only; never sent as a keyed map). */
  prices: Record<string, number>;
  hidden: string[];
  bundlePrice: number;
  trialDays: number;
  rulesOff: string[];
}
export const extensionSettings = singleton<ExtensionSettings>('extensionSettings', () => ({
  prices: {},
  hidden: [],
  bundlePrice: 179,
  trialDays: 14,
  rulesOff: [],
}));

/** Platform-hosted live-room minutes per plan (owned by Video & storage). */
export const liveRoomAllowance = singleton<Record<Plan, number>>('liveRoomAllowance', () => ({ ...LIVE_ROOM_DEFAULTS }));

// ---------- Notifications (per staff user in a real backend; shared here) ----------
export interface NotificationRow {
  id: string;
  text: string;
  tone: 'good' | 'warn' | 'bad';
  createdAt: string;
  readAt: string | null;
  href: string | null;
}
export const notifications = collection<NotificationRow>('notifications', () => [
  {
    id: 'nt_1',
    text: 'Payment failed again for Bloom Floristry Courses',
    tone: 'bad',
    createdAt: ago({ h: 2 }),
    readAt: null,
    href: '/revenue',
  },
  {
    id: 'nt_2',
    text: 'Ledger Finance Academy trial converts in 6 days',
    tone: 'warn',
    createdAt: ago({ d: 1 }),
    readAt: null,
    href: '/tenants/tn_ledger',
  },
  {
    id: 'nt_3',
    text: 'New tenant signup: Kodo Design School',
    tone: 'good',
    createdAt: ago({ d: 3 }),
    readAt: null,
    href: '/tenants/tn_kodo',
  },
  { id: 'nt_4', text: '5 failed sign-ins blocked on admin console', tone: 'bad', createdAt: ago({ d: 4 }), readAt: null, href: '/audit' },
]);

export interface SessionState {
  userId: string | null;
  /** User who passed the password step and still owes a 2FA code. */
  pendingTwoFactorUserId: string | null;
}
export const session = singleton<SessionState>('session', () => ({ userId: null, pendingTwoFactorUserId: null }));
