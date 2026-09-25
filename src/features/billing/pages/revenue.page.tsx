import { Badge, Bar, Card, ErrorState, Screen, Skeleton, SkeletonRows } from '@/components/ui';
import type { Tone } from '@/lib/domain';
import { formatDate, money, moneyCompact, num, toneDot, toneFg } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { useRevenue } from '../api';
import { DunningCard } from '../components/DunningCard';
import { InvoicesCard } from '../components/InvoicesCard';
import { OveragesCard } from '../components/OveragesCard';
import { monthName, signedMoney } from '../format';
import type { MovementKind, RevenueSummary } from '../types';

const MOVEMENT_TONE: Record<MovementKind, Tone> = { new: 'good', expansion: 'good', contraction: 'warn', churn: 'bad' };

function Kpis({ r }: { r: RevenueSummary | undefined }) {
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
    ['MRR', money(r.mrr)],
    ['ARR run rate', moneyCompact(r.arr)],
    [`Net MRR change · ${monthName(r.movementMonth, true)}`, signedMoney(r.netChange), r.netChange >= 0 ? 'good' : 'bad'],
    ['Past-due tenants', num(r.pastDueTenants), r.pastDueTenants ? 'bad' : undefined],
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
        <caption>MRR movement for {monthName(r.movementMonth)}</caption>
        <tbody>
          {r.movements.map((m) => (
            <tr key={m.kind}>
              <th scope="row">{m.label}</th>
              <td>{signedMoney(m.amount)}</td>
              <td>{m.detail}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Net change</th>
            <td>{signedMoney(r.netChange)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </figure>
  );
}

export default function RevenuePage() {
  const [f, setF] = useUrlState({ invoice: '', page: '' });
  const revenue = useRevenue();
  const r = revenue.data;

  return (
    <Screen max={1150} label="Revenue">
      {revenue.error ? <ErrorState error={revenue.error} onRetry={() => void revenue.refetch()} /> : <Kpis r={r} />}

      <div className="hstack wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <Card title={r ? `MRR movement · ${monthName(r.movementMonth)}` : 'MRR movement'} style={{ flex: '1 1 320px', minWidth: 0 }}>
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
        <Card title="Churn reasons · last 90 days">
          {r ? (
            <ul className="stack plain-list" style={{ gap: 12, marginTop: 6 }}>
              {r.churnReasons.map((c) => (
                <li key={c.reason}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600 }}>{c.reason}</span>
                    <span className="muted">{c.pct}%</span>
                  </div>
                  <Bar size="md" value={c.pct} color="var(--rDot)" label={`${c.reason}: ${c.pct}% of churned tenants`} />
                </li>
              ))}
            </ul>
          ) : (
            <SkeletonRows rows={4} h={20} />
          )}
        </Card>
        <Card title="Platform payouts">
          {r ? (
            <>
              <ul className="plain-list">
                {r.payouts.map((p) => (
                  <li key={p.id} className="row" style={{ padding: '12px 0' }}>
                    <time dateTime={p.date} className="muted" style={{ width: 64 }}>
                      {formatDate(p.date)}
                    </time>
                    <span style={{ fontWeight: 700, flex: 1 }}>{money(p.amount)}</span>
                    <Badge tone={p.status === 'Paid' ? 'good' : 'warn'}>{p.status}</Badge>
                  </li>
                ))}
              </ul>
              <div className="note" style={{ paddingTop: 10 }}>
                Stripe payouts of platform subscription revenue, twice monthly, net of processing fees.
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
