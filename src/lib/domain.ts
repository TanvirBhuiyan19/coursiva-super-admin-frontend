// Domain vocabulary shared by every feature. Values here are enums of the API contract,
// not data — anything an operator can change (prices, limits, catalogue) comes from the API.

export const PLANS = ['Launch', 'Growth', 'Scale'] as const;
export type Plan = (typeof PLANS)[number];
export const PLAN_RANK: Record<Plan, number> = { Launch: 1, Growth: 2, Scale: 3 };

export const TENANT_STATUSES = ['Active', 'Trial', 'Past due', 'Suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_HEALTH = ['Healthy', 'Watch', 'At risk'] as const;
export type TenantHealth = (typeof TENANT_HEALTH)[number];

export const REGIONS = ['EU', 'US', 'APAC'] as const;
export type Region = (typeof REGIONS)[number];

export const AUDIT_CATEGORIES = ['Tenants', 'Billing', 'Flags', 'Security', 'Auth'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Per-tenant overridable limits. `0` means unlimited. */
export const LIMIT_KEYS = ['storageGb', 'staffSeats', 'apiPerMinute', 'students', 'courses', 'liveRoomMinutes'] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type Limits = Record<LimitKey, number>;

export const LIMIT_LABELS: Record<LimitKey, string> = {
  storageGb: 'Storage (GB)',
  staffSeats: 'Staff seats',
  apiPerMinute: 'API req/min',
  students: 'Students',
  courses: 'Courses',
  liveRoomMinutes: 'Live room min/mo',
};

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'flat' | 'accent';
