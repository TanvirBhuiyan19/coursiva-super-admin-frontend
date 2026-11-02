// Domain vocabulary shared by every feature. Values here are enums of the API contract,
// not data — anything an operator can change (prices, limits, catalogue) comes from the API.

export const PLANS = ['Launch', 'Growth', 'Scale'] as const;
export type Plan = (typeof PLANS)[number];
export const PLAN_RANK: Record<Plan, number> = { Launch: 1, Growth: 2, Scale: 3 };

export const TENANT_STATUSES = ['Active', 'Trial', 'Past due', 'Suspended'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_HEALTH = ['Healthy', 'Watch', 'At risk'] as const;
export type TenantHealth = (typeof TENANT_HEALTH)[number];

/** Data-residency regions (Laravel GovernanceController::REGIONS). */
export const REGIONS = ['EU', 'US', 'UK', 'APAC'] as const;
export type Region = (typeof REGIONS)[number];

export const AUDIT_CATEGORIES = ['Tenants', 'Billing', 'Flags', 'Security', 'Auth'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** Per-tenant overridable limits (Laravel `coursiva.plans` keys). `0` means unlimited. */
export const LIMIT_KEYS = [
  'storageGb',
  'staffSeats',
  'apiPerMinute',
  'students',
  'courses',
  'liveRoomMinutes',
  'aiCredits',
  'smsCredits',
  'liveSessions',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type Limits = Record<LimitKey, number>;

/**
 * A limit key as a *value* on the wire (`limits[].key: "storage_gb"`). The API client camelises object keys only, so
 * rows that carry the key as a value keep Laravel's snake_case; convert with `limitKeyOf` before indexing `Limits`.
 */
export const LIMIT_WIRE_KEYS = {
  storageGb: 'storage_gb',
  staffSeats: 'staff_seats',
  apiPerMinute: 'api_per_minute',
  students: 'students',
  courses: 'courses',
  liveRoomMinutes: 'live_room_minutes',
  aiCredits: 'ai_credits',
  smsCredits: 'sms_credits',
  liveSessions: 'live_sessions',
} as const satisfies Record<LimitKey, string>;
export type LimitKeyWire = (typeof LIMIT_WIRE_KEYS)[LimitKey];
const LIMIT_KEY_OF = Object.fromEntries(LIMIT_KEYS.map((k) => [LIMIT_WIRE_KEYS[k], k])) as Record<LimitKeyWire, LimitKey>;
/** The app key for a wire limit key (`storage_gb` → `storageGb`). */
export const limitKeyOf = (wire: LimitKeyWire): LimitKey => LIMIT_KEY_OF[wire];

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'flat' | 'accent';
