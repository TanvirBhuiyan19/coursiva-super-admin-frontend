// API resources for /media (live rooms, video DRM, storage & delivery).
// These types are the contract the Laravel MediaSettings resources must match.
import type { Plan } from '@/lib/domain';

export interface Stat {
  label: string;
  value: string;
}

export interface PolicyToggle<K extends string = string> {
  key: K;
  label: string;
  description: string;
  enabled: boolean;
}

// ---------- Live rooms ----------
// Built-in rooms and BYO providers are switched on Platform → Feature availability (`live_rooms`, `live_zoom/meet/teams`).
export const LIVE_ROOM_POLICIES = ['pull_recordings', 'fallback_to_built_in'] as const;
export type LiveRoomPolicyKey = (typeof LIVE_ROOM_POLICIES)[number];

export interface LiveRoomUsage {
  tenantId: string;
  name: string;
  plan: Plan;
  usedMinutes: number;
  /** The tenant's effective allowance (plan allowance or tenant override). 0 = built-in rooms off. */
  allowanceMinutes: number;
  status: 'within' | 'over' | 'byo';
}

export interface LiveRoomSettings {
  policies: PolicyToggle<LiveRoomPolicyKey>[];
  /** Built-in room minutes per month for each plan (0 = BYO provider only). Feeds tenant `live_room_minutes` limits. */
  allowances: { plan: Plan; minutes: number }[];
  /** Overage price per participant-minute, USD. */
  overageRate: number;
  topUp: { minutes: number; price: number };
  /** The first 10 schools A–Z only; the whole list pages through `GET /media/live-rooms/usage`. */
  usage: LiveRoomUsage[];
  /** How many schools can hold built-in rooms (ready or suspended): the full usage list's size. */
  usageTotal: number;
}

export type LiveRoomUpdate = Partial<{
  policies: { key: LiveRoomPolicyKey; enabled: boolean }[];
  allowances: { plan: Plan; minutes: number }[];
}>;

// ---------- Credentials (DRM providers, storage backends) ----------
export interface CredentialField {
  /** Field id, e.g. `token_secret`. */
  key: string;
  label: string;
  secret: boolean;
  configured: boolean;
  /** Last four characters of the stored value. */
  last4: string | null;
  /** Full stored value for non-secret fields (account id, region…). Always null for secrets. */
  value: string | null;
  /** A fixed choice (shown as a switch instead of a text box); null for free text. */
  options?: { value: string; label: string }[] | null;
  /** The value in effect while none is stored. */
  default?: string | null;
}

export interface Connection {
  key: string;
  name: string;
  description: string;
  /** Role label for storage backends, e.g. "Hot delivery". */
  role: string | null;
  connected: boolean;
  verifiedAt: string | null;
  fields: CredentialField[];
}

/** Result of re-verifying stored credentials. */
export interface ConnectionTest {
  ok: boolean;
  latencyMs: number;
  message: string;
}

/** PUT body: new values for any fields; omitted fields keep their stored value. */
export interface CredentialsInput {
  credentials: { field: string; value: string }[];
}

// ---------- DRM ----------
/**
 * Only switches something reads: `signed_links` (locked: every stream, licence and file link is signed and expires),
 * the schools' dynamic `watermark` kill switch and `geo_restrictions` (schools may use their country rules).
 */
export const DRM_PROTECTIONS = ['signed_links', 'watermark', 'geo_restrictions'] as const;
export type DrmProtectionKey = (typeof DRM_PROTECTIONS)[number];

/** `forensic` is retired (no forensic vendor): the API still accepts it and saves `email`. */
export const WATERMARK_STYLES = ['email', 'email_ip'] as const;
export type WatermarkStyle = (typeof WATERMARK_STYLES)[number];
export const WATERMARK_STYLE_LABELS: Record<WatermarkStyle, string> = {
  email: 'Email overlay',
  email_ip: 'Email + IP overlay',
};

/**
 * What the platform protects today: `setup_required` (no Mux signing key: video plays from its source file),
 * `protected` (Mux signs every stream, a DRM configuration is set, DRM is available, the watermark is on) or `partial`.
 */
export const DRM_POSTURES = ['protected', 'partial', 'setup_required'] as const;
export type DrmPosture = (typeof DRM_POSTURES)[number];

export interface DrmProtection extends PolicyToggle<DrmProtectionKey> {
  /** Locked protections are always on. */
  locked: boolean;
}

export interface DrmSettings {
  stats: Stat[];
  posture: DrmPosture;
  /** Why the posture isn't `protected` (empty when it is). */
  postureReasons: string[];
  protections: DrmProtection[];
  /** The Mux connection has a DRM configuration ID (its security level is set in Mux → Settings → DRM). */
  drmConfigured: boolean;
  watermarkStyle: WatermarkStyle;
  /** The ceiling of a school's concurrent-stream limit (1–20). */
  deviceLeases: number;
  /** Mux only (EZDRM and KeyOS are hidden). */
  providers: Connection[];
  /** Signing keys created so far (1 = never rotated). */
  keyGeneration: number;
  keysRotatedAt: string | null;
  /** When the previous signing key stops working, while one is retiring. */
  previousKeyRetiresAt: string | null;
  /**
   * A previous key past its retire time is still live at Mux: an immediate revoke or a retirement Mux refused. The job
   * retries every 10 minutes; links signed with it keep working until it is gone. Absent in older answers.
   */
  previousKeyOverdue?: boolean;
}

export type DrmUpdate = Partial<{
  protections: { key: DrmProtectionKey; enabled: boolean }[];
  watermarkStyle: WatermarkStyle;
  deviceLeases: number;
}>;

// ---------- Storage ----------
export const RENDITION_LADDERS = ['standard', 'uhd', 'budget'] as const;
export type RenditionLadder = (typeof RENDITION_LADDERS)[number];
export const RENDITION_LADDER_LABELS: Record<RenditionLadder, string> = {
  standard: '1080p · 720p · 480p',
  uhd: '4K · 1080p · 720p · 480p',
  budget: '720p · 480p (budget)',
};

export interface StorageSettings {
  stats: Stat[];
  backends: Connection[];
  pipeline: { step: string; description: string; healthy: boolean }[];
  archiveAfterDays: number;
  renditionLadder: RenditionLadder;
  directUploads: boolean;
  /** Top tenants by media footprint. `tenantId` null for the "all others" row. */
  footprint: { tenantId: string | null; name: string; storageTb: number; bandwidthTb: number }[];
}

export type StorageUpdate = Partial<{ archiveAfterDays: number; renditionLadder: RenditionLadder; directUploads: boolean }>;
