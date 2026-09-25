// Screen registry: id, URL, title and the permission needed to open it.
// The sidebar, router, command palette and document titles all read from here.
// Titles and nav labels live in `./i18n` and are resolved when read (getters), so they follow the locale.
import type { Permission } from '@/features/auth/permissions';
import { t, type source } from './i18n';

export interface ScreenDef {
  id: string;
  path: string;
  /** Localised title, resolved at read time. */
  readonly title: string;
  permission?: Permission;
}

type ScreenKey = keyof (typeof source)['screens'];

const titleOf = (id: ScreenKey) => t(`screens.${id}`);

const S = <Id extends ScreenKey>(id: Id, permission?: Permission, path = '/' + id) => ({
  id,
  path,
  get title() {
    return titleOf(id);
  },
  ...(permission ? { permission } : {}),
});

export const SCREENS = [
  S('overview', undefined, '/'),
  S('tenants', 'tenants.view'),
  S('support', 'support.view'),
  S('revenue', 'billing.view'),
  S('plans', 'billing.view'),
  S('ext', 'billing.view', '/extensions'),
  S('growth', 'analytics.view', '/analytics/growth'),
  S('usage', 'analytics.view', '/analytics/usage'),
  S('health', 'analytics.view', '/analytics/health'),
  S('ai', 'analytics.view', '/analytics/ai'),
  S('exp', 'analytics.view', '/analytics/experiments'),
  S('compliance', 'governance.view', '/governance/compliance'),
  S('moderation', 'governance.view', '/governance/moderation'),
  S('policies', 'governance.view', '/governance/policies'),
  S('regions', 'governance.view', '/governance/regions'),
  S('abuse', 'governance.view', '/governance/abuse'),
  S('audit', 'audit.view'),
  S('flags', 'platform.view', '/platform/flags'),
  S('media', 'platform.view', '/platform/media'),
  S('deliver', 'platform.view', '/platform/deliverability'),
  S('credentials', 'platform.view', '/platform/certificates'),
  S('standards', 'platform.view', '/platform/standards'),
  S('api', 'platform.view', '/platform/api'),
  S('entitlements', 'platform.view', '/platform/entitlements'),
  S('backup', 'platform.view', '/platform/backup'),
  S('settings', 'platform.view', '/settings'),
  S('announce', 'announcements.send', '/announcements'),
  S('staff', 'staff.view'),
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

/** Localised title of a screen. */
export const screenTitle = (id: ScreenId) => screenById[id].title;

type NavGroupId = keyof (typeof source)['nav']['groups'];
type NavItemId = keyof (typeof source)['nav']['items'];
type NavSubId = keyof (typeof source)['nav']['subs'];

export interface NavSub {
  screen: ScreenId;
  readonly label: string;
}
export interface NavItem {
  id: NavItemId;
  readonly label: string;
  icon: string;
  screen?: ScreenId;
  subs?: NavSub[];
}
export interface NavGroup {
  id: NavGroupId;
  readonly label: string;
  items: NavItem[];
}

const group = (id: NavGroupId, items: NavItem[]): NavGroup => ({
  id,
  items,
  get label() {
    return t(`nav.groups.${id}`);
  },
});
const item = (id: NavItemId, icon: string, target: { screen: ScreenId } | { subs: NavSub[] }): NavItem => ({
  id,
  icon,
  ...target,
  get label() {
    return t(`nav.items.${id}`);
  },
});
const sub = (screen: NavSubId): NavSub => ({
  screen,
  get label() {
    return t(`nav.subs.${screen}`);
  },
});

export const NAV: NavGroup[] = [
  group('main', [
    item('overview', 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', { screen: 'overview' }),
    item('tenants', 'M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16', {
      screen: 'tenants',
    }),
    item(
      'support',
      'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
      { screen: 'support' },
    ),
  ]),
  group('business', [
    item('revenue', 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', { subs: [sub('revenue'), sub('plans'), sub('ext')] }),
    item('analytics', 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6', {
      subs: [sub('growth'), sub('usage'), sub('health'), sub('ai'), sub('exp')],
    }),
  ]),
  group('trust', [
    item('governance', 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4', {
      subs: [sub('compliance'), sub('moderation'), sub('policies'), sub('regions'), sub('abuse'), sub('audit')],
    }),
  ]),
  group('platform', [
    item(
      'platform',
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
      {
        subs: [
          sub('flags'),
          sub('media'),
          sub('deliver'),
          sub('credentials'),
          sub('standards'),
          sub('api'),
          sub('entitlements'),
          sub('backup'),
          sub('settings'),
        ],
      },
    ),
    item('announce', 'M3 11l18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6', { screen: 'announce' }),
    item(
      'staff',
      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
      { screen: 'staff' },
    ),
  ]),
];
