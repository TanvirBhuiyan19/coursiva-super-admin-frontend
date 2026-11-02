// Analytics → Live usage (GET /analytics/live): room minutes billed per school, sessions, attendees and peak
// concurrency for a month, a six-month trend and the month's days.
import { Link } from 'react-router-dom';
import { Bar, Card, Empty, ErrorState, Kpi, Screen, Select, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { monthName, num } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { useLiveUsage } from '../api';
import { FunnelBar, KpiSkeletons } from '../components/charts';
import { compactCount } from '../format';
import { useT } from '../i18n';
import type { LiveUsage } from '../types';

const COLS = 'minmax(200px,1.6fr) minmax(170px,1.3fr) 80px 90px 110px 70px';
const NUM = { textAlign: 'right' } as const;

/** Brand-hue fill for a day cell (0 = track); cells carry no text, so the scale only needs to read as more/fewer. */
function dayFill(v: number, max: number) {
  if (!v) return 'var(--track)';
  const l = 0.9 - (v / Math.max(1, max)) * 0.38;
  return `oklch(${l.toFixed(3)} calc(var(--brandC) * 0.9) var(--brandH))`;
}

function Kpis({ u }: { u: LiveUsage }) {
  const t = useT();
  const k = u.totals;
  return (
    <div className="grid-kpi">
      <Kpi small label={t('live.kpis.roomMinutes')} value={compactCount(k.roomMinutes)} sub={t('live.kpis.roomMinutesSub')} />
      <Kpi small label={t('live.kpis.sessions')} value={num(k.sessions)} sub={t('live.kpis.sessionsSub', { count: k.schools })} />
      <Kpi
        small
        label={t('live.kpis.attendees')}
        value={num(k.attendees)}
        sub={t('live.kpis.attendeesSub', { minutes: compactCount(k.participantMinutes) })}
      />
      <Kpi small label={t('live.kpis.peak')} value={num(k.peakConcurrency)} sub={t('live.kpis.peakSub')} />
    </div>
  );
}

function Trend({ u }: { u: LiveUsage }) {
  const t = useT();
  const max = Math.max(1, ...u.trend.map((m) => m.roomMinutes));
  return (
    <Card title={t('live.trend.title')}>
      <div className="stack" style={{ gap: 12, marginTop: 6 }}>
        {u.trend.map((m) => (
          <FunnelBar
            key={m.period}
            label={monthName(m.period, 'long')}
            right={t('live.minutes', { value: compactCount(m.roomMinutes) })}
            width={Math.round((m.roomMinutes / max) * 100)}
            h={m.period === u.period ? 12 : 8}
            foot={t('live.trend.foot', { sessions: num(m.sessions), attendees: num(m.attendees) })}
          />
        ))}
      </div>
    </Card>
  );
}

function Days({ u }: { u: LiveUsage }) {
  const t = useT();
  const max = Math.max(1, ...u.daily.map((d) => d.sessions));
  const month = monthName(u.period, 'long');
  return (
    <Card title={t('live.days.title', { month })}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5, marginTop: 8 }} aria-hidden="true">
        {u.daily.map((d) => (
          <div
            key={d.date}
            title={t('live.days.cell', { date: d.date, sessions: d.sessions, peak: d.peakConcurrency })}
            style={{ height: 26, borderRadius: 5, background: dayFill(d.sessions, max) }}
          />
        ))}
      </div>
      <div className="hstack faint" style={{ gap: 6, fontSize: 11, marginTop: 10, justifyContent: 'flex-end' }} aria-hidden="true">
        {t('live.days.less')}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} style={{ width: 14, height: 10, borderRadius: 3, background: dayFill(f * max, max) }} />
        ))}
        {t('live.days.more')}
      </div>
      <table className="sr-only">
        <caption>{t('live.days.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('live.days.date')}</th>
            <th scope="col">{t('live.days.sessions')}</th>
            <th scope="col">{t('live.days.peak')}</th>
          </tr>
        </thead>
        <tbody>
          {u.daily.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.sessions}</td>
              <td>{d.peakConcurrency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Schools({ u }: { u: LiveUsage }) {
  const t = useT();
  const can = useCan();
  const month = monthName(u.period, 'long');
  return (
    <Card title={t('live.schools.title', { month })} className="table-scroll">
      {u.tenants.length === 0 ? (
        <Empty>{t('live.schools.empty')}</Empty>
      ) : (
        <div role="table" aria-label={t('live.schools.title', { month })}>
          <TRow cols={COLS} min={780} head style={{ gap: 14 }}>
            <div role="columnheader">{t('live.schools.cols.tenant')}</div>
            <div role="columnheader">{t('live.schools.cols.roomMinutes')}</div>
            <div role="columnheader" style={NUM}>
              {t('live.schools.cols.sessions')}
            </div>
            <div role="columnheader" style={NUM}>
              {t('live.schools.cols.attendees')}
            </div>
            <div role="columnheader" style={NUM}>
              {t('live.schools.cols.participant')}
            </div>
            <div role="columnheader" style={NUM}>
              {t('live.schools.cols.peak')}
            </div>
          </TRow>
          {u.tenants.map((r) => (
            <TRow key={r.tenantId} cols={COLS} min={780} style={{ gap: 14, padding: '11px 0', alignItems: 'center' }}>
              <div role="cell" className="min0" style={{ fontWeight: 600 }}>
                {can('tenants.view') ? (
                  <Link to={`/tenants/${r.tenantId}`} style={{ color: 'inherit' }}>
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </div>
              <div role="cell" className="min0">
                <div className="mono t-sm">{t('live.minutes', { value: compactCount(r.roomMinutes) })}</div>
                {r.usedPct == null ? (
                  <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                    {t('live.schools.noAllowance')}
                  </div>
                ) : (
                  <>
                    <Bar value={r.usedPct} color={r.usedPct > 100 ? 'var(--aDot)' : undefined} style={{ marginTop: 5 }} />
                    <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                      {t('live.schools.allowance', { pct: num(r.usedPct), allowance: num(r.allowance) })}
                    </div>
                  </>
                )}
              </div>
              <div role="cell" className="mono t-sm" style={NUM}>
                {num(r.sessions)}
              </div>
              <div role="cell" className="mono t-sm" style={NUM}>
                {num(r.attendees)}
              </div>
              <div role="cell" className="mono t-sm" style={NUM}>
                {compactCount(r.participantMinutes)}
              </div>
              <div role="cell" className="mono t-sm" style={NUM}>
                {num(r.peakConcurrency)}
              </div>
            </TRow>
          ))}
        </div>
      )}
      <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
        {t('live.schools.note')}
      </div>
    </Card>
  );
}

export default function LiveUsagePage() {
  const t = useT();
  const [f, setF] = useUrlState({ period: '' });
  const q = useLiveUsage(f.period);
  const u = q.data;

  if (q.error && !u)
    return (
      <Screen max={1150}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const options = (u?.periods ?? []).map((p) => [p.slice(0, 7), `${monthName(p, 'long')} ${p.slice(0, 4)}`] as const);

  return (
    <Screen max={1150} label={t('live.title')}>
      <div className="hstack wrap" style={{ gap: 12 }}>
        <Select
          label={t('live.month')}
          value={f.period || (u?.period.slice(0, 7) ?? '')}
          options={options.length ? options : [['', '…'] as const]}
          onChange={(period) => setF({ period })}
          disabled={!u}
          style={{ width: 'auto' }}
        />
      </div>
      {u ? <Kpis u={u} /> : <KpiSkeletons n={4} />}
      {u ? (
        <div className="grid-2" aria-busy={q.isFetching}>
          <Trend u={u} />
          <Days u={u} />
        </div>
      ) : (
        <div className="grid-2">
          <Card>
            <SkeletonRows rows={6} h={22} />
          </Card>
          <Card>
            <SkeletonRows rows={6} h={22} />
          </Card>
        </div>
      )}
      {u ? (
        <Schools u={u} />
      ) : (
        <Card>
          <SkeletonRows rows={5} h={22} />
        </Card>
      )}
    </Screen>
  );
}
