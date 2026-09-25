import { Link } from 'react-router-dom';
import { Bar, Card, Empty, ErrorState, Kpi, Screen, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { money, monthName, num, scoreTone, toneDot, toneFg } from '@/lib/format';
import { useGrowth } from '../api';
import { FunnelBar, KpiSkeletons } from '../components/charts';
import { deltaTone, signed } from '../format';
import { t as tPlain, useT } from '../i18n';
import type { FunnelStage, Growth, OnboardingStage } from '../types';

const funnelLabel = (s: FunnelStage) => tPlain(`growth.funnel.stage.${s}`);
const onboardingLabel = (s: OnboardingStage) => tPlain(`growth.onboarding.stage.${s}`);
const COHORT_COLS = 6;
/** Bars on a log scale so the bottom of a 300:1 funnel stays visible. */
const logWidth = (n: number, max: number) => Math.max(4, Math.round((Math.log10(n + 1) / Math.log10(max + 1)) * 100));

function Kpis({ k }: { k: Growth['kpis'] }) {
  const t = useT();
  const d = (n: number, unit: 'pts' | '', higherIsBetter = true) => ({
    delta: unit === 'pts' ? t('growth.kpis.pts', { value: signed(n) }) : signed(n),
    deltaColor: toneFg(deltaTone(n, higherIsBetter)),
    deltaSuffix: t('growth.kpis.vsLastQuarter'),
  });
  return (
    <div className="grid-kpi">
      <Kpi
        label={t('growth.kpis.revenuePerTenant')}
        value={t('growth.kpis.perMonth', { amount: money(k.revenuePerTenant) })}
        sub={t('growth.kpis.payingTenants', { count: k.payingTenants })}
      />
      <Kpi label={t('growth.kpis.trialConversion')} value={`${k.trialConversionPct}%`} {...d(k.trialConversionDeltaPts, 'pts')} />
      <Kpi
        label={t('growth.kpis.netRevenueRetention')}
        value={`${k.netRevenueRetentionPct}%`}
        {...d(k.netRevenueRetentionDeltaPts, 'pts')}
      />
      <Kpi label={t('growth.kpis.averageNps')} value={num(k.nps)} {...d(k.npsDelta, '')} />
      <Kpi label={t('growth.kpis.logoChurn')} value={`${k.logoChurnPct}%`} {...d(k.logoChurnDeltaPts, 'pts', false)} />
    </div>
  );
}

function AcquisitionFunnel({ funnel }: { funnel: Growth['funnel'] }) {
  const t = useT();
  const max = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <figure style={{ margin: 0 }}>
      <div className="stack" style={{ gap: 10, marginTop: 8 }} aria-hidden="true">
        {funnel.map((f) => (
          <FunnelBar
            key={f.stage}
            label={funnelLabel(f.stage)}
            right={num(f.count)}
            width={logWidth(f.count, max)}
            h={18}
            foot={f.ratePct != null ? t(`growth.funnel.rate.${f.stage}`, { rate: f.ratePct }) : undefined}
          />
        ))}
      </div>
      <figcaption className="faint" style={{ fontSize: 11, marginTop: 10 }}>
        {t('growth.funnel.logScale')}
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>{t('growth.funnel.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('growth.funnel.colStage')}</th>
              <th scope="col">{t('growth.funnel.colCount')}</th>
              <th scope="col">{t('growth.funnel.colConversion')}</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((f) => (
              <tr key={f.stage}>
                <th scope="row">{funnelLabel(f.stage)}</th>
                <td>{num(f.count)}</td>
                <td>{f.ratePct != null ? `${f.ratePct}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Cohort heat map. A real table (styled as a grid) so it reads correctly with a screen reader. */
function CohortTable({ cohorts }: { cohorts: Growth['cohorts'] }) {
  const t = useT();
  const cellBase = { height: 30, borderRadius: 5, fontSize: 11, fontWeight: 600, textAlign: 'center', padding: 0 } as const;
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, marginTop: 4, tableLayout: 'fixed', minWidth: 300 }}>
          <caption className="sr-only">{t('growth.cohorts.caption')}</caption>
          <thead>
            <tr>
              <td style={{ width: 38 }} />
              {Array.from({ length: COHORT_COLS }, (_, i) => (
                <th key={i} scope="col" className="faint" style={{ fontSize: 11, fontWeight: 600 }}>
                  <abbr title={t('growth.cohorts.monthTitle', { index: i })} style={{ textDecoration: 'none' }}>
                    {t('growth.cohorts.monthShort', { index: i })}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.month}>
                <th scope="row" className="faint" style={{ fontSize: 11, fontWeight: 600, textAlign: 'left' }}>
                  {monthName(c.month)}
                </th>
                {Array.from({ length: COHORT_COLS }, (_, i) => {
                  const v = c.retention[i];
                  return v == null ? (
                    <td key={i} style={{ ...cellBase, background: 'var(--track)' }}>
                      <span className="sr-only">{t('growth.cohorts.noData')}</span>
                    </td>
                  ) : (
                    <td
                      key={i}
                      style={{
                        ...cellBase,
                        background: heatFill(v),
                        color: v >= HEAT_SPLIT ? 'var(--onFill)' : 'var(--onFillLight)',
                      }}
                    >
                      {v}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>
        {t('growth.cohorts.note')}
      </div>
    </>
  );
}

function Onboarding({ g }: { g: Growth }) {
  const t = useT();
  const total = Math.max(1, g.totalTenants);
  return (
    <figure style={{ margin: 0 }}>
      <div className="stack" style={{ gap: 10, marginTop: 8 }} aria-hidden="true">
        {g.onboarding.map((o) => (
          <FunnelBar
            key={o.stage}
            label={onboardingLabel(o.stage)}
            right={t('growth.onboarding.tenants', { count: o.tenants })}
            width={Math.round((o.tenants / total) * 100)}
            h={16}
          />
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>{t('growth.onboarding.caption')}</caption>
          <tbody>
            {g.onboarding.map((o) => (
              <tr key={o.stage}>
                <th scope="row">{onboardingLabel(o.stage)}</th>
                <td>{t('growth.onboarding.tenants', { count: o.tenants })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * Opaque brand-hue heat scale. Lightness jumps across HEAT_SPLIT so every cell keeps ≥ 4.5:1 text contrast
 * (ink on light cells, white on dense ones) — alpha tints have a mid band where neither text colour passes.
 */
const HEAT_SPLIT = 70;
function heatFill(v: number) {
  const l = v < HEAT_SPLIT ? 0.95 - (v / HEAT_SPLIT) * 0.25 : 0.55 - ((v - HEAT_SPLIT) / (100 - HEAT_SPLIT)) * 0.13;
  return `oklch(${l.toFixed(3)} calc(var(--brandC) * 0.9) var(--brandH))`;
}

export default function GrowthPage() {
  const t = useT();
  const q = useGrowth();
  const can = useCan();
  const g = q.data;

  if (q.error)
    return (
      <Screen max={1150}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const tenantLink = (id: string, name: string) =>
    can('tenants.view') ? (
      <Link to={`/tenants/${id}`} style={{ color: 'inherit' }}>
        {name}
      </Link>
    ) : (
      name
    );

  return (
    <Screen max={1150} label={t('growth.title')}>
      {g ? <Kpis k={g.kpis} /> : <KpiSkeletons n={5} />}

      <div className="grid-2">
        <Card title={t('growth.funnel.title')}>{g ? <AcquisitionFunnel funnel={g.funnel} /> : <SkeletonRows rows={5} h={24} />}</Card>
        <Card title={t('growth.cohorts.title')}>{g ? <CohortTable cohorts={g.cohorts} /> : <SkeletonRows rows={6} h={24} />}</Card>
      </div>

      <Card title={t('growth.health.title')} right={<span className="card-sub">{t('growth.health.sub')}</span>}>
        {!g ? (
          <SkeletonRows rows={5} h={20} />
        ) : g.healthScores.length === 0 ? (
          <Empty>{t('growth.health.empty')}</Empty>
        ) : (
          <ul className="stack plain-list">
            {g.healthScores.map((h) => (
              <li key={h.tenantId} className="row wrap" style={{ gap: 14 }}>
                <span className="ellipsis" style={{ width: 190, fontWeight: 600, flexShrink: 0 }}>
                  {tenantLink(h.tenantId, h.name)}
                </span>
                <Bar value={h.score} color={toneDot(scoreTone(h.score))} size="md" style={{ minWidth: 120 }} />
                <span style={{ width: 34, textAlign: 'right', fontWeight: 700 }}>
                  <span className="sr-only">{t('growth.health.score')}</span>
                  {h.score}
                </span>
                <span className="muted" style={{ flex: '0 1 290px', minWidth: 0, fontSize: 12 }}>
                  {h.driver}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card title={t('growth.onboarding.title')} style={{ flex: '1.3 1 380px', minWidth: 0 }}>
          {g ? <Onboarding g={g} /> : <SkeletonRows rows={5} h={22} />}
        </Card>
        <Card title={t('growth.stuck.title')} style={{ flex: '1 1 300px', minWidth: 0 }}>
          {!g ? (
            <SkeletonRows rows={2} h={30} />
          ) : g.stuck.length ? (
            <ul className="stack plain-list">
              {g.stuck.map((s) => (
                <li key={s.tenantId} className="row" style={{ display: 'block' }}>
                  <div style={{ fontWeight: 600 }}>{tenantLink(s.tenantId, s.name)}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {t('growth.stuck.line', { stage: onboardingLabel(s.stage), count: s.days })}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('growth.stuck.empty')}</Empty>
          )}
          <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
            {t('growth.stuck.note')}
          </div>
        </Card>
      </div>
    </Screen>
  );
}
