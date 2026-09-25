import { useState } from 'react';
import { z } from 'zod';
import { Badge, Card, Empty, Field, FormError, Input, SkeletonRows, Spinner, Toggle, TRow, ErrorState } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useTenants } from '@/features/tenants/api';
import { errorMessage } from '@/lib/api/errors';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useBackupPoints, useRunBackup, useRunDrill, useStageRestore } from '../api';
import type { BackupPoint, Restore } from '../types';

const COLS = 'minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,0.6fr) minmax(0,0.8fr) minmax(0,0.7fr)';
const DAY = 86_400_000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The last `n` UTC days as YYYY-MM-DD, labelled Today / Yesterday / "Sep 21". */
function recentDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const iso = new Date(Date.now() - i * DAY).toISOString();
    return { value: iso.slice(0, 10), label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : formatDate(iso) };
  });
}

const stageSchema = z
  .object({
    pitrDate: z.string(),
    pitrTime: z
      .string()
      .trim()
      .refine((v) => v === '' || TIME_RE.test(v), 'Enter a time as HH:MM (24-hour), e.g. 13:42.'),
    scope: z.string().min(1, 'Choose what to restore.'),
    dryRun: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.pitrTime && TIME_RE.test(v.pitrTime) && new Date(`${v.pitrDate}T${v.pitrTime}:00Z`).getTime() > Date.now())
      ctx.addIssue({ code: 'custom', path: ['pitrTime'], message: 'That time is in the future.' });
  });

const pointName = (p: BackupPoint) => formatDateTime(p.takenAt);

function TenantScopeOptions() {
  const list = useTenants({ perPage: 100, sort: 'name' });
  return (
    <>
      {list.data?.data.map((t) => (
        <option key={t.id} value={t.id}>
          Tenant: {t.name}
        </option>
      ))}
    </>
  );
}

function StageRestoreForm({ point, walDays, onDone }: { point: BackupPoint; walDays: number; onDone: () => void }) {
  const can = useCan();
  const stage = useStageRestore();
  const days = recentDays(walDays + 1);
  const form = useZodForm(stageSchema, {
    defaultValues: { pitrDate: days[0]!.value, pitrTime: '', scope: 'platform', dryRun: true },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const dryRun = form.watch('dryRun');
  const errs = form.formState.errors;

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    const pitr = v.pitrTime !== '';
    stage.mutate(
      {
        pointId: pitr ? null : point.id,
        pitrDate: pitr ? v.pitrDate : null,
        pitrTime: pitr ? v.pitrTime : null,
        scope: v.scope === 'platform' ? 'platform' : 'tenant',
        tenantId: v.scope === 'platform' ? null : v.scope,
        dryRun: v.dryRun,
      },
      {
        onSuccess: (r) => {
          toast(
            r.pointInTime
              ? `Point-in-time restore staged — the transaction log replays to ${r.sourceLabel.replace(' (point-in-time)', '')}. A second staff member must approve.`
              : `Restore staged — a second staff member must approve before ${r.scopeLabel} is touched`,
          );
          onDone();
        },
        onError: (err) => {
          if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
        },
      },
    );
  });

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      aria-label={`Restore from ${pointName(point)}`}
      style={{ background: 'var(--pg)', border: '1px solid var(--bd2)', borderRadius: 11, padding: 16, marginTop: 12 }}
    >
      <h3 style={{ fontWeight: 700, fontSize: 13 }}>Restore from {pointName(point)}</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: 14,
          marginTop: 4,
          alignItems: 'start',
        }}
      >
        <Field label="Point-in-time day" error={errs.pitrDate?.message}>
          {(p) => (
            <select {...p} {...form.register('pitrDate')} className="select">
              {days.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Point-in-time (optional, UTC)"
          error={errs.pitrTime?.message}
          hint={`Leave empty to restore the snapshot. WAL covers the last ${walDays} days.`}
        >
          {(p) => <Input {...p} {...form.register('pitrTime')} placeholder="HH:MM" inputMode="numeric" autoComplete="off" />}
        </Field>
        <Field label="Scope" error={errs.scope?.message}>
          {(p) => (
            <select {...p} {...form.register('scope')} className="select">
              <option value="platform">Full platform</option>
              {can('tenants.view') && <TenantScopeOptions />}
            </select>
          )}
        </Field>
      </div>
      <div className="hstack wrap" style={{ gap: 12, marginTop: 14 }}>
        <Toggle
          on={dryRun}
          onChange={(v) => form.setValue('dryRun', v, { shouldDirty: true })}
          label="Dry run — restore into an isolated sandbox first"
        />
        <span className="t-sm muted" style={{ flex: 1, minWidth: 200 }}>
          {dryRun ? 'Dry run — restore into an isolated sandbox first' : 'Live restore — affected tenants go into maintenance mode'}
        </span>
        <button type="button" className="btn" onClick={onDone}>
          Close
        </button>
        <button type="submit" className="btn btn--primary" disabled={stage.isPending}>
          {stage.isPending && <Spinner />} Stage restore
        </button>
      </div>
      <FormError>{formError}</FormError>
      <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
        Single-tenant restores don’t touch other tenants. Live restores put affected tenants in maintenance mode. Point-in-time recovery
        replays the transaction log on top of the nearest snapshot — recover to any minute, not just backup times.
      </p>
    </form>
  );
}

const statusBadge: Record<Restore['status'], ['good' | 'warn' | 'flat' | 'info', string]> = {
  staged: ['warn', 'Awaiting approval'],
  approved: ['info', 'Approved'],
  running: ['info', 'Running'],
  completed: ['good', 'Completed'],
  cancelled: ['flat', 'Cancelled'],
};

export function RestorePoints({ walDays, restores }: { walDays: number; restores: Restore[] }) {
  const can = useCan();
  const list = useBackupPoints();
  const run = useRunBackup();
  const drill = useRunDrill();
  const [selected, setSelected] = useState<string | null>(null);
  const active = restores.find((r) => ['staged', 'approved', 'running'].includes(r.status));
  const history = restores.filter((r) => r.status === 'completed' || r.status === 'cancelled').slice(0, 4);
  const selectedPoint = list.data?.find((p) => p.id === selected);

  return (
    <Card
      title="Restore points"
      right={
        can('platform.manage') ? (
          <div className="hstack wrap" style={{ gap: 8, marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn"
              disabled={drill.isPending}
              onClick={() =>
                drill.mutate(undefined, {
                  onSuccess: () =>
                    toast('Restore drill passed — a random tenant was restored into a sandbox, report emailed to platform staff'),
                })
              }
            >
              {drill.isPending && <Spinner />} Run restore drill
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={run.isPending}
              onClick={() =>
                run.mutate(undefined, { onSuccess: (p) => toast(`Manual backup completed — ${p.sizeGb} GB snapshot, checksum verified`) })
              }
            >
              {run.isPending && <Spinner />} Back up now
            </button>
          </div>
        ) : undefined
      }
    >
      <p className="t-sm muted" style={{ marginTop: -4, marginBottom: 0 }}>
        Checksum-verified snapshots. Restores stage first and need a second staff member’s approval.
      </p>
      {list.error ? (
        <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="table-scroll" style={{ marginTop: 8, position: 'relative' }}>
          <div role="table" aria-label="Restore points">
            <TRow cols={COLS} min={600} head>
              <div role="columnheader">Point</div>
              <div role="columnheader">Type</div>
              <div role="columnheader">Size</div>
              <div role="columnheader">Integrity</div>
              <div role="columnheader">
                <span className="sr-only">Actions</span>
              </div>
            </TRow>
            {list.isPending && <SkeletonRows rows={5} />}
            {list.data?.length === 0 && <Empty>No restore points yet — run a backup to create one.</Empty>}
            {list.data?.map((p) => (
              <TRow key={p.id} cols={COLS} min={600} selected={selected === p.id}>
                <div role="cell" className="min0">
                  <div style={{ fontWeight: 700 }}>{pointName(p)}</div>
                  <div className="t-xs faint">{timeAgo(p.takenAt)}</div>
                </div>
                <div role="cell" className="min0">
                  <Badge pill tone={p.kind === 'Incremental' ? 'flat' : 'accent'}>
                    {p.kind === 'Manual' && p.label ? `Manual — ${p.label}` : p.kind}
                  </Badge>
                </div>
                <div role="cell" className="muted">
                  {p.sizeGb} GB
                </div>
                <div role="cell" className={p.integrity === 'Verified' ? 'fg-good' : 'fg-warn'} style={{ fontSize: 12, fontWeight: 700 }}>
                  {p.integrity === 'Verified' ? '✓ ' : ''}
                  {p.integrity}
                </div>
                <div role="cell" style={{ textAlign: 'right' }}>
                  {can('platform.manage') && (
                    <button
                      type="button"
                      className="link"
                      style={{ fontSize: 12 }}
                      disabled={!!active || p.integrity !== 'Verified'}
                      title={active ? 'Finish or cancel the current restore first' : undefined}
                      aria-label={selected === p.id ? `Close restore from ${pointName(p)}` : `Restore from ${pointName(p)}`}
                      onClick={() => setSelected((s) => (s === p.id ? null : p.id))}
                    >
                      {selected === p.id ? 'Close' : 'Restore…'}
                    </button>
                  )}
                </div>
              </TRow>
            ))}
          </div>
        </div>
      )}
      {selectedPoint && !active && <StageRestoreForm point={selectedPoint} walDays={walDays} onDone={() => setSelected(null)} />}

      {history.length > 0 && (
        <>
          <h3 className="eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>
            Recent restores
          </h3>
          <ul className="plain-list">
            {history.map((r) => (
              <li key={r.id} className="row wrap" style={{ gap: 10, fontSize: 12.5 }}>
                <span className="min0" style={{ flex: 1, minWidth: 220 }}>
                  <span style={{ fontWeight: 600 }}>
                    {r.dryRun ? 'Dry run' : 'Live restore'} · {r.scopeLabel}
                  </span>{' '}
                  <span className="muted">← {r.sourceLabel}</span>
                  <div className="t-xs faint">
                    Staged by {r.stagedByName}
                    {r.approvedByName ? ` · approved by ${r.approvedByName}` : ''} · {timeAgo(r.completedAt ?? r.stagedAt)}
                  </div>
                </span>
                <Badge tone={statusBadge[r.status][0]}>{statusBadge[r.status][1]}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
