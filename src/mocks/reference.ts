// Server-side reference data for the mock API (what Laravel would keep in config or seeders).
import type { Limits, Plan } from '@/lib/domain';

export const LIST_PRICE: Record<Plan, number> = { Launch: 99, Growth: 399, Scale: 899 };

/** Plan default limits (`0` = unlimited). Live-room minutes come from the live-room policy instead. */
export const PLAN_LIMITS: Record<Plan, Omit<Limits, 'liveRoomMinutes'>> = {
  Launch: { storageGb: 50, staffSeats: 3, apiPerMinute: 60, students: 500, courses: 5 },
  Growth: { storageGb: 500, staffSeats: 10, apiPerMinute: 300, students: 10000, courses: 0 },
  Scale: { storageGb: 2000, staffSeats: 25, apiPerMinute: 1000, students: 0, courses: 0 },
};

export const LIVE_ROOM_DEFAULTS: Record<Plan, number> = { Launch: 0, Growth: 2000, Scale: 10000 };

export interface ExtensionDef {
  key: string;
  module: string;
  name: string;
  category: string;
  price: number;
  freeFrom: Plan | null;
  installs: number;
  status: 'Live' | 'Beta';
  blurb: string;
  /** When true the extension gates the whole tenant module; otherwise it's an upsell inside it. */
  gatesModule: boolean;
}

export const EXTENSIONS: ExtensionDef[] = [
  {
    key: 'ai',
    module: 'aistudio',
    name: 'AI studio',
    category: 'Content',
    price: 29,
    freeFrom: 'Scale',
    installs: 6,
    status: 'Live',
    blurb: 'Draft lessons, quizzes and marketing copy; auto captions and translations',
    gatesModule: true,
  },
  {
    key: 'app',
    module: 'mobileapp',
    name: 'White-label mobile app',
    category: 'Channels',
    price: 49,
    freeFrom: 'Scale',
    installs: 4,
    status: 'Live',
    blurb: 'iOS and Android apps published under the tenant’s own developer accounts',
    gatesModule: true,
  },
  {
    key: 'drm',
    module: 'media',
    name: 'Video DRM & watermarking',
    category: 'Security',
    price: 39,
    freeFrom: null,
    installs: 3,
    status: 'Live',
    blurb: 'Widevine/FairPlay encryption, dynamic overlays and PDF stamping',
    gatesModule: false,
  },
  {
    key: 'exam',
    module: 'quizbuilder',
    name: 'Proctored exams',
    category: 'Assessment',
    price: 35,
    freeFrom: null,
    installs: 2,
    status: 'Beta',
    blurb: 'Locked exam sessions, identity checks and flag reports',
    gatesModule: false,
  },
  {
    key: 'rooms',
    module: 'liveadmin',
    name: 'Built-in live rooms',
    category: 'Delivery',
    price: 29,
    freeFrom: 'Growth',
    installs: 7,
    status: 'Live',
    blurb: 'Host classes in-browser instead of connecting Zoom, Meet or Teams',
    gatesModule: true,
  },
  {
    key: 'spaces',
    module: 'community',
    name: 'Community spaces',
    category: 'Engagement',
    price: 25,
    freeFrom: 'Growth',
    installs: 9,
    status: 'Live',
    blurb: 'Public, members-only, per-course and cohort spaces with moderation',
    gatesModule: true,
  },
  {
    key: 'ads',
    module: 'channels',
    name: 'Ads & channels hub',
    category: 'Marketing',
    price: 25,
    freeFrom: 'Scale',
    installs: 5,
    status: 'Live',
    blurb: 'Google, Meta, TikTok and LinkedIn campaigns, attribution and SEO',
    gatesModule: true,
  },
  {
    key: 'aff',
    module: 'affiliates',
    name: 'Affiliate program',
    category: 'Marketing',
    price: 19,
    freeFrom: 'Growth',
    installs: 8,
    status: 'Live',
    blurb: 'Partner tiers, referral links, commissions and payout runs',
    gatesModule: true,
  },
  {
    key: 'scorm',
    module: 'studentxp',
    name: 'SCORM & xAPI',
    category: 'Standards',
    price: 19,
    freeFrom: null,
    installs: 4,
    status: 'Live',
    blurb: 'Import SCORM packages and stream xAPI statements to an LRS',
    gatesModule: false,
  },
  {
    key: 'cred',
    module: 'certs',
    name: 'Advanced credentials',
    category: 'Assessment',
    price: 15,
    freeFrom: null,
    installs: 5,
    status: 'Live',
    blurb: 'Open Badges 3.0, Credly mirroring and a public verification page',
    gatesModule: false,
  },
  {
    key: 'i18n',
    module: 'branding',
    name: 'Multi-language',
    category: 'Content',
    price: 19,
    freeFrom: 'Scale',
    installs: 3,
    status: 'Live',
    blurb: 'Translate lessons, storefront and app copy with review before publishing',
    gatesModule: false,
  },
  {
    key: 'api',
    module: 'integrations',
    name: 'API & webhooks',
    category: 'Developer',
    price: 15,
    freeFrom: 'Scale',
    installs: 6,
    status: 'Live',
    blurb: 'REST API, signed webhooks and Zapier/Make connectors',
    gatesModule: false,
  },
];

export interface ModuleDef {
  id: string;
  label: string;
  group: string;
  /** Lowest plan tier that includes the module (1 Launch · 2 Growth · 3 Scale). */
  tier: 1 | 2 | 3;
  core: boolean;
}

const mods = (group: string, rows: [string, string, 1 | 2 | 3, 0 | 1][]): ModuleDef[] =>
  rows.map(([id, label, tier, core]) => ({ id, label, group, tier, core: !!core }));

/** Tenant-dashboard modules, grouped as in the tenant nav. */
export const MODULES: ModuleDef[] = [
  ...mods('Main', [
    ['dashboard', 'Dashboard', 1, 1],
    ['inbox', 'Inbox', 1, 0],
    ['analytics', 'Analytics', 1, 0],
    ['vidanalytics', 'Video analytics', 2, 0],
  ]),
  ...mods('Learning', [
    ['courses', 'Courses', 1, 1],
    ['builder', 'Course builder', 1, 1],
    ['quizbuilder', 'Quiz builder', 2, 0],
    ['assignments', 'Assignments', 2, 0],
    ['reviews', 'Reviews', 2, 0],
    ['liveadmin', 'Live classes', 2, 0],
    ['media', 'Media library', 1, 1],
    ['certs', 'Certificates', 2, 0],
    ['aistudio', 'AI studio', 3, 0],
  ]),
  ...mods('Audience', [
    ['students', 'Students', 1, 1],
    ['groups', 'Groups & seats', 2, 0],
    ['forms', 'Forms & leads', 1, 0],
    ['community', 'Community', 2, 0],
    ['campaigns', 'Email campaigns', 2, 0],
    ['sms', 'SMS & WhatsApp', 2, 0],
    ['automations', 'Automations', 2, 0],
    ['channels', 'Ads & channels', 3, 0],
  ]),
  ...mods('Sales', [
    ['products', 'Products', 1, 0],
    ['memberships', 'Memberships', 2, 0],
    ['orders', 'Orders & payouts', 1, 1],
    ['coupons', 'Coupons & offers', 1, 0],
    ['affiliates', 'Affiliates & partners', 3, 0],
  ]),
  ...mods('Website & app', [
    ['sitebuilder', 'Site builder', 1, 0],
    ['blog', 'Blog', 1, 0],
    ['seo', 'SEO', 2, 0],
    ['branding', 'Branding & domain', 1, 0],
    ['mobileapp', 'Mobile app', 3, 0],
    ['studentxp', 'Student experience', 2, 0],
  ]),
  ...mods('Settings', [
    ['settings', 'General & team', 1, 1],
    ['integrations', 'Integrations & API', 2, 0],
    ['emailsettings', 'Sending & senders', 1, 0],
    ['billing', 'Plan & billing', 1, 1],
    ['audit', 'Audit log', 2, 0],
  ]),
];

export const FEATURE_FLAGS = [
  {
    key: 'site_builder_v2',
    name: 'New site builder (beta)',
    description: 'Drag-and-drop storefront editor with 250+ blocks',
    enabled: true,
  },
  { key: 'ai_outline', name: 'AI outline assistant', description: 'Generate course modules from a topic prompt', enabled: true },
  { key: 'multi_currency', name: 'Multi-currency checkout', description: 'EUR, GBP and BRL pricing at checkout', enabled: false },
  { key: 'affiliates', name: 'Affiliate module', description: 'Partner links, commissions and payouts', enabled: true },
  { key: 'pwa_apps', name: 'PWA mobile apps', description: 'Installable branded apps without app stores', enabled: false },
] as const;

/** Flags a tenant can override individually (shown in the tenant drawer). */
export const TENANT_OVERRIDABLE_FLAGS = ['site_builder_v2', 'ai_outline', 'multi_currency'];
