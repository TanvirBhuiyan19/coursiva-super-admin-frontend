import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Badge, Card, Empty, Field, FormError, Input, Pagination, SkeletonRows, Spinner, Toggle, TRow, ErrorState } from '@/components/ui';
import { SearchPicker } from '@/components/ui/SearchPicker';
import { useCan } from '@/features/auth/useCan';
import { useTenantSearch } from '@/features/tenants/api';
import { errorMessage } from '@/lib/api/errors';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useBackupPoints, useRestores, useRunBackup, useRunDrill, useStageRestore } from '../api';
import { t as tStatic, useT } from '../i18n';
import type { BackupPoint, Restore } from '../types';

const COLS = 'minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,0.6fr) minmax(0,0.8fr) minmax(0,0.7fr)';
const DAY = 86_400_000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The last `n` UTC days as YYYY-MM-DD, labelled Today / Yesterday / "Sep 21". */
function recentDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const iso = new Date(Date.now() - i * DAY).toISOString();
    return { value: iso.slice(0, 10), label: i === 0 ? tStatic('points.today') : i === 1 ? tStatic('points.yesterday') : formatDate(iso) };
  });
}

const stageSchema = z
  .object({
    pitrDate: z.string(),
    pitrTime: z
      .string()
      .trim()
      .refine((v) => v === '' || TIME_RE.test(v), { error: () => tStatic('points.timeFormat') }),
    scope: z.string().min(1, { error: () => tStatic('points.chooseScope') }),
    dryRun: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.pitrTime && TIME_RE.test(v.pitrTime) && new Date(`${v.pitrDate}T${v.pitrTime}:00Z`).getTime() > Date.now())
      ctx.addIssue({ code: 'custom', path: ['pitrTime'], message: tStatic('points.future') });
  });

const pointName = (p: BackupPoint) => formatDateTime(p.takenAt);

/** Restore one school: search every school server-side (the scope select then names the picked one). */
function TenantScopePicker({ onPick }: { onPick: (tenant: { id: string; name: string }) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const matches = useTenantSearch(search);
  return (
    <SearchPicker
      label={t('points.findTenant')}
      placeholder={t('points.findTenant')}
      query={query}
      onQueryChange={setQuery}
      options={(matches.data?.data ?? []).map((tn) => ({ value: tn.id, label: tn.name, sub: tn.domain }))}
      loading={matches.isFetching}
      error={matches.isError ? t('points.searchFailed') : null}
      onPick={(o) => {
        onPick({ id: o.value, name: o.label });
        setQuery('');
      }}
    />
  );
}

function StageRestoreForm({ point, walDays, onDone }: { point: BackupPoint; walDays: number; onDone: () => void }) {
  const t = useT();
  const can = useCan();
  const stage = useStageRestore();
  const days = recentDays(walDays + 1);
  const form = useZodForm(stageSchema, {
    defaultValues: { pitrDate: days[0]!.value, pitrTime: '', scope: 'platform', dryRun: true },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<{ id: string; name: string } | null>(null);
  // Select the picked school once its option is rendered (setting the value before the option exists is lost).
  useEffect(() => {
    if (tenant) form.setValue('scope', tenant.id, { shouldDirty: true });
  }, [tenant, form]);
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
              ? t('points.pitrStaged', { target: r.sourceLabel.replace(' (point-in-time)', '') })
              : t('points.staged', { scope: r.scopeLabel }),
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
      aria-label={t('points.restoreFrom', { point: pointName(point) })}
      style={{ background: 'var(--pg)', border: '1px solid var(--bd2)', borderRadius: 11, padding: 16, marginTop: 12 }}
    >
      <h3 style={{ fontWeight: 700, fontSize: 13 }}>{t('points.restoreFrom', { point: pointName(point) })}</h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: 14,
          marginTop: 4,
          alignItems: 'start',
        }}
      >
        {/* No transaction-log archive (wal_window_days 0): snapshots only, the API refuses point-in-time targets. */}
        {walDays > 0 && (
          <>
            <Field label={t('points.pitrDay')} error={errs.pitrDate?.message}>
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
            <Field label={t('points.pitrTime')} error={errs.pitrTime?.message} hint={t('points.pitrHint', { days: walDays })}>
              {(p) => (
                <Input
                  {...p}
                  {...form.register('pitrTime')}
                  placeholder={t('points.timePlaceholder')}
                  inputMode="numeric"
                  autoComplete="off"
                />
              )}
            </Field>
          </>
        )}
        <Field label={t('points.scope')} error={errs.scope?.message}>
          {(p) => (
            <select {...p} {...form.register('scope')} className="select">
              <option value="platform">{t('points.fullPlatform')}</option>
              {tenant && <option value={tenant.id}>{t('points.tenantOption', { name: tenant.name })}</option>}
            </select>
          )}
        </Field>
        {can('tenants.view') && (
          <div>
            <TenantScopePicker onPick={setTenant} />
          </div>
        )}
      </div>
      <div className="hstack wrap" style={{ gap: 12, marginTop: 14 }}>
        <Toggle on={dryRun} onChange={(v) => form.setValue('dryRun', v, { shouldDirty: true })} label={t('points.dryRunToggle')} />
        <span className="t-sm muted" style={{ flex: 1, minWidth: 200 }}>
          {dryRun ? t('points.dryRunToggle') : t('points.liveHint')}
        </span>
        <button type="button" className="btn" onClick={onDone}>
          {t('points.close')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={stage.isPending}>
          {stage.isPending && <Spinner />} {t('points.stage')}
        </button>
      </div>
      <FormError>{formError}</FormError>
      <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
        {t('points.note')}
      </p>
    </form>
  );
}

const STATUS_TONE: Record<Restore['status'], 'good' | 'warn' | 'flat' | 'info' | 'bad'> = {
  staged: 'warn',
  approved: 'info',
  running: 'info',
  completed: 'good',
  cancelled: 'flat',
  failed: 'bad',
};

/** Every restore, newest first, one page at a time (`?restoresPage=`). */
function RestoreHistory() {
  const t = useT();
  const [state, setState] = useUrlState({ restoresPage: '1' });
  const q = useRestores(Math.max(1, Number(state.restoresPage) || 1));
  if (q.isPending || q.isError || q.data.meta.total === 0) {
    return q.isError ? <ErrorState compact error={q.error} onRetry={() => void q.refetch()} /> : null;
  }
  return (
    <>
      <h3 className="eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>
        {t('points.recent')}
      </h3>
      <ul className="plain-list" aria-busy={q.isPlaceholderData} style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
        {q.data.data.map((r) => (
          <li key={r.id} className="row wrap" style={{ gap: 10, fontSize: 12.5 }}>
            <span className="min0" style={{ flex: 1, minWidth: 220 }}>
              <span style={{ fontWeight: 600 }}>
                {t('points.historyLine', { kind: r.dryRun ? t('banner.dryRun') : t('banner.live'), scope: r.scopeLabel })}
              </span>{' '}
              <span className="muted">← {r.sourceLabel}</span>
              <div className="t-xs faint">
                {t('points.stagedBy', { name: r.stagedByName })}
                {r.approvedByName ? t('points.approvedBy', { name: r.approvedByName }) : ''} · {timeAgo(r.completedAt ?? r.stagedAt)}
              </div>
            </span>
            <Badge tone={STATUS_TONE[r.status]}>{t(`enums.restoreStatus.${r.status}`)}</Badge>
          </li>
        ))}
      </ul>
      <Pagination meta={q.data.meta} onPage={(p) => setState({ restoresPage: String(p) })} noun={t('points.restoresNoun')} />
    </>
  );
}

export function RestorePoints({ walDays, active }: { walDays: number; active: Restore | undefined }) {
  const t = useT();
  const can = useCan();
  const [state, setState] = useUrlState({ pointsPage: '1' });
  const list = useBackupPoints(Math.max(1, Number(state.pointsPage) || 1));
  const run = useRunBackup();
  const drill = useRunDrill();
  const [selected, setSelected] = useState<string | null>(null);
  const selectedPoint = list.data?.data.find((p) => p.id === selected);

  return (
    <Card
      title={t('points.title')}
      right={
        can('platform.manage') ? (
          <div className="hstack wrap" style={{ gap: 8, marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn"
              disabled={drill.isPending}
              onClick={() =>
                drill.mutate(undefined, {
                  onSuccess: () => toast(t('points.drillPassed')),
                })
              }
            >
              {drill.isPending && <Spinner />} {t('points.runDrill')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={run.isPending}
              onClick={() => run.mutate(undefined, { onSuccess: (p) => toast(t('points.manualDone', { size: p.sizeGb })) })}
            >
              {run.isPending && <Spinner />} {t('points.backUpNow')}
            </button>
          </div>
        ) : undefined
      }
    >
      <p className="t-sm muted" style={{ marginTop: -4, marginBottom: 0 }}>
        {t('points.intro')}
      </p>
      {list.error ? (
        <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="table-scroll" style={{ marginTop: 8, position: 'relative' }}>
          <div role="table" aria-label={t('points.title')}>
            <TRow cols={COLS} min={600} head>
              <div role="columnheader">{t('points.point')}</div>
              <div role="columnheader">{t('points.type')}</div>
              <div role="columnheader">{t('points.size')}</div>
              <div role="columnheader">{t('points.integrity')}</div>
              <div role="columnheader">
                <span className="sr-only">{t('points.actions')}</span>
              </div>
            </TRow>
            {list.isPending && <SkeletonRows rows={5} />}
            {list.data?.data.length === 0 && <Empty>{t('points.empty')}</Empty>}
            {list.data?.data.map((p) => (
              <TRow key={p.id} cols={COLS} min={600} selected={selected === p.id}>
                <div role="cell" className="min0">
                  <div style={{ fontWeight: 700 }}>{pointName(p)}</div>
                  <div className="t-xs faint">{timeAgo(p.takenAt)}</div>
                </div>
                <div role="cell" className="min0">
                  <Badge pill tone={p.kind === 'Incremental' ? 'flat' : 'accent'}>
                    {p.kind === 'Manual' && p.label ? t('points.manualLabel', { label: p.label }) : t(`enums.kind.${p.kind}`)}
                  </Badge>
                </div>
                <div role="cell" className="muted">
                  {t('points.sizeGb', { size: p.sizeGb })}
                </div>
                <div role="cell" className={p.integrity === 'Verified' ? 'fg-good' : 'fg-warn'} style={{ fontSize: 12, fontWeight: 700 }}>
                  {p.integrity === 'Verified' ? '✓ ' : ''}
                  {t(`enums.integrity.${p.integrity}`)}
                </div>
                <div role="cell" style={{ textAlign: 'right' }}>
                  {can('platform.manage') && (
                    <button
                      type="button"
                      className="link"
                      style={{ fontSize: 12 }}
                      disabled={!!active || p.integrity !== 'Verified'}
                      title={active ? t('points.finishFirst') : undefined}
                      aria-label={t(selected === p.id ? 'points.closeRestoreFrom' : 'points.restoreFrom', { point: pointName(p) })}
                      onClick={() => setSelected((s) => (s === p.id ? null : p.id))}
                    >
                      {selected === p.id ? t('points.close') : t('points.restore')}
                    </button>
                  )}
                </div>
              </TRow>
            ))}
          </div>
        </div>
      )}
      {list.data && <Pagination meta={list.data.meta} onPage={(p) => setState({ pointsPage: String(p) })} noun={t('points.pointsNoun')} />}
      {selectedPoint && !active && <StageRestoreForm point={selectedPoint} walDays={walDays} onDone={() => setSelected(null)} />}

      <RestoreHistory />
    </Card>
  );
}
