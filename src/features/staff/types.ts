// API resources for /staff. Staff members are the console's login users (the shared `staff` table).
import type { AuditCategory } from '@/lib/domain';
import type { Permission, Role } from '@/features/auth/permissions';

export type StaffStatus = 'Active' | 'Invited' | 'Suspended';

/** Roles that can be given from the Staff screen (Owner is never assignable here). */
export const ASSIGNABLE_ROLES = ['Admin', 'Support', 'Finance', 'Read-only'] as const satisfies readonly Role[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const STAFF_SCOPES = ['all', 'assigned', 'enterprise'] as const;
export type StaffScope = (typeof STAFF_SCOPES)[number];
export const SCOPE_LABELS: Record<StaffScope, string> = {
  all: 'All tenants',
  assigned: 'Assigned tenants',
  enterprise: 'Enterprise only',
};

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  status: StaffStatus;
  lastSeenAt: string | null;
  /** Last sign-in location and browser, e.g. "London · Safari". */
  location: string;
  actions30d: number;
  scope: StaffScope;
  /** Just-in-time Owner elevation expiry, or null when not elevated. */
  elevatedUntil: string | null;
  lastReviewedAt: string | null;
  /** Access review older than 90 days (SOC 2). */
  reviewDue: boolean;
  inviteSentAt: string | null;
  /** Whether this row is the signed-in user (who can't change their own role or suspend themselves). */
  isSelf: boolean;
}

export interface StaffListParams {
  search?: string;
  role?: Role;
  status?: StaffStatus;
  perPage?: number;
}

export interface StaffSummary {
  total: number;
  active: number;
  invited: number;
  suspended: number;
  /** Share of non-invited staff with 2FA enrolled, 0–100. */
  twoFactorCoverage: number;
  withoutTwoFactor: { id: string; name: string }[];
  elevatedNow: number;
  impersonations7d: number;
  reviewsDue: number;
  /** Mirrors the platform setting, so the 2FA warning can say what happens next. */
  requireStaffTwoFactor: boolean;
}

export interface StaffActivity {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  action: string;
  category: AuditCategory;
}

export interface RolePermissions {
  role: Role;
  permissions: Permission[];
  /** Owner always has every permission and can't be edited. */
  locked: boolean;
  members: number;
}

export interface InviteStaffInput {
  email: string;
  role: AssignableRole;
}

export type StaffUpdate = Partial<{ role: AssignableRole; scope: StaffScope }>;

export type StaffAction = 'suspend' | 'reinstate' | 'resend-invite' | 'revoke-sessions' | 'review';
