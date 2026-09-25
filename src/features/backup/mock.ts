// Mock implementation of /backup (what the Laravel backup/restore controllers + jobs will do).
import { http } from 'msw';
import { tenants, type StaffRow } from '@/mocks/collections';
import { ago, collection, id, saveDb, singleton } from '@/mocks/db';
import { authorize, handle, HttpError, invalid, notFound, ok, paginate, permissionsOf, readBody, recordAudit, route } from '@/mocks/http';
import {
  BACKUP_FREQUENCIES,
  EXPORT_FORMAT_LABELS,
  EXPORT_FORMATS,
  FREQUENCY_LABELS,
  type BackupActivity,
  type BackupPoint,
  type BackupSettings,
  type BackupSummary,
  type ExportFormat,
  type Restore,
  type StageRestoreInput,
  type TenantExport,
} from './types';

const MIN = 60_000;
const DAY = 1440 * MIN;
const WAL_DAYS = 7;
/** Seconds between approval and the restore worker picking the job up. */
const QUEUE_DELAY_MS = 5_000;
const EXPORT_READY_MS = 5 * MIN;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Feature tables ----------
const points = collection<BackupPoint>('backupPoints', () => [
  { id: 'bp_5', takenAt: ago({ m: 40 }), kind: 'Incremental', label: null, sizeGb: 2.1, integrity: 'Verified' },
  { id: 'bp_4', takenAt: ago({ h: 8 }), kind: 'Full', label: null, sizeGb: 412, integrity: 'Verified' },
  { id: 'bp_3', takenAt: ago({ d: 1, h: 8 }), kind: 'Full', label: null, sizeGb: 409, integrity: 'Verified' },
  { id: 'bp_2', takenAt: ago({ d: 2, h: 8 }), kind: 'Full', label: null, sizeGb: 405, integrity: 'Verified' },
  { id: 'bp_1', takenAt: ago({ d: 3, h: 1 }), kind: 'Manual', label: 'before pricing migration', sizeGb: 404, integrity: 'Verified' },
]);

interface RestoreRow extends Omit<Restore, 'status' | 'progress' | 'canApprove'> {
  cancelledAt: string | null;
}
const restores = collection<RestoreRow>('backupRestores', () => []);

const settings = singleton<BackupSettings>('backupSettings', () => ({
  frequency: 'hourly_nightly',
  nightlyWindow: '03:00',
  retentionDays: 30,
  replication: true,
  worm: true,
}));

const drills = singleton<{ passed: number; total: number; lastAt: string | null }>('backupDrills', () => ({
  passed: 12,
  total: 12,
  lastAt: ago({ d: 28 }),
}));

interface ExportRow extends Omit<TenantExport, 'status'> {
  readyAt: string;
}
const exportsTable = collection<ExportRow>('backupExports', () => []);

const activity = collection<BackupActivity>('backupActivity', () => [
  { id: 'ba_4', createdAt: ago({ m: 40 }), text: 'Incremental backup completed · 2.1 GB · verified' },
  { id: 'ba_3', createdAt: ago({ h: 8 }), text: 'Nightly full completed · 412 GB · checksum verified' },
  { id: 'ba_2', createdAt: ago({ d: 1, h: 8 }), text: 'Nightly full completed · replica sync 4 min' },
  { id: 'ba_1', createdAt: ago({ d: 28 }), text: 'Restore drill passed — sandbox restore of Nordic Yoga School in 38 min' },
]);

const log = (text: string) => activity.insert({ id: id('ba'), createdAt: new Date().toISOString(), text });

// ---------- Rules ----------
const etaFor = (dryRun: boolean, scope: 'platform' | 'tenant') => (dryRun ? 20 : scope === 'tenant' ? 15 : 45);

function statusOf(r: RestoreRow, now = Date.now()): Restore['status'] {
  if (r.cancelledAt) return 'cancelled';
  if (!r.approvedAt || !r.startedAt) return 'staged';
  if (r.completedAt) return 'completed';
  return now < new Date(r.startedAt).getTime() ? 'approved' : 'running';
}

/** Moves running restores to completed once their ETA has passed (a queue worker in Laravel). */
function advance() {
  const now = Date.now();
  let changed = false;
  for (const r of restores.all()) {
    if (r.startedAt && !r.completedAt && !r.cancelledAt && now >= new Date(r.startedAt).getTime() + r.etaMinutes * MIN) {
      r.completedAt = new Date(new Date(r.startedAt).getTime() + r.etaMinutes * MIN).toISOString();
      log(
        r.dryRun
          ? `Dry run completed — ${r.scopeLabel} ← ${r.sourceLabel} verified in a sandbox, report emailed`
          : `Restore completed — ${r.scopeLabel} ← ${r.sourceLabel}, maintenance mode lifted`,
      );
      changed = true;
    }
  }
  if (changed) saveDb();
}

function toRestore(r: RestoreRow, viewer: StaffRow): Restore {
  const status = statusOf(r);
  let progress = 0;
  if (status === 'completed') progress = 100;
  else if (status === 'running' && r.startedAt)
    progress = Math.min(99, Math.round(((Date.now() - new Date(r.startedAt).getTime()) / (r.etaMinutes * MIN)) * 100));
  const { cancelledAt: _c, ...rest } = r;
  return {
    ...rest,
    status,
    progress,
    canApprove: status === 'staged' && r.stagedById !== viewer.id && permissionsOf(viewer).includes('platform.manage'),
  };
}

const toExport = ({ readyAt, ...e }: ExportRow): TenantExport => ({
  ...e,
  status: Date.now() >= new Date(readyAt).getTime() ? 'ready' : 'queued',
});

const pointLabel = (p: BackupPoint) => {
  const d = new Date(p.takenAt);
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const time = d.toISOString().slice(11, 16);
  return `${day} · ${time} UTC ${p.kind === 'Manual' ? 'manual snapshot' : p.kind.toLowerCase()}`;
};

const sortedPoints = () => [...points.all()].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
const rpoFor = (f: BackupSettings['frequency']) => (f === 'hourly_nightly' ? 60 : f === 'six_hourly_nightly' ? 360 : 1440);

function summary(): BackupSummary {
  const all = sortedPoints();
  const latest = all[0];
  const latestFull = all.find((p) => p.kind !== 'Incremental');
  const s = settings.get();
  const d = drills.get();
  const protectedGb = latestFull?.sizeGb ?? 0;
  return {
    lastBackupAt: latest?.takenAt ?? null,
    lastBackupVerified: latest?.integrity === 'Verified',
    protectedGb,
    historyTb: 4.1,
    tenants: tenants.all().length,
    rpoMinutes: rpoFor(s.frequency),
    rtoMinutes: 45,
    drillsPassed: d.passed,
    drillsTotal: d.total,
    lastDrillAt: d.lastAt,
    walWindowDays: WAL_DAYS,
    destinations: [
      { id: 'primary', name: 'Primary — Cloudflare R2 · eu-west', size: `${protectedGb} GB`, status: 'Healthy', healthy: true },
      s.replication
        ? { id: 'replica', name: 'Replica — AWS S3 · us-east-1', size: `${protectedGb} GB`, status: 'Synced 6 min ago', healthy: true }
        : { id: 'replica', name: 'Replica — AWS S3 · us-east-1', size: '—', status: 'Paused — replication off', healthy: false },
      { id: 'cold', name: 'Cold — Glacier Deep Archive', size: '4.1 TB', status: 'Weekly · 12-month retention', healthy: true },
      { id: 'wal', name: 'Transaction log (WAL) — continuous', size: `${WAL_DAYS}-day window`, status: 'Shipping · 8s lag', healthy: true },
    ],
  };
}

const activeRestore = () => restores.all().find((r) => ['staged', 'approved', 'running'].includes(statusOf(r)));

function findRestore(rid: string | readonly string[] | undefined) {
  const r = typeof rid === 'string' ? restores.find(rid) : undefined;
  if (!r) throw notFound('Restore');
  return r;
}

type Params = { id: string };

export const handlers = [
  http.get(
    route('/backup'),
    handle(() => {
      authorize('platform.view');
      advance();
      return ok(summary());
    }),
  ),

  http.get(
    route('/backup/points'),
    handle(({ request }) => {
      authorize('platform.view');
      return paginate(sortedPoints(), request);
    }),
  ),

  // Manual snapshot of every tenant database.
  http.post(
    route('/backup/run'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<{ label?: string | null }>(request);
      const label = (body.label ?? '').trim();
      if (label.length > 80) throw invalid({ label: 'Keep the note under 80 characters.' });
      const base = sortedPoints().find((p) => p.kind !== 'Incremental')?.sizeGb ?? 400;
      const point: BackupPoint = {
        id: id('bp'),
        takenAt: new Date().toISOString(),
        kind: 'Manual',
        label: label || null,
        sizeGb: Math.round((base + 0.4) * 10) / 10,
        integrity: 'Verified',
      };
      points.insert(point);
      log(`Manual backup completed · ${point.sizeGb} GB · checksum verified${label ? ` — ${label}` : ''}`);
      recordAudit('Started a manual platform backup', 'Security');
      return ok(point, 201);
    }),
  ),

  http.post(
    route('/backup/drills'),
    handle(() => {
      authorize('platform.manage');
      const d = drills.get();
      const all = tenants.all();
      const pick = all[d.total % Math.max(1, all.length)];
      drills.set({ passed: d.passed + 1, total: d.total + 1, lastAt: new Date().toISOString() });
      log(`Restore drill passed — sandbox restore of ${pick?.name ?? 'a tenant'} in 38 min`);
      recordAudit(`Ran a restore drill (sandbox restore of ${pick?.name ?? 'a tenant'})`, 'Security', pick?.id ?? null);
      return ok(summary());
    }),
  ),

  // ---------- Restores ----------
  http.get(
    route('/backup/restores'),
    handle(({ request }) => {
      const viewer = authorize('platform.view');
      advance();
      const rows = [...restores.all()].sort((a, b) => b.stagedAt.localeCompare(a.stagedAt)).map((r) => toRestore(r, viewer));
      return paginate(rows, request);
    }),
  ),

  http.post(
    route('/backup/restores'),
    handle(async ({ request }) => {
      const user = authorize('platform.manage');
      advance();
      const body = await readBody<StageRestoreInput>(request);
      const errors: Record<string, string> = {};
      const pitr = !!(body.pitrDate || body.pitrTime);
      let point: BackupPoint | undefined;
      let pointInTime: string | null = null;

      if (pitr) {
        if (!body.pitrDate || !DATE_RE.test(body.pitrDate)) errors.pitrDate = 'Choose the day to recover to.';
        if (!body.pitrTime || !TIME_RE.test(body.pitrTime)) errors.pitrTime = 'Enter a time as HH:MM (24-hour), e.g. 13:42.';
        if (!errors.pitrDate && !errors.pitrTime) {
          const target = new Date(`${body.pitrDate}T${body.pitrTime}:00Z`).getTime();
          if (Number.isNaN(target)) errors.pitrDate = 'Choose the day to recover to.';
          else if (target > Date.now()) errors.pitrTime = 'That time is in the future.';
          else if (target < Date.now() - WAL_DAYS * DAY) errors.pitrDate = `Point-in-time recovery covers the last ${WAL_DAYS} days.`;
          else {
            pointInTime = new Date(target).toISOString();
            point = sortedPoints().find((p) => p.kind !== 'Incremental' && new Date(p.takenAt).getTime() <= target);
            if (!point) errors.pitrDate = 'No snapshot exists before that time to replay from.';
          }
        }
      } else if (!body.pointId) errors.pointId = 'Choose a restore point or a point in time.';
      else {
        point = points.find(body.pointId);
        if (!point) errors.pointId = 'That restore point no longer exists.';
        else if (point.integrity !== 'Verified') errors.pointId = 'Only verified restore points can be restored.';
      }

      if (body.scope !== 'platform' && body.scope !== 'tenant') errors.scope = 'Choose what to restore.';
      const tenant = body.scope === 'tenant' ? tenants.find(body.tenantId ?? '') : undefined;
      if (body.scope === 'tenant' && !tenant) errors.tenantId = 'Choose a tenant to restore.';
      if (typeof body.dryRun !== 'boolean') errors.dryRun = 'Choose whether this is a dry run.';
      if (Object.keys(errors).length || !point) throw invalid(errors);
      if (activeRestore()) throw invalid({ restore: 'Another restore is already in progress — finish or cancel it first.' });

      const sourceLabel = pointInTime
        ? `${new Date(pointInTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${pointInTime.slice(11, 16)} UTC (point-in-time)`
        : pointLabel(point);
      const scope = body.scope;
      const row: RestoreRow = {
        id: id('rs'),
        pointId: point.id,
        pointInTime,
        sourceLabel,
        scope,
        tenantId: tenant?.id ?? null,
        scopeLabel: tenant?.name ?? 'Full platform',
        dryRun: body.dryRun,
        stagedById: user.id,
        stagedByName: user.name,
        stagedAt: new Date().toISOString(),
        approvedById: null,
        approvedByName: null,
        approvedAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        etaMinutes: etaFor(body.dryRun, scope),
      };
      restores.insert(row);
      log(`${row.dryRun ? 'Dry run' : 'Live restore'} staged by ${user.name} — ${row.scopeLabel} ← ${sourceLabel}`);
      recordAudit(`Staged ${row.dryRun ? 'dry-run' : 'live'} restore of ${row.scopeLabel} ← ${sourceLabel}`, 'Security', row.tenantId);
      return ok(toRestore(row, user), 201);
    }),
  ),

  // Second-person approval: the member who staged a restore can never approve it.
  http.post(
    route('/backup/restores/:id/approve'),
    handle<Params>(({ params }) => {
      const user = authorize('platform.manage');
      advance();
      const r = findRestore(params.id);
      if (statusOf(r) !== 'staged') throw invalid({ restore: 'This restore is no longer waiting for approval.' });
      if (r.stagedById === user.id) throw new HttpError(403, 'You staged this restore — a second staff member must approve it.');
      const now = Date.now();
      Object.assign(r, {
        approvedById: user.id,
        approvedByName: user.name,
        approvedAt: new Date(now).toISOString(),
        startedAt: new Date(now + QUEUE_DELAY_MS).toISOString(),
      });
      log(`${r.dryRun ? 'Dry run' : 'Restore'} approved by ${user.name} and queued — ${r.scopeLabel} ← ${r.sourceLabel}`);
      recordAudit(`Approved ${r.dryRun ? 'dry-run' : 'live'} restore of ${r.scopeLabel} ← ${r.sourceLabel}`, 'Security', r.tenantId);
      return ok(toRestore(r, user));
    }),
  ),

  http.post(
    route('/backup/restores/:id/cancel'),
    handle<Params>(({ params }) => {
      const user = authorize('platform.manage');
      advance();
      const r = findRestore(params.id);
      if (statusOf(r) !== 'staged') throw invalid({ restore: 'Only a restore that is waiting for approval can be cancelled.' });
      r.cancelledAt = new Date().toISOString();
      log(`Staged restore cancelled by ${user.name} — ${r.scopeLabel} ← ${r.sourceLabel}`);
      recordAudit(`Cancelled staged restore of ${r.scopeLabel} ← ${r.sourceLabel}`, 'Security', r.tenantId);
      return ok(toRestore(r, user));
    }),
  ),

  // ---------- Policy ----------
  http.get(
    route('/backup/settings'),
    handle(() => {
      authorize('platform.view');
      return ok(settings.get());
    }),
  ),

  http.patch(
    route('/backup/settings'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const body = await readBody<Partial<BackupSettings>>(request);
      const errors: Record<string, string> = {};
      if (body.frequency !== undefined && !BACKUP_FREQUENCIES.includes(body.frequency))
        errors.frequency = 'The selected schedule is invalid.';
      if (body.nightlyWindow !== undefined && !TIME_RE.test(body.nightlyWindow))
        errors.nightlyWindow = 'Enter the window as HH:MM (24-hour UTC).';
      if (body.retentionDays !== undefined && (!Number.isInteger(body.retentionDays) || body.retentionDays < 7 || body.retentionDays > 365))
        errors.retentionDays = 'Keep nightly backups for 7 to 365 days.';
      if (body.replication !== undefined && typeof body.replication !== 'boolean') errors.replication = 'Must be on or off.';
      if (body.worm !== undefined && typeof body.worm !== 'boolean') errors.worm = 'Must be on or off.';
      if (Object.keys(errors).length) throw invalid(errors);

      const prev = settings.get();
      const next = settings.patch(Object.fromEntries(Object.entries(body).filter(([k]) => k in prev)));
      if (prev.worm !== next.worm)
        recordAudit(next.worm ? 'Enabled backup immutability lock (WORM)' : 'Disabled backup immutability lock (WORM)', 'Security');
      if (prev.replication !== next.replication)
        recordAudit(next.replication ? 'Enabled cross-region backup replication' : 'Disabled cross-region backup replication', 'Security');
      const policy: string[] = [];
      if (prev.frequency !== next.frequency) policy.push(`schedule → ${FREQUENCY_LABELS[next.frequency]}`);
      if (prev.nightlyWindow !== next.nightlyWindow) policy.push(`nightly window → ${next.nightlyWindow} UTC`);
      if (prev.retentionDays !== next.retentionDays) policy.push(`retention → ${next.retentionDays} days`);
      if (policy.length) {
        recordAudit(`Updated backup policy: ${policy.join(', ')}`, 'Security');
        log(`Backup policy updated — ${policy.join(', ')}`);
      }
      return ok(next);
    }),
  ),

  // ---------- Per-tenant exports ----------
  http.get(
    route('/backup/exports'),
    handle(({ request }) => {
      authorize('platform.view');
      const rows = [...exportsTable.all()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map(toExport);
      return paginate(rows, request);
    }),
  ),

  http.post(
    route('/backup/exports'),
    handle(async ({ request }) => {
      const user = authorize('platform.manage');
      const body = await readBody<{ tenantId: string; format: ExportFormat; includeMedia: boolean }>(request);
      const errors: Record<string, string> = {};
      const tenant = tenants.find(body.tenantId ?? '');
      if (!tenant) errors.tenantId = 'Choose a tenant to export.';
      if (!EXPORT_FORMATS.includes(body.format)) errors.format = 'The selected format is invalid.';
      if (typeof body.includeMedia !== 'boolean') errors.includeMedia = 'Choose whether to include media manifests.';
      if (Object.keys(errors).length || !tenant) throw invalid(errors);
      const now = Date.now();
      const row: ExportRow = {
        id: id('ex'),
        tenantId: tenant.id,
        tenantName: tenant.name,
        format: body.format,
        includeMedia: body.includeMedia,
        requestedAt: new Date(now).toISOString(),
        readyAt: new Date(now + EXPORT_READY_MS).toISOString(),
        expiresAt: new Date(now + 7 * DAY).toISOString(),
        requestedByName: user.name,
      };
      exportsTable.insert(row);
      const what = `${EXPORT_FORMAT_LABELS[row.format]}${row.includeMedia ? ' + media manifests' : ''}`;
      log(`Data export queued for ${tenant.name} (${what})`);
      recordAudit(`Queued ${what} data export for ${tenant.name}`, 'Security', tenant.id);
      return ok(toExport(row), 201);
    }),
  ),

  // ---------- Activity ----------
  http.get(
    route('/backup/activity'),
    handle(({ request }) => {
      authorize('platform.view');
      advance();
      return paginate(
        [...activity.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        request,
      );
    }),
  ),
];

/** Exposed for tests. */
export const backupTables = { points, restores, settings, exports: exportsTable, activity };
