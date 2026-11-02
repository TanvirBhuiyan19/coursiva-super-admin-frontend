// Mock implementation of /media (what the Laravel MediaSettingsController will do).
// Live-room allowances live in the shared `liveRoomAllowance` table (tenant limits read it);
// everything else is media-only settings. Credentials are stored server-side and never returned —
// GET responses carry `configured` + the last four characters.
import { liveRoomAllowance, tenants } from '@/mocks/collections';
import { ago, singleton } from '@/mocks/db';
import { effectiveLimits } from '@/mocks/derive';
import { toConnection as baseConnection, mergeCredentials, type CredentialDef, type CredentialFieldDef } from '@/mocks/credentials';
import { authorize, handle, http, invalid, notFound, ok, readBody, recordAudit, requireRecentPassword, route } from '@/mocks/http';
import { PLANS } from '@/lib/domain';
import {
  DRM_AVAILABILITY,
  DRM_AVAILABILITY_LABELS,
  DRM_PROTECTIONS,
  DRM_SECURITY_LEVEL_LABELS,
  DRM_SECURITY_LEVELS,
  LIVE_ROOM_POLICIES,
  RENDITION_LADDER_LABELS,
  RENDITION_LADDERS,
  WATERMARK_STYLE_LABELS,
  WATERMARK_STYLES,
  type Connection,
  type CredentialsInput,
  type DrmAvailability,
  type DrmProtectionKey,
  type DrmSecurityLevel,
  type DrmSettings,
  type DrmUpdate,
  type LiveRoomPolicyKey,
  type LiveRoomSettings,
  type LiveRoomUpdate,
  type RenditionLadder,
  type StorageSettings,
  type StorageUpdate,
  type WatermarkStyle,
} from './types';

// ---------- Reference ----------
const LR_POLICIES: Record<LiveRoomPolicyKey, [string, string]> = {
  pull_recordings: ['Allow pulling provider recordings into tenant storage', 'Counts against the tenant’s storage and inherits their DRM.'],
  fallback_to_built_in: ['Fall back to built-in rooms on provider failure', 'Keeps classes running when a tenant’s token is revoked.'],
};

const DRM: Record<DrmProtectionKey, [string, string, boolean]> = {
  encryption: ['AES-128 stream encryption', 'All video is encrypted at rest and in transit. Cannot be disabled.', true],
  hardware_drm: ['Hardware DRM (Widevine / FairPlay)', 'License-based playback on web, iOS and Android.', false],
  watermark: ['Dynamic viewer watermark', 'Overlays the student’s email + IP on playback.', false],
  block_capture: [
    'Block downloads & screen capture',
    'Disables native download and blackouts screen recording where the OS allows.',
    false,
  ],
  geo_restrictions: ['Geo & VPN restrictions', 'Tenants can allow-list countries; known VPN exits are challenged.', false],
};

type Kind = 'drm' | 'storage';
interface ConnectionDef extends CredentialDef {
  kind: Kind;
}

const f = (key: string, label: string, secret = true, extra: Pick<CredentialFieldDef, 'optional' | 'check' | 'maxLength'> = {}) => ({
  key,
  label,
  secret,
  ...extra,
});
const alnumId = (message: string) => (v: string) => (/^[A-Za-z0-9]{8,128}$/.test(v) ? undefined : message);
const oneOf =
  (label: string, ...options: string[]) =>
  (v: string) =>
    options.includes(v) ? undefined : `The ${label} must be ${options.join(' or ')}.`;

/**
 * The backend's MuxCredentials::pem: Mux shows the signing key's private half as base64 of a PEM (a pasted PEM
 * also works); anything that isn't an RSA private key is refused. The browser can't parse the key with openssl,
 * so the mock checks the PEM armour of the decoded text instead.
 */
function isRsaPrivateKey(pasted: string): boolean {
  let pem = pasted;
  if (!pem.includes('-----BEGIN')) {
    try {
      pem = atob(pem);
    } catch {
      return false;
    }
  }
  return /-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----/.test(pem);
}

export const CONNECTIONS: ConnectionDef[] = [
  {
    // Transcoding (backend docs/storage-and-media.md): the signing key's private half signs every playback URL,
    // the webhook secret verifies asset events at {API}/api/v1/webhooks/mux, and a DRM configuration turns on Mux DRM.
    key: 'mux',
    kind: 'drm',
    name: 'Mux',
    description: 'Video hosting · encoding · signed playback URLs',
    role: null,
    fields: [
      f('token_id', 'Token ID'),
      f('token_secret', 'Token secret'),
      f('signing_key_id', 'Signing key ID', true, { check: alnumId('The signing key ID is letters and digits only.') }),
      f('signing_private_key', 'Signing private key (base64, as Mux shows it)', true, {
        check: (v) => (isRsaPrivateKey(v) ? undefined : 'Paste the base64 private key Mux showed when the signing key was created.'),
        maxLength: 8192, // Mux's base64 of a 2048-bit RSA PEM is ~2,200 characters
      }),
      f('webhook_secret', 'Webhook signing secret', true, { optional: true }),
      f('drm_configuration_id', 'DRM configuration ID', false, {
        optional: true,
        check: alnumId('The DRM configuration ID is letters and digits only (Mux → Settings → Digital Rights Management).'),
      }),
    ],
  },
  {
    key: 'ezdrm',
    kind: 'drm',
    name: 'EZDRM',
    description: 'Widevine + FairPlay + PlayReady license server',
    role: null,
    fields: [f('username', 'Username', false), f('password', 'Password'), f('fairplay_cert_url', 'FairPlay cert URL', false)],
  },
  {
    key: 'keyos',
    kind: 'drm',
    name: 'BuyDRM KeyOS',
    description: 'Alternative multi-DRM license service',
    role: null,
    fields: [f('api_key', 'API key'), f('server_key', 'Server key')],
  },
  {
    key: 'r2',
    kind: 'storage',
    name: 'Cloudflare R2',
    description: 'Delivery — HLS renditions behind Cloudflare CDN · zero egress',
    role: 'Hot delivery',
    fields: [
      f('account_id', 'Account ID', false),
      f('access_key_id', 'Access key ID'),
      f('secret_access_key', 'Secret access key'),
      f('bucket', 'Bucket', false),
    ],
  },
  {
    key: 's3',
    kind: 'storage',
    name: 'AWS S3',
    description: 'Masters — original uploads · lifecycle to Glacier Deep Archive',
    role: 'Archive masters',
    fields: [
      f('access_key_id', 'Access key ID'),
      f('secret_access_key', 'Secret access key'),
      f('region', 'Region', false),
      f('bucket', 'Bucket', false),
    ],
  },
  {
    // Public images (backend docs/connections.md → Public assets): logos, covers, thumbnails and the platform's brand
    // images, loaded straight from the bucket's public URL. The backend verifies it by writing a probe file, reading
    // it back, fetching it through the public base URL and deleting it.
    key: 'public_assets',
    kind: 'storage',
    name: 'Public assets',
    description:
      'Public images — school logos, course covers, product thumbnails and the platform’s brand images · a Cloudflare R2 or AWS S3 bucket served from a public URL (custom domain or CDN)',
    role: 'Public images',
    fields: [
      {
        ...f('provider', 'Provider', false, { optional: true, check: oneOf('provider', 'r2', 's3') }),
        options: [
          { value: 'r2', label: 'Cloudflare R2' },
          { value: 's3', label: 'AWS S3' },
        ],
        default: 'r2',
      },
      f('account_id', 'Account ID (R2)', false, {
        optional: true,
        check: (v) => (/^[0-9a-f]{32}$/i.test(v) ? undefined : 'The account ID is 32 hexadecimal characters.'),
      }),
      f('region', 'Region (S3)', false, {
        optional: true,
        check: (v) => (/^[a-z]{2}(-[a-z]+)+-\d$/.test(v) ? undefined : 'The region looks like eu-west-1.'),
      }),
      f('access_key_id', 'Access key ID'),
      f('secret_access_key', 'Secret access key'),
      f('bucket', 'Bucket', false),
      f('public_url', 'Public base URL', false, {
        check: (v) =>
          /^https:\/\/[^\s/?#@]+(\/[^\s?#]*)?$/.test(v)
            ? undefined
            : 'The public base URL is the https:// address that serves the bucket, e.g. https://assets.example.com.',
      }),
      {
        ...f('acl', 'Object ACL', false, { optional: true, check: oneOf('ACL', 'none', 'public-read') }),
        options: [
          { value: 'none', label: 'None (bucket policy)' },
          { value: 'public-read', label: 'public-read' },
        ],
        default: 'none',
      },
    ],
    // The provider's location field is required (the backend answers it on that field).
    verify: (v) => {
      const [field, label] = v.provider === 's3' ? ['region', 'Region (S3)'] : ['account_id', 'Account ID (R2)'];
      if (!v[field]) throw invalid({ [`credentials.${field}`]: `Enter the ${label}.` });
      return undefined;
    },
  },
];

const PIPELINE: StorageSettings['pipeline'] = [
  { step: 'Upload', description: 'Direct multipart from tenant dashboards → S3 masters', healthy: true },
  { step: 'Transcode', description: 'ffmpeg workers · HLS ladder + CENC encryption · queue: 3 jobs', healthy: true },
  { step: 'Deliver', description: 'R2 → Cloudflare CDN · signed URLs · 97% cache hit', healthy: true },
  { step: 'Archive', description: 'Masters → Glacier Deep Archive after lifecycle window', healthy: true },
];

const DRM_STATS = [
  { label: 'Protected streams · 30d', value: '48,210' },
  { label: 'Blocked capture attempts', value: '312' },
  { label: 'License errors', value: '0.04%' },
  { label: 'Takedown requests', value: '2 resolved' },
];
const STORAGE_STATS = [
  { label: 'Video stored', value: '38.4 TB' },
  { label: 'Delivered · 30d', value: '182 TB' },
  { label: 'Egress cost · 30d', value: '$0 (R2)' },
  { label: 'Est. monthly savings vs S3+CloudFront', value: '$14,890' },
];

// ---------- Media-only settings ----------
interface MediaStore {
  liveRoomPoliciesOff: LiveRoomPolicyKey[];
  /** Built-in room minutes used this month (usage meter). */
  liveRoomUsage: { tenantId: string; usedMinutes: number }[];
  drmOff: DrmProtectionKey[];
  securityLevel: DrmSecurityLevel;
  watermarkStyle: WatermarkStyle;
  deviceLeases: number;
  availableOn: DrmAvailability;
  keysRotatedAt: string;
  /** Stored credentials per connection (server-side only). */
  credentials: { connection: string; values: Record<string, string>; verifiedAt: string }[];
  archiveAfterDays: number;
  renditionLadder: RenditionLadder;
  directUploads: boolean;
  footprint: { tenantId: string; storageTb: number; bandwidthTb: number }[];
  othersFootprint: { storageTb: number; bandwidthTb: number };
}

const cred = (connection: string, values: Record<string, string>, verifiedAt: string) => ({ connection, values, verifiedAt });

export const mediaStore = singleton<MediaStore>('mediaSettings', () => ({
  liveRoomPoliciesOff: [],
  liveRoomUsage: [
    { tenantId: 'tn_amplify', usedMinutes: 1840 },
    { tenantId: 'tn_nordic', usedMinutes: 6100 },
    { tenantId: 'tn_devpath', usedMinutes: 11600 },
    { tenantId: 'tn_silva', usedMinutes: 680 },
  ],
  drmOff: [],
  securityLevel: 'widevine_l3_fairplay',
  watermarkStyle: 'email',
  deviceLeases: 6,
  availableOn: 'growth',
  keysRotatedAt: ago({ d: 41 }),
  credentials: [
    cred(
      'mux',
      {
        token_id: 'mux-tok-51d8a0c2',
        token_secret: 'mux-sec-f02b7e19c4d3',
        signing_key_id: 'muxSig8c1e',
        // base64 of a (fake) PEM, as Mux shows it once when the signing key is created.
        signing_private_key:
          'LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFb3dJQkFBS0NBUUVBbW9ja0tleQotLS0tLUVORCBSU0EgUFJJVkFURSBLRVktLS0tLQo=',
      },
      ago({ d: 63 }),
    ),
    cred(
      'r2',
      {
        account_id: '7f2c91d0e4ab4c55',
        access_key_id: 'r2-ak-3be90f4a',
        secret_access_key: 'r2-sk-c8d27f1e90ab',
        bucket: 'coursiva-media',
      },
      ago({ d: 120 }),
    ),
    cred(
      's3',
      { access_key_id: 'AKIA4MOCK2Q7WXY9', secret_access_key: 's3-sk-0a9d4e7b2f61', region: 'eu-west-1', bucket: 'coursiva-masters' },
      ago({ d: 120 }),
    ),
  ],
  archiveAfterDays: 90,
  renditionLadder: 'standard',
  directUploads: true,
  footprint: [
    { tenantId: 'tn_devpath', storageTb: 9.8, bandwidthTb: 41 },
    { tenantId: 'tn_peak', storageTb: 7.2, bandwidthTb: 38 },
    { tenantId: 'tn_nordic', storageTb: 6.4, bandwidthTb: 31 },
  ],
  othersFootprint: { storageTb: 15, bandwidthTb: 72 },
}));

// ---------- Resources ----------
function toConnection(def: ConnectionDef): Connection {
  return baseConnection(
    def,
    mediaStore.get().credentials.find((c) => c.connection === def.key),
  );
}

function liveRooms(): LiveRoomSettings {
  const s = mediaStore.get();
  const allowance = liveRoomAllowance.get();
  return {
    policies: LIVE_ROOM_POLICIES.map((key) => ({
      key,
      label: LR_POLICIES[key][0],
      description: LR_POLICIES[key][1],
      enabled: !s.liveRoomPoliciesOff.includes(key),
    })),
    allowances: PLANS.map((plan) => ({ plan, minutes: allowance[plan] })),
    overageRate: 0.004,
    topUp: { minutes: 1000, price: 12 },
    usage: s.liveRoomUsage.flatMap(({ tenantId, usedMinutes }) => {
      const t = tenants.find(tenantId);
      if (!t) return [];
      const cap = effectiveLimits(t).liveRoomMinutes;
      return [
        {
          tenantId,
          name: t.name,
          plan: t.plan,
          usedMinutes: cap ? usedMinutes : 0,
          allowanceMinutes: cap,
          status: cap === 0 ? ('byo' as const) : usedMinutes > cap ? ('over' as const) : ('within' as const),
        },
      ];
    }),
  };
}

function drm(): DrmSettings {
  const s = mediaStore.get();
  return {
    stats: DRM_STATS,
    protections: DRM_PROTECTIONS.map((key) => ({
      key,
      label: DRM[key][0],
      description: DRM[key][1],
      locked: DRM[key][2],
      enabled: DRM[key][2] || !s.drmOff.includes(key),
    })),
    securityLevel: s.securityLevel,
    watermarkStyle: s.watermarkStyle,
    deviceLeases: s.deviceLeases,
    availableOn: s.availableOn,
    providers: CONNECTIONS.filter((c) => c.kind === 'drm').map(toConnection),
    keysRotatedAt: s.keysRotatedAt,
  };
}

function storage(): StorageSettings {
  const s = mediaStore.get();
  const named = s.footprint.flatMap((row) => {
    const t = tenants.find(row.tenantId);
    return t ? [{ tenantId: t.id, name: t.name, storageTb: row.storageTb, bandwidthTb: row.bandwidthTb }] : [];
  });
  const others = Math.max(0, tenants.all().length - named.length);
  return {
    stats: STORAGE_STATS,
    backends: CONNECTIONS.filter((c) => c.kind === 'storage').map(toConnection),
    pipeline: PIPELINE,
    archiveAfterDays: s.archiveAfterDays,
    renditionLadder: s.renditionLadder,
    directUploads: s.directUploads,
    footprint: [...named, { tenantId: null, name: `All others (${others})`, ...s.othersFootprint }],
  };
}

// ---------- Helpers ----------
const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const toggleList = <K>(list: K[], key: K, enabled: boolean) => (enabled ? list.filter((k) => k !== key) : [...new Set([...list, key])]);

function findConnection(kind: Kind, key: string | readonly string[] | undefined) {
  const def = CONNECTIONS.find((c) => c.kind === kind && c.key === key);
  if (!def) throw notFound(kind === 'drm' ? 'DRM provider' : 'Storage backend');
  return def;
}

async function connect(kind: Kind, key: string | readonly string[] | undefined, request: Request) {
  authorize('platform.manage');
  requireRecentPassword();
  const def = findConnection(kind, key);
  const { credentials } = await readBody<CredentialsInput>(request);
  const stored = mediaStore.get().credentials.find((c) => c.connection === def.key);
  const values = mergeCredentials(def, stored, credentials);
  const rest = mediaStore.get().credentials.filter((c) => c.connection !== def.key);
  mediaStore.patch({ credentials: [...rest, { connection: def.key, values, verifiedAt: new Date().toISOString() }] });
  const what = kind === 'drm' ? 'DRM provider' : 'storage backend';
  recordAudit(stored ? `Updated credentials for ${what} ${def.name}` : `Connected ${what} ${def.name}`, 'Security');
  return ok(toConnection(def));
}

function disconnect(kind: Kind, key: string | readonly string[] | undefined) {
  authorize('platform.manage');
  requireRecentPassword();
  const def = findConnection(kind, key);
  const s = mediaStore.get();
  if (s.credentials.some((c) => c.connection === def.key)) {
    mediaStore.patch({ credentials: s.credentials.filter((c) => c.connection !== def.key) });
    recordAudit(`Disconnected ${kind === 'drm' ? 'DRM provider' : 'storage backend'} ${def.name}`, 'Security');
  }
  return ok(toConnection(def));
}

type Params = { key: string };

export const handlers = [
  // ----- Live rooms -----
  http.get(
    route('/media/live-rooms'),
    handle(() => {
      authorize('platform.view');
      return ok(liveRooms());
    }),
  ),

  http.patch(
    route('/media/live-rooms'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<LiveRoomUpdate>(request);
      const errors: Record<string, string> = {};
      (body.policies ?? []).forEach((p, i) => {
        if (!LIVE_ROOM_POLICIES.includes(p.key)) errors[`policies.${i}.key`] = 'Unknown live-room policy.';
        else if (typeof p.enabled !== 'boolean') errors[`policies.${i}.enabled`] = 'Enabled must be true or false.';
      });
      (body.allowances ?? []).forEach((a, i) => {
        if (!PLANS.includes(a.plan)) errors[`allowances.${i}.plan`] = 'The selected plan is invalid.';
        else if (!isWhole(a.minutes) || a.minutes < 0 || a.minutes > 1_000_000)
          errors[`allowances.${i}.minutes`] = 'Minutes must be a whole number from 0 to 1,000,000 (0 = BYO provider only).';
      });
      if (Object.keys(errors).length) throw invalid(errors);

      for (const p of body.policies ?? []) {
        const off = mediaStore.get().liveRoomPoliciesOff;
        if (p.enabled === !off.includes(p.key)) continue;
        mediaStore.patch({ liveRoomPoliciesOff: toggleList(off, p.key, p.enabled) });
        recordAudit(`${p.enabled ? 'Turned on' : 'Turned off'} live-room policy "${LR_POLICIES[p.key][0]}"`, 'Flags');
      }
      for (const a of body.allowances ?? []) {
        const cur = liveRoomAllowance.get();
        if (cur[a.plan] === a.minutes) continue;
        liveRoomAllowance.set({ ...cur, [a.plan]: a.minutes });
        recordAudit(
          a.minutes
            ? `Set ${a.plan} built-in room allowance to ${a.minutes.toLocaleString('en-US')} min/mo`
            : `Turned off built-in rooms for ${a.plan} (BYO provider only)`,
          'Billing',
        );
      }
      return ok(liveRooms());
    }),
  ),

  // ----- DRM -----
  http.get(
    route('/media/drm'),
    handle(() => {
      authorize('platform.view');
      return ok(drm());
    }),
  ),

  http.patch(
    route('/media/drm'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<DrmUpdate>(request);
      const errors: Record<string, string> = {};
      (body.protections ?? []).forEach((p, i) => {
        if (!DRM_PROTECTIONS.includes(p.key)) errors[`protections.${i}.key`] = 'Unknown protection.';
        else if (typeof p.enabled !== 'boolean') errors[`protections.${i}.enabled`] = 'Enabled must be true or false.';
        else if (DRM[p.key][2] && !p.enabled) errors[`protections.${i}.enabled`] = `${DRM[p.key][0]} can’t be turned off.`;
      });
      if (body.securityLevel !== undefined && !DRM_SECURITY_LEVELS.includes(body.securityLevel))
        errors.securityLevel = 'The selected security level is invalid.';
      if (body.watermarkStyle !== undefined && !WATERMARK_STYLES.includes(body.watermarkStyle))
        errors.watermarkStyle = 'The selected watermark style is invalid.';
      if (body.availableOn !== undefined && !DRM_AVAILABILITY.includes(body.availableOn))
        errors.availableOn = 'The selected plan gate is invalid.';
      if (body.deviceLeases !== undefined && (!isWhole(body.deviceLeases) || body.deviceLeases < 1 || body.deviceLeases > 20))
        errors.deviceLeases = 'Device leases must be a whole number from 1 to 20.';
      if (Object.keys(errors).length) throw invalid(errors);

      const s = mediaStore.get();
      for (const p of body.protections ?? []) {
        const off = mediaStore.get().drmOff;
        if (DRM[p.key][2] || p.enabled === !off.includes(p.key)) continue;
        mediaStore.patch({ drmOff: toggleList(off, p.key, p.enabled) });
        recordAudit(`${DRM[p.key][0]} ${p.enabled ? 'enabled' : 'disabled'} platform-wide`, 'Security');
      }
      if (body.securityLevel !== undefined && body.securityLevel !== s.securityLevel) {
        mediaStore.patch({ securityLevel: body.securityLevel });
        recordAudit(`DRM security level set to ${DRM_SECURITY_LEVEL_LABELS[body.securityLevel]}`, 'Security');
      }
      if (body.watermarkStyle !== undefined && body.watermarkStyle !== s.watermarkStyle) {
        mediaStore.patch({ watermarkStyle: body.watermarkStyle });
        recordAudit(`Watermark style set to ${WATERMARK_STYLE_LABELS[body.watermarkStyle]}`, 'Security');
      }
      if (body.deviceLeases !== undefined && body.deviceLeases !== s.deviceLeases) {
        mediaStore.patch({ deviceLeases: body.deviceLeases });
        recordAudit(`Concurrent device leases set to ${body.deviceLeases}`, 'Security');
      }
      if (body.availableOn !== undefined && body.availableOn !== s.availableOn) {
        mediaStore.patch({ availableOn: body.availableOn });
        recordAudit(`DRM made available on ${DRM_AVAILABILITY_LABELS[body.availableOn].toLowerCase()}`, 'Security');
      }
      return ok(drm());
    }),
  ),

  http.post(
    route('/media/drm/rotate-keys'),
    handle(() => {
      authorize('platform.manage');
      mediaStore.patch({ keysRotatedAt: new Date().toISOString() });
      recordAudit('Rotated DRM license signing keys', 'Security');
      return ok(drm());
    }),
  ),

  http.put<Params>(
    route('/media/drm/providers/:key'),
    handle<Params>(({ request, params }) => connect('drm', params.key, request)),
  ),
  http.delete<Params>(
    route('/media/drm/providers/:key'),
    handle<Params>(({ params }) => disconnect('drm', params.key)),
  ),

  // ----- Storage -----
  http.get(
    route('/media/storage'),
    handle(() => {
      authorize('platform.view');
      return ok(storage());
    }),
  ),

  http.patch(
    route('/media/storage'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<StorageUpdate>(request);
      const errors: Record<string, string> = {};
      if (
        body.archiveAfterDays !== undefined &&
        (!isWhole(body.archiveAfterDays) || body.archiveAfterDays < 1 || body.archiveAfterDays > 3650)
      )
        errors.archiveAfterDays = 'Archive after must be a whole number of days from 1 to 3,650.';
      if (body.renditionLadder !== undefined && !RENDITION_LADDERS.includes(body.renditionLadder))
        errors.renditionLadder = 'The selected rendition ladder is invalid.';
      if (body.directUploads !== undefined && typeof body.directUploads !== 'boolean') errors.directUploads = 'Must be true or false.';
      if (Object.keys(errors).length) throw invalid(errors);
      const s = mediaStore.get();
      if (body.archiveAfterDays !== undefined && body.archiveAfterDays !== s.archiveAfterDays) {
        mediaStore.patch({ archiveAfterDays: body.archiveAfterDays });
        recordAudit(`Masters now archive to Glacier Deep Archive after ${body.archiveAfterDays} days`, 'Security');
      }
      if (body.renditionLadder !== undefined && body.renditionLadder !== s.renditionLadder) {
        mediaStore.patch({ renditionLadder: body.renditionLadder });
        recordAudit(`Rendition ladder set to ${RENDITION_LADDER_LABELS[body.renditionLadder]}`, 'Security');
      }
      if (body.directUploads !== undefined && body.directUploads !== s.directUploads) {
        mediaStore.patch({ directUploads: body.directUploads });
        recordAudit(`${body.directUploads ? 'Enabled' : 'Disabled'} direct-to-bucket uploads`, 'Security');
      }
      return ok(storage());
    }),
  ),

  http.put<Params>(
    route('/media/storage/backends/:key'),
    handle<Params>(({ request, params }) => connect('storage', params.key, request)),
  ),
  http.delete<Params>(
    route('/media/storage/backends/:key'),
    handle<Params>(({ params }) => disconnect('storage', params.key)),
  ),
];
