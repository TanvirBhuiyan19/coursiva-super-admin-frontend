// Screen registry: id, URL, title and the permission needed to open it.
// The sidebar, router, command palette and document titles all read from here.
import type { Permission } from '@/features/auth/permissions';

export interface ScreenDef {
  id: string;
  path: string;
  title: string;
  permission?: Permission;
}

const S = <Id extends string>(id: Id, title: string, permission?: Permission, path = '/' + id) => ({
  id,
  path,
  title,
  ...(permission ? { permission } : {}),
});

export const SCREENS = [
  S('overview', 'Platform overview', undefined, '/'),
  S('tenants', 'Tenants', 'tenants.view'),
  S('support', 'Support', 'support.view'),
  S('revenue', 'Revenue', 'billing.view'),
  S('plans', 'Plans & pricing', 'billing.view'),
  S('ext', 'Extensions & add-ons', 'billing.view', '/extensions'),
  S('growth', 'Growth analytics', 'analytics.view', '/analytics/growth'),
  S('usage', 'Usage & infrastructure', 'analytics.view', '/analytics/usage'),
  S('health', 'System health', 'analytics.view', '/analytics/health'),
  S('ai', 'AI usage & cost', 'analytics.view', '/analytics/ai'),
  S('exp', 'Experiments', 'analytics.view', '/analytics/experiments'),
  S('compliance', 'Compliance & privacy', 'governance.view', '/governance/compliance'),
  S('moderation', 'Trust & moderation', 'governance.view', '/governance/moderation'),
  S('policies', 'Policies & terms', 'governance.view', '/governance/policies'),
  S('regions', 'Data residency', 'governance.view', '/governance/regions'),
  S('abuse', 'Abuse & limits', 'governance.view', '/governance/abuse'),
  S('audit', 'Audit log', 'audit.view'),
  S('flags', 'Flags & system status', 'platform.view', '/platform/flags'),
  S('media', 'Video & storage', 'platform.view', '/platform/media'),
  S('deliver', 'Email deliverability', 'platform.view', '/platform/deliverability'),
  S('credentials', 'Certificate authority', 'platform.view', '/platform/certificates'),
  S('standards', 'Standards & conformance', 'platform.view', '/platform/standards'),
  S('api', 'API & webhooks', 'platform.view', '/platform/api'),
  S('entitlements', 'Plan entitlements', 'platform.view', '/platform/entitlements'),
  S('backup', 'Backup & restore', 'platform.view', '/platform/backup'),
  S('settings', 'Console settings', 'platform.view', '/settings'),
  S('announce', 'Announcements', 'announcements.send', '/announcements'),
  S('staff', 'Platform staff', 'staff.view'),
] as const;

export type ScreenId = (typeof SCREENS)[number]['id'];

export const screenById = Object.fromEntries(SCREENS.map((s) => [s.id, s])) as unknown as Record<ScreenId, ScreenDef>;
export const pathOf = (id: ScreenId) => screenById[id].path;

/** Screen whose path is the longest prefix of `pathname` (so /tenants/tn_x → tenants). */
export function screenForPath(pathname: string): ScreenDef | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return screenById.overview;
  return [...(SCREENS as readonly ScreenDef[])]
    .filter((s) => s.path !== '/' && (clean === s.path || clean.startsWith(s.path + '/')))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  screen?: ScreenId;
  subs?: { screen: ScreenId; label: string }[];
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { id: 'overview', screen: 'overview', label: 'Dashboard', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
      {
        id: 'tenants',
        screen: 'tenants',
        label: 'Tenants',
        icon: 'M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16',
      },
      {
        id: 'support',
        screen: 'support',
        label: 'Support',
        icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
      },
    ],
  },
  {
    label: 'Business',
    items: [
      {
        id: 'revenue',
        label: 'Revenue',
        icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
        subs: [
          { screen: 'revenue', label: 'Billing & dunning' },
          { screen: 'plans', label: 'Plans & pricing' },
          { screen: 'ext', label: 'Extensions' },
        ],
      },
      {
        id: 'analytics',
        label: 'Analytics',
        icon: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
        subs: [
          { screen: 'growth', label: 'Growth' },
          { screen: 'usage', label: 'Usage & infra' },
          { screen: 'health', label: 'System health' },
          { screen: 'ai', label: 'AI usage & cost' },
          { screen: 'exp', label: 'Experiments' },
        ],
      },
    ],
  },
  {
    label: 'Trust & safety',
    items: [
      {
        id: 'governance',
        label: 'Governance',
        icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
        subs: [
          { screen: 'compliance', label: 'Compliance & privacy' },
          { screen: 'moderation', label: 'Trust & moderation' },
          { screen: 'policies', label: 'Policies & terms' },
          { screen: 'regions', label: 'Data residency' },
          { screen: 'abuse', label: 'Abuse & limits' },
          { screen: 'audit', label: 'Audit log' },
        ],
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        id: 'platform',
        label: 'Platform settings',
        icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
        subs: [
          { screen: 'flags', label: 'Flags & status' },
          { screen: 'media', label: 'Video & storage' },
          { screen: 'deliver', label: 'Email deliverability' },
          { screen: 'credentials', label: 'Certificates' },
          { screen: 'standards', label: 'Standards' },
          { screen: 'api', label: 'API & webhooks' },
          { screen: 'entitlements', label: 'Entitlements' },
          { screen: 'backup', label: 'Backup & restore' },
          { screen: 'settings', label: 'Console settings' },
        ],
      },
      { id: 'announce', screen: 'announce', label: 'Announcements', icon: 'M3 11l18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6' },
      {
        id: 'staff',
        screen: 'staff',
        label: 'Platform staff',
        icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
      },
    ],
  },
];
