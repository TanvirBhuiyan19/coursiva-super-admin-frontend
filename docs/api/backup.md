# Backup & restore

Types: `src/features/backup/types.ts` · Mock: `src/features/backup/mock.ts` · Tests: `src/features/backup/backup.test.tsx`

Permissions: every `GET` needs `platform.view`; every write needs `platform.manage`. All audit entries are category **Security**.

## Overview

### `GET /backup`

`{ data: BackupSummary }`

| Field                                            | Notes                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `last_backup_at`, `last_backup_verified`         | Newest restore point and whether its checksum verified                                                                   |
| `protected_gb`, `history_tb`, `tenants`          | Size of the latest full snapshot, total retained history, tenant count                                                   |
| `rpo_minutes`                                    | Derived from the schedule: hourly → 60, every 6 h → 360, nightly only → 1440                                             |
| `rto_minutes`                                    | Measured full-platform restore time                                                                                      |
| `drills_passed`, `drills_total`, `last_drill_at` | Restore-drill record                                                                                                     |
| `wal_window_days`                                | Point-in-time recovery window (continuous transaction log), currently 7                                                  |
| `destinations`                                   | `[{ id, name, size, status, healthy }]` — primary, replica (reports "Paused" when replication is off), cold archive, WAL |

### `GET /backup/points`

Paginated `BackupPoint[]`, newest first: `id, taken_at, kind (Full|Incremental|Manual), label, size_gb, integrity (Verified|Verifying|Failed)`.

### `POST /backup/run`

Manual snapshot of every tenant database. Body `{ label?: string|null }` (≤ 80 chars, 422 `label`).
→ `201 { data: BackupPoint }`. Audit: `Started a manual platform backup`.

### `POST /backup/drills`

Restores a tenant into a sandbox and records the result. → `{ data: BackupSummary }`.
Audit: `Ran a restore drill (sandbox restore of {tenant})` (with `tenant_id`).

## Restores

A restore is a **server-side state machine**. Nothing touches production until a _second_ staff member approves.

```
staged ──approve (different staff member)──▶ approved ──worker picks up──▶ running ──ETA reached──▶ completed
   └──cancel──▶ cancelled
```

Only one restore may be `staged`, `approved` or `running` at a time.

`Restore`: `id, status, point_id, point_in_time, source_label, scope (platform|tenant), tenant_id, scope_label, dry_run,
staged_by_id, staged_by_name, staged_at, approved_by_id, approved_by_name, approved_at, started_at, completed_at,
progress (0–100), eta_minutes, can_approve`.

`can_approve` is computed for the viewer: `status = staged` **and** the viewer has `platform.manage` **and** did not stage it.
ETA: dry run 20 min, live single-tenant 15 min, live full platform 45 min. Live restores put affected tenants in maintenance mode;
dry runs restore into an isolated sandbox.

### `GET /backup/restores`

Paginated `Restore[]`, newest first. The client polls every 15 s while one is active.

### `POST /backup/restores` — stage

Body — either a snapshot or a point in time:

```json
{ "point_id": "bp_4", "scope": "platform", "tenant_id": null, "dry_run": true }
{ "pitr_date": "2026-09-24", "pitr_time": "13:42", "scope": "tenant", "tenant_id": "tn_kodo", "dry_run": false }
```

- Point-in-time: `pitr_date` `YYYY-MM-DD` + `pitr_time` `HH:MM` (24 h, UTC). The server replays the WAL on top of the newest
  non-incremental snapshot taken before the target.
- 422: `point_id` (missing / unknown / not verified), `pitr_date` (missing, outside the 7-day window, no snapshot before it),
  `pitr_time` (`Enter a time as HH:MM (24-hour), e.g. 13:42.`, in the future), `scope`, `tenant_id`, `dry_run`,
  `restore` (`Another restore is already in progress — finish or cancel it first.`).

→ `201 { data: Restore }` with `status: "staged"`. Audit: `Staged {dry-run|live} restore of {scope} ← {source}`.

### `POST /backup/restores/{id}/approve`

→ `{ data: Restore }`. Sets `approved_*` and `started_at` (the job queues for a few seconds, then runs).

- `403 You staged this restore — a second staff member must approve it.` when the approver staged it (policy, not validation).
- `422 restore` when it is no longer `staged`.

Audit: `Approved {dry-run|live} restore of {scope} ← {source}`.

### `POST /backup/restores/{id}/cancel`

Only while `staged` (422 `restore` otherwise). → `{ data: Restore }`. Audit: `Cancelled staged restore of {scope} ← {source}`.

## Policy

### `GET /backup/settings` · `PATCH /backup/settings`

`BackupSettings`: `frequency (hourly_nightly|nightly|six_hourly_nightly), nightly_window (HH:MM UTC), retention_days (7–365),
replication (bool), worm (bool)`. PATCH accepts any subset → `{ data: BackupSettings }`.

422: `frequency`, `nightly_window` (`Enter the window as HH:MM (24-hour UTC).`), `retention_days`
(`Keep nightly backups for 7 to 365 days.`), `replication`, `worm`.

Audit: `Enabled/Disabled backup immutability lock (WORM)`, `Enabled/Disabled cross-region backup replication`,
`Updated backup policy: schedule → …, nightly window → …, retention → … days` (only the fields that changed).
The UI turns WORM off in two steps (confirm button).

## Per-tenant exports

### `GET /backup/exports`

Paginated `TenantExport[]`, newest first: `id, tenant_id, tenant_name, format (json|csv|sql), include_media, status (queued|ready),
requested_at, expires_at (+7 days), requested_by_name`.

### `POST /backup/exports`

Body `{ tenant_id, format, include_media }` → `201 { data: TenantExport }`. The download link is emailed to the requester.
422 `tenant_id`, `format`, `include_media`. Audit: `Queued {format}[ + media manifests] data export for {tenant}` (with `tenant_id`).

## Activity

### `GET /backup/activity`

Paginated `[{ id, created_at, text }]`, newest first — backups, drills, restore lifecycle, exports and policy changes
(including completions written by the worker).
