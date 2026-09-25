// Staff roles and permissions. The server is authoritative: `/auth/me` returns the signed-in
// user's effective permissions and every endpoint enforces them. The UI only hides/disables.
// This file is also the spec for the Laravel roles/permissions seeder and policies.

export const PERMISSIONS = [
  'tenants.view',
  'tenants.manage', // plan, limits, entitlements, region, notes, provisioning
  'tenants.suspend',
  'tenants.impersonate',
  'tenants.purge',
  'billing.view',
  'billing.manage', // dunning, overages, invoices, pricing, promos, extensions
  'billing.refund',
  'support.view',
  'support.manage',
  'analytics.view',
  'governance.view',
  'governance.manage', // DSARs, moderation, policies, residency, abuse
  'platform.view',
  'platform.manage', // media, deliverability, certificates, standards, API keys, backup, settings
  'flags.manage',
  'announcements.send',
  'staff.view',
  'staff.manage',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['Owner', 'Admin', 'Support', 'Finance', 'Read-only'] as const;
export type Role = (typeof ROLES)[number];

const VIEW: Permission[] = PERMISSIONS.filter((p) => p.endsWith('.view'));

/** Default permissions per role. Owner always has everything. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  Owner: PERMISSIONS,
  Admin: PERMISSIONS.filter((p) => p !== 'tenants.purge'),
  Support: [...VIEW.filter((p) => p !== 'billing.view'), 'support.manage', 'tenants.impersonate'],
  Finance: ['tenants.view', 'billing.view', 'billing.manage', 'billing.refund', 'analytics.view', 'audit.view'],
  'Read-only': VIEW,
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  'tenants.view': 'View tenants',
  'tenants.manage': 'Manage tenants',
  'tenants.suspend': 'Suspend tenants',
  'tenants.impersonate': 'Impersonate tenants',
  'tenants.purge': 'Purge tenant data',
  'billing.view': 'View billing',
  'billing.manage': 'Manage billing & pricing',
  'billing.refund': 'Issue refunds',
  'support.view': 'View support',
  'support.manage': 'Handle tickets',
  'analytics.view': 'View analytics',
  'governance.view': 'View governance',
  'governance.manage': 'Manage governance',
  'platform.view': 'View platform settings',
  'platform.manage': 'Manage platform settings',
  'flags.manage': 'Manage feature flags',
  'announcements.send': 'Send announcements',
  'staff.view': 'View staff',
  'staff.manage': 'Manage staff',
  'audit.view': 'View audit log',
};
