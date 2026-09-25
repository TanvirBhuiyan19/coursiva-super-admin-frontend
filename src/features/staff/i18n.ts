import { defineMessages } from '@/lib/i18n';

export const { t, useT } = defineMessages('staff', {
  // Staff roles (`features/auth/permissions` ROLES) and member statuses as sent by the API.
  roles: { Owner: 'Owner', Admin: 'Admin', Support: 'Support', Finance: 'Finance', 'Read-only': 'Read-only' },
  status: { Active: 'Active', Invited: 'Invited', Suspended: 'Suspended' },
  scopes: { all: 'All tenants', assigned: 'Assigned tenants', enterprise: 'Enterprise only' },

  page: {
    title: 'Platform staff',
    searchPlaceholder: 'Search name or email…',
    searchLabel: 'Search staff',
    filterLabel: 'Filter by role',
    allRoles: 'All roles',
    openAuditLog: 'Open audit log →',
    twoFactorWarning: {
      mustEnroll: '{names} can sign in without 2FA — they must enroll at their next sign-in.',
      requireIt: '{names} can sign in without 2FA — require it in Console settings.',
    },
    openSettings: 'Open settings',
  },

  kpis: {
    staff: 'Staff',
    staffSub: '{invited} invited · {suspended} suspended',
    twoFactor: '2FA coverage',
    twoFactorValue: '{pct}%',
    withoutTwoFactor: '{count} without 2FA',
    everyoneEnrolled: 'Everyone enrolled',
    elevated: 'Elevated now',
    elevatedSub: 'Just-in-time Owner access',
    impersonations: 'Impersonations · 7d',
    impersonationsSub: 'All recorded in the audit log',
  },

  invite: {
    formLabel: 'Invite staff',
    emailLabel: 'Invite email',
    emailPlaceholder: 'colleague@coursiva.io',
    roleLabel: 'Role',
    send: 'Send invite',
    sent: 'Invite sent to {email} as {role} — the link expires in 7 days',
    validation: {
      email: 'Enter a valid work email address.',
      role: 'Choose a role.',
    },
  },

  table: {
    columns: {
      member: 'Member',
      email: 'Email',
      role: 'Role',
      scope: 'Tenant scope',
      twoFactor: '2FA',
      lastActive: 'Last active',
      status: 'Status',
      actions: 'Actions',
    },
    empty: 'No staff match these filters.',
    you: 'You',
    actions30d: { one: '{count} action · 30d', other: '{count} actions · 30d' },
    roleFor: 'Role for {name}',
    scopeFor: 'Tenant scope for {name}',
    invitedAgo: 'Invited {ago}',
    yourAccount: 'Your account',
  },

  actions: {
    resendInvite: 'Resend invite',
    resendInviteFor: 'Resend invite to {name}',
    reinstate: 'Reinstate',
    reinstateFor: 'Reinstate {name}',
    elevate: 'Elevate',
    elevateTitle: 'Just-in-time Owner access for 60 minutes',
    elevateFor: 'Elevate {name} to Owner for 60 minutes',
    revokeElevationFor: 'Revoke elevation for {name}',
    elevatedLeft: 'Elevated · {minutes}m left',
    signOutFor: 'Sign {name} out of all sessions',
    suspend: 'Suspend',
    confirmSuspend: 'Confirm suspend',
  },

  toasts: {
    inviteResent: 'Invite re-sent to {email} — expires in 7 days',
    reinstated: '{name} reinstated — they can sign in again',
    elevationRevoked: 'Elevation revoked for {name}',
    elevated: '{name} elevated to Owner for 60 minutes — logged and auto-expiring',
    signedOut: '{name} signed out of every session — they’ll need to sign in again',
    suspended: '{name} suspended — sessions revoked immediately, sign-in blocked',
    roleChanged: '{name} is now {role}',
    scoped: {
      all: '{name} scoped to all tenants',
      assigned: '{name} scoped to assigned tenants',
      enterprise: '{name} scoped to enterprise only',
    },
    accessConfirmed: '{name}’s access confirmed — next review in 90 days',
  },

  accessReview: {
    title: 'Quarterly access review',
    intro: 'SOC 2 expects every staff account to be re-confirmed every 90 days.',
    empty: 'No accounts to review.',
    lastReviewed: 'Last reviewed {ago}',
    neverReviewed: 'Never reviewed',
    reviewDue: 'Review due',
    current: 'Current',
    confirmFor: 'Confirm {name}’s access',
  },

  activity: {
    title: 'Recent staff activity',
    fullLog: 'Full log →',
    empty: 'No staff activity yet.',
  },

  permissions: {
    /** Labels per permission id: `labels.<area>.<action>` mirrors `tenants.view` etc. */
    labels: {
      tenants: {
        view: 'View tenants',
        manage: 'Manage tenants',
        suspend: 'Suspend tenants',
        impersonate: 'Impersonate tenants',
        purge: 'Purge tenant data',
      },
      billing: { view: 'View billing', manage: 'Manage billing & pricing', refund: 'Issue refunds' },
      support: { view: 'View support', manage: 'Handle tickets' },
      analytics: { view: 'View analytics' },
      governance: { view: 'View governance', manage: 'Manage governance' },
      platform: { view: 'View platform settings', manage: 'Manage platform settings' },
      flags: { manage: 'Manage feature flags' },
      announcements: { send: 'Send announcements' },
      staff: { view: 'View staff', manage: 'Manage staff' },
      audit: { view: 'View audit log' },
    },
    title: 'Role permissions',
    introManage:
      'What each staff role can do. Owner is locked — click any other cell to change it. Changes apply to everyone in the role immediately and are recorded in the audit log.',
    introView:
      'What each staff role can do. Owner is locked — you can view the matrix. Changes apply to everyone in the role immediately and are recorded in the audit log.',
    permission: 'Permission',
    members: { one: '{count} member', other: '{count} members' },
    cellLabel: '{permission} — {role}',
    cellLabelLocked: '{permission} — {role} (locked)',
    groups: {
      tenants: 'Tenants',
      billing: 'Billing',
      support: 'Support',
      analytics: 'Analytics',
      governance: 'Governance',
      platform: 'Platform',
      staffAudit: 'Staff & audit',
      ungrouped: 'Other',
    },
    toasts: {
      granted: {
        one: '{permission} granted to {role} — {count} member gets it on their next request',
        other: '{permission} granted to {role} — {count} members get it on their next request',
      },
      removed: {
        one: '{permission} removed from {role} — {count} member loses it on their next request',
        other: '{permission} removed from {role} — {count} members lose it on their next request',
      },
    },
  },
});
