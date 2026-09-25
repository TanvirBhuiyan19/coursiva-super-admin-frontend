// API resources for /backup. These types are the contract for the Laravel backup/restore controllers.

export const BACKUP_FREQUENCIES = ['hourly_nightly', 'nightly', 'six_hourly_nightly'] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];
export const FREQUENCY_LABELS: Record<BackupFrequency, string> = {
  hourly_nightly: 'Hourly incremental + nightly full',
  nightly: 'Nightly full only',
  six_hourly_nightly: 'Every 6h incremental + nightly full',
};

export const EXPORT_FORMATS = ['json', 'csv', 'sql'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = { json: 'JSON', csv: 'CSV bundle', sql: 'SQL dump' };

export type BackupKind = 'Full' | 'Incremental' | 'Manual';

export interface BackupPoint {
  id: string;
  takenAt: string;
  kind: BackupKind;
  /** Operator note for manual snapshots, e.g. "before pricing migration". */
  label: string | null;
  sizeGb: number;
  integrity: 'Verified' | 'Verifying' | 'Failed';
}

export interface BackupDestination {
  id: string;
  name: string;
  size: string;
  status: string;
  healthy: boolean;
}

export interface BackupSummary {
  lastBackupAt: string | null;
  lastBackupVerified: boolean;
  protectedGb: number;
  historyTb: number;
  tenants: number;
  rpoMinutes: number;
  rtoMinutes: number;
  drillsPassed: number;
  drillsTotal: number;
  lastDrillAt: string | null;
  /** Days of continuous transaction log (WAL) available for point-in-time recovery. */
  walWindowDays: number;
  destinations: BackupDestination[];
}

export interface BackupSettings {
  frequency: BackupFrequency;
  /** Nightly full backup start, HH:MM UTC. */
  nightlyWindow: string;
  /** Days to keep nightly backups (7–365); weekly copies are then kept for 12 months. */
  retentionDays: number;
  replication: boolean;
  /** Immutability lock: backups can't be altered or deleted for 30 days. */
  worm: boolean;
}

/**
 * Restore lifecycle (server-side state machine):
 * `staged` → (second staff member approves) → `approved` → `running` → `completed`; `staged` → `cancelled`.
 */
export type RestoreStatus = 'staged' | 'approved' | 'running' | 'completed' | 'cancelled';

export interface Restore {
  id: string;
  status: RestoreStatus;
  /** Snapshot the restore starts from (for point-in-time restores: the nearest snapshot before the target). */
  pointId: string | null;
  /** Target time for a point-in-time restore (WAL replay), otherwise null. */
  pointInTime: string | null;
  /** Human description of the source, e.g. "Today · 03:00 full" or "Sep 24 · 13:42 (point-in-time)". */
  sourceLabel: string;
  scope: 'platform' | 'tenant';
  tenantId: string | null;
  /** "Full platform" or the tenant's name. */
  scopeLabel: string;
  dryRun: boolean;
  stagedById: string;
  stagedByName: string;
  stagedAt: string;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** 0–100 while running. */
  progress: number;
  etaMinutes: number;
  /** Whether the signed-in user may approve (has platform.manage and did not stage it). */
  canApprove: boolean;
}

export interface StageRestoreInput {
  pointId?: string | null;
  /** Point-in-time day, YYYY-MM-DD (UTC). Together with `pitrTime`. */
  pitrDate?: string | null;
  /** Point-in-time time, HH:MM (24h, UTC). */
  pitrTime?: string | null;
  scope: 'platform' | 'tenant';
  tenantId?: string | null;
  dryRun: boolean;
}

export interface TenantExport {
  id: string;
  tenantId: string;
  tenantName: string;
  format: ExportFormat;
  includeMedia: boolean;
  status: 'queued' | 'ready';
  requestedAt: string;
  expiresAt: string;
  requestedByName: string;
}

export interface BackupActivity {
  id: string;
  createdAt: string;
  text: string;
}

/** PATCH /backup/settings body: any subset of the policy. */
export type BackupSettingsUpdate = Partial<BackupSettings>;

/** POST /backup/exports body. */
export interface TenantExportInput {
  tenantId: string;
  format: ExportFormat;
  /** Include media manifests (file lists + signed URLs), not the media itself. */
  includeMedia: boolean;
}
