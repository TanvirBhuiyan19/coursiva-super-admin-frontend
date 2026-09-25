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
export const LIVE_ROOM_POLICIES = ['byo_providers', 'built_in_rooms', 'pull_recordings', 'fallback_to_built_in'] as const;
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
  usage: LiveRoomUsage[];
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

/** PUT body: new values for any fields; omitted fields keep their stored value. */
export interface CredentialsInput {
  credentials: { field: string; value: string }[];
}

// ---------- DRM ----------
export const DRM_PROTECTIONS = ['encryption', 'hardware_drm', 'watermark', 'block_capture', 'geo_restrictions'] as const;
export type DrmProtectionKey = (typeof DRM_PROTECTIONS)[number];

export const DRM_SECURITY_LEVELS = ['widevine_l3_fairplay', 'widevine_l1', 'clearkey'] as const;
export type DrmSecurityLevel = (typeof DRM_SECURITY_LEVELS)[number];
export const DRM_SECURITY_LEVEL_LABELS: Record<DrmSecurityLevel, string> = {
  widevine_l3_fairplay: 'Widevine L3 + FairPlay',
  widevine_l1: 'Widevine L1 required (HD lock)',
  clearkey: 'Clearkey (testing only)',
};

export const WATERMARK_STYLES = ['email', 'email_ip', 'forensic'] as const;
export type WatermarkStyle = (typeof WATERMARK_STYLES)[number];
export const WATERMARK_STYLE_LABELS: Record<WatermarkStyle, string> = {
  email: 'Email overlay',
  email_ip: 'Email + IP overlay',
  forensic: 'Forensic (invisible)',
};

export const DRM_AVAILABILITY = ['all', 'growth', 'scale'] as const;
export type DrmAvailability = (typeof DRM_AVAILABILITY)[number];
export const DRM_AVAILABILITY_LABELS: Record<DrmAvailability, string> = {
  all: 'All plans',
  growth: 'Growth and above',
  scale: 'Scale only',
};

export interface DrmProtection extends PolicyToggle<DrmProtectionKey> {
  /** Locked protections are always on. */
  locked: boolean;
}

export interface DrmSettings {
  stats: Stat[];
  protections: DrmProtection[];
  securityLevel: DrmSecurityLevel;
  watermarkStyle: WatermarkStyle;
  deviceLeases: number;
  availableOn: DrmAvailability;
  providers: Connection[];
  keysRotatedAt: string;
}

export type DrmUpdate = Partial<{
  protections: { key: DrmProtectionKey; enabled: boolean }[];
  securityLevel: DrmSecurityLevel;
  watermarkStyle: WatermarkStyle;
  deviceLeases: number;
  availableOn: DrmAvailability;
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
