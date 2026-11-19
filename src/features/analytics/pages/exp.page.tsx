import { useState } from 'react';
import {
  Badge,
  Bar,
  ConfirmButton,
  Drawer,
  Empty,
  ErrorState,
  Field,
  FormError,
  Input,
  KpiRow,
  Modal,
  Screen,
  Select,
  SkeletonRows,
  Spinner,
  TRow,
  Textarea,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useFeatureFlags } from '@/features/platform/api';
import type { FeatureFlag } from '@/features/platform/types';
import { ApiError, errorMessage } from '@/lib/api/errors';
import type { Tone } from '@/lib/domain';
import { formatDate, num } from '@/lib/format';
import { toast } from '@/store/ui';
import { useCreateExperiment, useDeleteExperiment, useExperiment, useExperimentAction, useExperiments, useUpdateExperiment } from '../api';
import { KpiSkeletons } from '../components/charts';
import { signed } from '../format';
import { t as tPlain, useT } from '../i18n';
import { EXPERIMENT_METRICS, type Experiment, type ExperimentDetail, type ExperimentMetric } from '../types';

const COLS = 'minmax(0,2fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,1.1fr) minmax(0,1.9fr)';

function statusBadge(e: Experiment): { text: string; tone: Tone } {
  if (e.status === 'shipped') return { text: tPlain('experiments.shipped'), tone: 'good' };
  if (e.status === 'stopped') return { text: tPlain('experiments.stopped'), tone: 'flat' };
  return {
    text: tPlain(`experiments.verdict.${e.verdict}`),
    tone: e.verdict === 'Winning' ? 'good' : e.verdict === 'Losing' ? 'bad' : e.verdict === 'Collecting data' ? 'flat' : 'warn',
  };
}

function Actions({ e }: { e: Experiment }) {
  const t = useT();
  const act = useExperimentAction();
  const busy = act.isPending && act.variables.id === e.id;
  const run = (action: 'promote' | 'stop') =>
    act.mutate(
      { id: e.id, action },
      {
        onSuccess: () =>
          toast(action === 'promote' ? t('experiments.promoted', { name: e.name }) : t('experiments.stoppedToast', { name: e.name })),
      },
    );
  return (
    <>
      <ConfirmButton
        className="btn btn--sm"
        confirmLabel={t('experiments.confirmPromote')}
        onConfirm={() => run('promote')}
        pending={busy && act.variables.action === 'promote'}
        disabled={act.isPending}
      >
        {t('experiments.promote')}
      </ConfirmButton>
      <ConfirmButton
        className="btn btn--sm btn--ghost"
        confirmLabel={t('experiments.confirmStop')}
        onConfirm={() => run('stop')}
        pending={busy && act.variables.action === 'stop'}
        disabled={act.isPending}
      >
        {t('experiments.stop')}
      </ConfirmButton>
    </>
  );
}

/** A stopped or shipped experiment can be deleted with its results (two-step confirm). */
function DeleteAction({ e }: { e: Experiment }) {
  const t = useT();
  const del = useDeleteExperiment();
  return (
    <ConfirmButton
      className="btn btn--sm btn--ghost"
      confirmLabel={t('experiments.confirmDelete')}
      onConfirm={() => del.mutate(e.id, { onSuccess: () => toast(t('experiments.deletedToast', { name: e.name })) })}
      pending={del.isPending}
      disabled={del.isPending}
    >
      {t('experiments.delete')}
    </ConfirmButton>
  );
}

/**
 * Why a flag can't be experimented on (null when it can). While an experiment runs, schools in control have the flag
 * off, so a flag that already reaches schools (on for all tenants or a partial rollout) would be taken away from them.
 * Off, or on for the Beta list only (overridden schools, which experiments exclude), is fine. The server enforces the
 * same rule (422 experiment_flag_already_live).
 */
function liveReason(f: Pick<FeatureFlag, 'enabled' | 'rollout'>): string | null {
  if (!f.enabled || f.rollout === 'Beta list') return null;
  return f.rollout === 'All tenants'
    ? tPlain('experiments.create.liveAll')
    : tPlain('experiments.create.livePartial', { rollout: f.rollout });
}

type CreateErrors = Partial<Record<'name' | 'surface' | 'flagKey' | 'metric' | 'allocationPct' | 'hypothesis', string>>;

/** POST /analytics/experiments: a flag, a metric and the share of schools in the variant. */
function NewExperimentModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const flags = useFeatureFlags();
  const create = useCreateExperiment();
  const [name, setName] = useState('');
  const [surface, setSurface] = useState('');
  const [flagKey, setFlagKey] = useState('');
  const [metric, setMetric] = useState<ExperimentMetric>('trial_converted');
  const [allocation, setAllocation] = useState(20);
  const [hypothesis, setHypothesis] = useState('');
  const [errors, setErrors] = useState<CreateErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setErrors({});
    setFormError(null);
    if (!name.trim() || !surface.trim() || !flagKey) {
      setFormError(t('experiments.create.required'));
      return;
    }
    create.mutate(
      { name: name.trim(), surface: surface.trim(), flagKey, metric, allocationPct: allocation, hypothesis: hypothesis.trim() || null },
      {
        onSuccess: (d) => {
          toast(t('experiments.create.started', { name: d.name }));
          onClose();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'experiment_flag_busy') {
            setErrors({ flagKey: t('experiments.create.busy') });
            return;
          }
          if (err instanceof ApiError && (err.code === 'experiment_flag_already_live' || err.code === 'experiment_flag_no_effect')) {
            setErrors({ flagKey: err.message });
            return;
          }
          if (err instanceof ApiError && err.isValidation) {
            const out: CreateErrors = {};
            for (const k of ['name', 'surface', 'flagKey', 'metric', 'allocationPct', 'hypothesis'] as const) {
              const m = err.field(k);
              if (m) out[k] = m;
            }
            if (Object.keys(out).length) {
              setErrors(out);
              return;
            }
          }
          setFormError(errorMessage(err));
        },
      },
    );
  };

  // A flag nothing reads is listed but can't be chosen: both groups would get the same product (server: 422
  // experiment_flag_no_effect).
  const flagOptions = [
    ['', '—'] as const,
    ...(flags.data ?? []).map((f) => {
      const tag = !f.gates ? t('experiments.create.noEffectTag') : liveReason(f) ? t('experiments.create.liveTag') : null;
      return [f.key, `${f.name} · ${f.key}${tag ? ` (${tag})` : ''}`] as const;
    }),
  ];
  const inert = (flags.data ?? []).filter((f) => !f.gates).map((f) => f.key);
  const selected = flags.data?.find((f) => f.key === flagKey);
  const ineligible = selected ? (selected.gates ? liveReason(selected) : t('experiments.create.noEffect')) : null;
  return (
    <Modal onClose={onClose} label={t('experiments.create.title')} width={520}>
      <form
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="modal-title" style={{ margin: 0 }}>
          {t('experiments.create.title')}
        </h2>
        <Field label={t('experiments.create.name')} error={errors.name}>
          {(p) => <Input {...p} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('experiments.create.surface')} hint={t('experiments.create.surfaceHint')} error={errors.surface}>
          {(p) => <Input {...p} value={surface} maxLength={80} onChange={(e) => setSurface(e.target.value)} />}
        </Field>
        <Field
          label={t('experiments.create.flag')}
          hint={t('experiments.create.flagHint')}
          error={errors.flagKey ?? ineligible ?? undefined}
        >
          {(p) => (
            <Select<string>
              id={p.id}
              value={flagKey}
              onChange={(v) => {
                setFlagKey(v);
                setErrors(({ flagKey: _stale, ...rest }) => rest);
              }}
              options={flagOptions}
              disabledOptions={inert}
              style={{ width: '100%' }}
            />
          )}
        </Field>
        <Field label={t('experiments.create.metric')} error={errors.metric}>
          {(p) => (
            <Select<ExperimentMetric>
              id={p.id}
              value={metric}
              onChange={setMetric}
              options={EXPERIMENT_METRICS.map((m) => [m, t(`experiments.metric.${m}`)] as const)}
              style={{ width: '100%' }}
            />
          )}
        </Field>
        <Field label={t('experiments.create.allocation')} error={errors.allocationPct}>
          {(p) => (
            <div className="hstack" style={{ gap: 12 }}>
              <input
                {...p}
                type="range"
                min={1}
                max={50}
                step={1}
                value={allocation}
                onChange={(e) => setAllocation(Number(e.target.value))}
                style={{ flex: 1 }}
                aria-valuetext={t('experiments.create.allocationValue', { pct: allocation })}
              />
              <span className="mono nowrap" style={{ minWidth: 92, textAlign: 'right' }}>
                {t('experiments.create.allocationValue', { pct: allocation })}
              </span>
            </div>
          )}
        </Field>
        <Field label={t('experiments.create.hypothesis')} hint={t('experiments.create.hypothesisHint')} error={errors.hypothesis}>
          {(p) => <Textarea {...p} rows={3} maxLength={300} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />}
        </Field>
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            {t('experiments.create.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={create.isPending || ineligible !== null}>
            {create.isPending && <Spinner />} {t('experiments.create.start')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetailBody({ d, canEdit }: { d: ExperimentDetail; canEdit: boolean }) {
  const t = useT();
  const update = useUpdateExperiment();
  const [hypothesis, setHypothesis] = useState(d.hypothesis ?? '');
  const collecting = d.verdict === 'Collecting data';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
      <div className="faint" style={{ fontSize: 12, lineHeight: 1.6 }}>
        <div>{t('experiments.detail.metric', { metric: t(`experiments.metric.${d.metric}`) })}</div>
        <div>{t('experiments.detail.allocation', { pct: d.allocationPct })}</div>
        <div>{t('experiments.detail.started', { date: formatDate(d.startedAt) })}</div>
      </div>
      <section aria-label={t('experiments.detail.arms')}>
        <div role="table" aria-label={t('experiments.detail.arms')}>
          <TRow cols="minmax(0,1.6fr) 80px 80px 70px" head style={{ gap: 8 }}>
            <div role="columnheader">{t('experiments.detail.arms')}</div>
            <div role="columnheader">{t('experiments.detail.exposed')}</div>
            <div role="columnheader">{t('experiments.detail.converted')}</div>
            <div role="columnheader">{t('experiments.detail.rate')}</div>
          </TRow>
          {d.arms.map((a) => (
            <TRow key={a.arm} cols="minmax(0,1.6fr) 80px 80px 70px" style={{ gap: 8, padding: '8px 0' }}>
              <div role="cell">{t(`experiments.detail.arm.${a.arm}`)}</div>
              <div role="cell" className="mono">
                {num(a.exposed)}
              </div>
              <div role="cell" className="mono">
                {num(a.converted)}
              </div>
              <div role="cell" className="mono">
                {a.ratePct}%
              </div>
            </TRow>
          ))}
        </div>
      </section>
      {collecting && d.status === 'running' && (
        <div className="callout" role="status">
          {t('experiments.detail.collecting', { min: d.minTenants, control: d.controlN, variant: d.variantN })}
        </div>
      )}
      {d.previousFlag && d.status === 'running' && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          {t('experiments.detail.previous', {
            state: d.previousFlag.enabled ? t('experiments.detail.on') : t('experiments.detail.off'),
            rollout: d.previousFlag.rollout,
          })}
        </p>
      )}
      <Field label={t('experiments.detail.hypothesis')}>
        {(p) =>
          canEdit ? (
            <Textarea {...p} rows={3} maxLength={300} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
          ) : (
            <p id={p.id} style={{ margin: 0 }}>
              {d.hypothesis ?? t('experiments.detail.noHypothesis')}
            </p>
          )
        }
      </Field>
      {canEdit && (
        <div>
          <button
            type="button"
            className="btn btn--sm"
            disabled={update.isPending || hypothesis.trim() === (d.hypothesis ?? '')}
            onClick={() =>
              update.mutate({ id: d.id, hypothesis: hypothesis.trim() || null }, { onSuccess: () => toast(t('experiments.detail.saved')) })
            }
          >
            {update.isPending && <Spinner />} {t('experiments.detail.saveHypothesis')}
          </button>
        </div>
      )}
    </div>
  );
}

function ExperimentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const can = useCan();
  const q = useExperiment(id);
  const d = q.data;
  return (
    <Drawer onClose={onClose} label={d ? t('experiments.detail.title', { name: d.name }) : t('experiments.title')} width={460}>
      <div className="hstack" style={{ justifyContent: 'space-between', gap: 8, padding: '16px 18px 0' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>{d?.name ?? t('experiments.title')}</h2>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
          {t('experiments.detail.close')}
        </button>
      </div>
      <div className="drawer-body" style={{ padding: 18 }}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !d ? (
          <SkeletonRows rows={4} h={20} />
        ) : (
          <DetailBody key={d.id} d={d} canEdit={can('platform.manage')} />
        )}
      </div>
    </Drawer>
  );
}

export default function ExperimentsPage() {
  const t = useT();
  const q = useExperiments();
  const can = useCan();
  const x = q.data;
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  if (q.error)
    return (
      <Screen max={1250}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1250} label={t('experiments.title')}>
      {can('platform.manage') && (
        <div className="hstack" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setCreating(true)}>
            {t('experiments.newExperiment')}
          </button>
        </div>
      )}
      {x ? (
        <KpiRow
          items={[
            { label: t('experiments.kpis.running'), value: num(x.kpis.running), sub: t('experiments.kpis.runningSub') },
            { label: t('experiments.kpis.significant'), value: num(x.kpis.significant), sub: t('experiments.kpis.significantSub') },
            { label: t('experiments.kpis.shipped'), value: num(x.kpis.shipped90d), sub: t('experiments.kpis.shippedSub') },
            {
              label: t('experiments.kpis.avgLift'),
              value: x.kpis.avgWinningLiftPct == null ? '—' : signed(x.kpis.avgWinningLiftPct, '%'),
              sub: t('experiments.kpis.avgLiftSub'),
            },
          ]}
        />
      ) : (
        <KpiSkeletons n={4} />
      )}

      <section className="card table-scroll" aria-label={t('experiments.title')} style={{ padding: '6px 18px 4px' }}>
        {!x ? (
          <SkeletonRows rows={5} h={24} />
        ) : x.experiments.length === 0 ? (
          <Empty>{t('experiments.empty')}</Empty>
        ) : (
          <div role="table" aria-label={t('experiments.title')}>
            <TRow cols={COLS} min={980} head style={{ gap: 10 }}>
              <div role="columnheader">{t('experiments.cols.experiment')}</div>
              <div role="columnheader">{t('experiments.cols.exposure')}</div>
              <div role="columnheader">{t('experiments.cols.control')}</div>
              <div role="columnheader">{t('experiments.cols.variant')}</div>
              <div role="columnheader">{t('experiments.cols.lift')}</div>
              <div role="columnheader">{t('experiments.cols.confidence')}</div>
              <div role="columnheader">{t('experiments.cols.verdict')}</div>
            </TRow>
            {x.experiments.map((e) => {
              const b = statusBadge(e);
              return (
                <TRow key={e.id} cols={COLS} min={980} style={{ gap: 10, padding: '12px 0', fontSize: 12.5 }}>
                  <div role="cell" className="min0">
                    <button
                      type="button"
                      className="link ellipsis"
                      style={{ fontWeight: 600, display: 'block', maxWidth: '100%', textAlign: 'left' }}
                      onClick={() => setOpen(e.id)}
                      aria-label={t('experiments.detail.open', { name: e.name })}
                    >
                      {e.name}
                    </button>
                    <div className="faint ellipsis" style={{ fontSize: 11 }}>
                      {e.surface}
                      {e.flagKey && <span className="mono"> · {e.flagKey}</span>}
                      <span> · {t(`experiments.metric.${e.metric}`)}</span>
                    </div>
                  </div>
                  <div role="cell" className="muted nowrap">
                    {t('experiments.exposed', { count: e.exposed })}
                  </div>
                  <div role="cell">{e.controlPct}%</div>
                  <div role="cell" style={{ fontWeight: 700 }}>
                    {e.variantPct}%
                  </div>
                  <div role="cell" className={e.liftPct >= 0 ? 'fg-good' : 'fg-bad'} style={{ fontWeight: 700 }}>
                    {signed(e.liftPct, '%')}
                  </div>
                  <div role="cell" className="hstack" style={{ gap: 6 }}>
                    <Bar value={e.confidencePct} size="thin" tone={e.significant ? 'good' : 'accent'} />
                    <span className="muted" style={{ fontSize: 11 }}>
                      {e.confidencePct}%
                    </span>
                  </div>
                  <div role="cell" className="hstack wrap" style={{ gap: 8 }}>
                    <Badge tone={b.tone} style={{ fontSize: 11, padding: '3px 8px' }}>
                      {b.text}
                    </Badge>
                    {e.status === 'running' && can('platform.manage') && <Actions e={e} />}
                    {e.status !== 'running' && e.endedAt && <span className="faint t-xs">{formatDate(e.endedAt)}</span>}
                    {e.status !== 'running' && can('platform.manage') && <DeleteAction e={e} />}
                  </div>
                </TRow>
              );
            })}
          </div>
        )}
      </section>

      <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
        {t('experiments.note')}
      </div>
      {creating && <NewExperimentModal onClose={() => setCreating(false)} />}
      {open && <ExperimentDrawer id={open} onClose={() => setOpen(null)} />}
    </Screen>
  );
}
