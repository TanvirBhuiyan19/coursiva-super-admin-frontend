import { Badge, Bar, ConfirmButton, Empty, ErrorState, KpiRow, Screen, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { formatDate, num } from '@/lib/format';
import { toast } from '@/store/ui';
import { useExperimentAction, useExperiments } from '../api';
import { KpiSkeletons } from '../components/charts';
import { signed } from '../format';
import { t as tPlain, useT } from '../i18n';
import type { Experiment } from '../types';

const COLS = 'minmax(0,2fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,1.1fr) minmax(0,1.9fr)';

function statusBadge(e: Experiment): { text: string; tone: Tone } {
  if (e.status === 'shipped') return { text: tPlain('experiments.shipped'), tone: 'good' };
  if (e.status === 'stopped') return { text: tPlain('experiments.stopped'), tone: 'flat' };
  return {
    text: tPlain(`experiments.verdict.${e.verdict}`),
    tone: e.verdict === 'Winning' ? 'good' : e.verdict === 'Losing' ? 'bad' : 'warn',
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

export default function ExperimentsPage() {
  const t = useT();
  const q = useExperiments();
  const can = useCan();
  const x = q.data;

  if (q.error)
    return (
      <Screen max={1250}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1250} label={t('experiments.title')}>
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
                    <div className="ellipsis" style={{ fontWeight: 600 }}>
                      {e.name}
                    </div>
                    <div className="faint ellipsis" style={{ fontSize: 11 }}>
                      {e.surface}
                      {e.flagKey && <span className="mono"> · {e.flagKey}</span>}
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
    </Screen>
  );
}
