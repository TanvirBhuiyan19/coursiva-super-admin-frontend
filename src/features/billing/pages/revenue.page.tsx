import { Badge, Bar, Card, ErrorState, Screen, Skeleton, SkeletonRows } from '@/components/ui';
import type { Tone } from '@/lib/domain';
import { formatDate, money, moneyCompact, monthName, num, toneDot, toneFg } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { useRevenue } from '../api';
import { DunningCard } from '../components/DunningCard';
import { InvoicesCard } from '../components/InvoicesCard';
import { OveragesCard } from '../components/OveragesCard';
import { signedMoney } from '../format';
import { useT } from '../i18n';
import type { MovementKind, RevenueSummary } from '../types';

const MOVEMENT_TONE: Record<MovementKind, Tone> = { new: 'good', expansion: 'good', contraction: 'warn', churn: 'bad' };

function Kpis({ r }: { r: RevenueSummary | undefined }) {
  const t = useT();
  if (!r)
    return (
      <div className="grid-kpi">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card card--tight">
            <Skeleton h={12} w="45%" />
            <Skeleton h={24} w="60%" style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    );
  const items: [string, string, Tone?][] = [
    [t('revenue.kpis.mrr'), money(r.mrr)],
    [t('revenue.kpis.arr'), moneyCompact(r.arr)],
    [t('revenue.kpis.netChange', { month: monthName(r.movementMonth) }), signedMoney(r.netChange), r.netChange >= 0 ? 'good' : 'bad'],
    [t('revenue.kpis.pastDue'), num(r.pastDueTenants), r.pastDueTenants ? 'bad' : undefined],
  ];
  return (
    <div className="grid-kpi">
      {items.map(([label, value, tone]) => (
        <div key={label} className="card card--tight">
          <div className="kpi-label">{label}</div>
          <div className="kpi-value kpi-value--sm" style={{ marginTop: 4, color: tone ? toneFg(tone) : undefined }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Movement({ r }: { r: RevenueSummary }) {
  const t = useT();
  const max = Math.max(...r.movements.map((m) => Math.abs(m.amount)), 1);
  return (
    <figure style={{ margin: 0 }}>
      <ul className="stack plain-list" style={{ gap: 12, marginTop: 6 }} aria-hidden="true">
        {r.movements.map((m) => (
          <li key={m.kind}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span style={{ fontWeight: 600 }}>{m.label}</span>
              <span style={{ fontWeight: 700, color: toneFg(MOVEMENT_TONE[m.kind]) }}>{signedMoney(m.amount)}</span>
            </div>
            <Bar size="md" value={Math.round((Math.abs(m.amount) / max) * 100)} color={toneDot(MOVEMENT_TONE[m.kind])} />
            <div className="t-xs muted" style={{ marginTop: 3 }}>
              {m.detail}
            </div>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{t('revenue.movement.caption', { month: monthName(r.movementMonth, 'long') })}</caption>
        <tbody>
          {r.movements.map((m) => (
            <tr key={m.kind}>
              <th scope="row">{m.label}</th>
              <td>{signedMoney(m.amount)}</td>
              <td>{m.detail}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{t('revenue.movement.netChange')}</th>
            <td>{signedMoney(r.netChange)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </figure>
  );
}

export default function RevenuePage() {
  const t = useT();
  const [f, setF] = useUrlState({ invoice: '', page: '' });
  const revenue = useRevenue();
  const r = revenue.data;

  return (
    <Screen max={1150} label={t('revenue.title')}>
      {revenue.error ? <ErrorState error={revenue.error} onRetry={() => void revenue.refetch()} /> : <Kpis r={r} />}

      <div className="hstack wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <Card
          title={r ? t('revenue.movement.titleMonth', { month: monthName(r.movementMonth, 'long') }) : t('revenue.movement.title')}
          style={{ flex: '1 1 320px', minWidth: 0 }}
        >
          {r ? <Movement r={r} /> : <SkeletonRows rows={4} h={22} />}
        </Card>
        <InvoicesCard
          focusId={f.invoice}
          page={f.page ? Number(f.page) || 1 : null}
          onPage={(p) => setF({ page: String(p) })}
          style={{ flex: '1.3 1 420px', minWidth: 0 }}
        />
      </div>

      <div className="grid-2">
        <Card title={t('revenue.churn.title')}>
          {r ? (
            <ul className="stack plain-list" style={{ gap: 12, marginTop: 6 }}>
              {r.churnReasons.map((c) => (
                <li key={c.reason}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600 }}>{c.reason}</span>
                    <span className="muted">{c.pct}%</span>
                  </div>
                  <Bar size="md" value={c.pct} color="var(--rDot)" label={t('revenue.churn.barLabel', { reason: c.reason, pct: c.pct })} />
                </li>
              ))}
            </ul>
          ) : (
            <SkeletonRows rows={4} h={20} />
          )}
        </Card>
        <Card title={t('revenue.payouts.title')}>
          {r ? (
            <>
              <ul className="plain-list">
                {r.payouts.map((p) => (
                  <li key={p.id} className="row" style={{ padding: '12px 0' }}>
                    <time dateTime={p.date} className="muted" style={{ width: 64 }}>
                      {formatDate(p.date)}
                    </time>
                    <span style={{ fontWeight: 700, flex: 1 }}>{money(p.amount)}</span>
                    <Badge tone={p.status === 'Paid' ? 'good' : 'warn'}>{t(`payoutStatus.${p.status}`)}</Badge>
                  </li>
                ))}
              </ul>
              <div className="note" style={{ paddingTop: 10 }}>
                {t('revenue.payouts.note')}
              </div>
            </>
          ) : (
            <SkeletonRows rows={3} h={22} />
          )}
        </Card>
      </div>

      <DunningCard />
      <OveragesCard />
    </Screen>
  );
}
