import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Bar, Card, ChipGroup, Dot, ErrorState, Kpi, Screen, Skeleton, SkeletonRows } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useAuditLog } from '@/features/audit/api';
import { useCan } from '@/features/auth/useCan';
import { useTenants } from '@/features/tenants/api';
import type { Tone } from '@/lib/domain';
import { avatarColor, healthTone, initials, money, num, planTone, timeAgo } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { useOverview } from '../api';
import { OVERVIEW_RANGES, type Overview, type OverviewRange } from '../types';

const FEED_TONE: Record<string, Tone> = { Billing: 'good', Security: 'bad', Tenants: 'accent', Auth: 'bad' };
const signed = (n: number, unit = '') => `${n >= 0 ? '+' : '−'}${num(Math.abs(n))}${unit}`;

function queueItems(q: Overview['queue']) {
  const privacyDetail = !q.privacy.dueSoon
    ? 'Nothing pending'
    : q.privacy.overdue
      ? `${q.privacy.overdue} ${q.privacy.overdue === 1 ? 'request' : 'requests'} overdue${q.privacy.soonestDays != null ? ` · next due in ${q.privacy.soonestDays} days` : ''}`
      : `Earliest due in ${q.privacy.soonestDays ?? '—'} days`;
  return [
    {
      key: 'dunning',
      n: q.dunning.count,
      label: 'Failed payments in dunning',
      sub: q.dunning.count ? `${money(q.dunning.amount)} at stake` : 'All collected',
      to: pathOf('revenue'),
      tone: q.dunning.count ? 'bad' : 'good',
    },
    {
      key: 'tickets',
      n: q.tickets.high,
      label: 'High-priority tickets',
      sub: `${q.tickets.open} open in total`,
      to: pathOf('support'),
      tone: q.tickets.high ? 'bad' : 'good',
    },
    {
      key: 'trials',
      n: q.trials.count,
      label: 'Trials to convert',
      sub: q.trials.count ? q.trials.names.join(', ') : 'No trials running',
      to: '/tenants?segment=trials_ending',
      tone: q.trials.count ? 'warn' : 'good',
    },
    {
      key: 'overages',
      n: q.overages.count,
      label: 'Unbilled overages',
      sub: q.overages.count ? `${money(q.overages.amount)} ready to invoice` : 'Everything billed',
      to: pathOf('revenue'),
      tone: q.overages.count ? 'warn' : 'good',
    },
    {
      key: 'privacy',
      n: q.privacy.dueSoon,
      label: 'Privacy requests due soon',
      sub: privacyDetail,
      to: pathOf('compliance'),
      tone: q.privacy.overdue ? 'bad' : q.privacy.dueSoon ? 'warn' : 'good',
    },
  ] satisfies { key: string; n: number; label: string; sub: string; to: string; tone: Tone }[];
}

function MrrChart({ series }: { series: Overview['mrrSeries'] }) {
  const max = Math.max(...series.map((p) => p.mrr), 1);
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, marginTop: 20, minWidth: 0 }} aria-hidden="true">
        {series.map((p, i) => {
          const label = new Date(p.month + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
          return (
            <div key={p.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <div
                title={`${label}: ${money(p.mrr)} MRR`}
                style={{
                  width: '100%',
                  borderRadius: '6px 6px 2px 2px',
                  background: i === series.length - 1 ? 'var(--ac)' : 'var(--acBar)',
                  height: Math.round((p.mrr / max) * 140),
                }}
              />
              <div className="faint" style={{ fontSize: 10.5 }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
      {/* Screen-reader equivalent of the chart (wrapped: tables ignore the 1px sr-only box). */}
      <div className="sr-only">
        <table>
          <caption>Platform MRR by month</caption>
          <tbody>
            {series.map((p) => (
              <tr key={p.month}>
                <th scope="row">{p.month.slice(0, 7)}</th>
                <td>{money(p.mrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const can = useCan();
  const [f, setF] = useUrlState({ range: '30d' });
  const range = (OVERVIEW_RANGES as readonly string[]).includes(f.range) ? (f.range as OverviewRange) : '30d';
  const overview = useOverview(range);
  const signups = useTenants({ sort: '-created_at', perPage: 5 });
  const feed = useAuditLog({ perPage: 6 });
  const o = overview.data;

  if (overview.error)
    return (
      <Screen max={1200}>
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      </Screen>
    );

  const maxPlan = o ? Math.max(...o.planDistribution.map((p) => p.tenants), 1) : 1;
  const queue = o ? queueItems(o.queue) : [];
  const queueTotal = queue.reduce((s, r) => s + r.n, 0);

  return (
    <Screen max={1200} gap={20} label="Overview">
      <div className="hstack wrap" style={{ gap: 10 }}>
        {o && can('platform.view') && (
          <Link className="t-sm muted" to={pathOf('entitlements')} style={{ fontSize: 12 }}>
            {o.entitlementOverrides
              ? `${o.entitlementOverrides} entitlement override${o.entitlementOverrides === 1 ? '' : 's'} active`
              : 'Plans match defaults'}
          </Link>
        )}
        <div className="hstack wrap" style={{ gap: 10, marginLeft: 'auto' }}>
          {can('announcements.send') && (
            <Link className="btn btn--sm" to={pathOf('announce')}>
              Announcement
            </Link>
          )}
          {can('billing.view') && (
            <Link className="btn btn--sm" to={pathOf('revenue')}>
              Run payout
            </Link>
          )}
          {can('analytics.view') && (
            <Link className="btn btn--sm" to={pathOf('health')}>
              System health
            </Link>
          )}
        </div>
      </div>

      <div className="hstack" style={{ justifyContent: 'flex-end', marginBottom: -8 }}>
        <ChipGroup label="Comparison period" options={OVERVIEW_RANGES} value={range} onChange={(r) => setF({ range: r })} size="sm" />
      </div>

      <div className="grid-kpi">
        {o ? (
          <>
            <Kpi label="Platform MRR" value={money(o.mrr.value)} delta={signed(o.mrr.deltaPct, '%')} />
            <Kpi label="Active tenants" value={num(o.tenants.value)} delta={signed(o.tenants.delta)} />
            <Kpi label="Total students" value={num(o.students.value)} delta={signed(o.students.delta)} />
            <Kpi label="Revenue churn" value={`${o.revenueChurn.valuePct}%`} delta={`${signed(o.revenueChurn.deltaPts)}pt`} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card">
              <Skeleton h={12} w="45%" />
              <Skeleton h={28} w="60%" style={{ marginTop: 10 }} />
              <Skeleton h={12} w="70%" style={{ marginTop: 10 }} />
            </div>
          ))
        )}
      </div>

      <div className="grid-2">
        <Card title="Platform MRR" right={<span className="card-sub">Last 12 months</span>}>
          {o ? <MrrChart series={o.mrrSeries} /> : <Skeleton h={180} style={{ marginTop: 20 }} />}
        </Card>
        {can('tenants.view') && (
          <Card title="Recent signups">
            {signups.isPending ? (
              <SkeletonRows rows={5} h={26} />
            ) : (
              <ul className="stack plain-list">
                {signups.data?.data.map((t) => (
                  <li key={t.id}>
                    <Link to={`/tenants/${t.id}`} className="row row--click row-link-block">
                      <Avatar text={initials(t.name)} color={avatarColor(t.id)} size={30} radius={8} />
                      <div className="min0" style={{ flex: 1 }}>
                        <div className="ellipsis" style={{ fontWeight: 600 }}>
                          {t.name}
                        </div>
                        <div className="t-xs muted">{timeAgo(t.createdAt)}</div>
                      </div>
                      <Badge tone={planTone(t.plan)} style={{ fontSize: 11 }}>
                        {t.plan}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card title="Tenants by plan">
        <div className="stack" style={{ gap: 12, marginTop: 6 }}>
          {o ? (
            o.planDistribution.map((p) => (
              <div key={p.plan}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>{p.plan}</span>
                  <span className="muted">
                    {p.tenants} tenants · {money(p.mrr)} MRR
                  </span>
                </div>
                <Bar size="lg" value={Math.round((p.tenants / maxPlan) * 100)} label={`${p.plan}: ${p.tenants} tenants`} />
              </div>
            ))
          ) : (
            <SkeletonRows rows={3} h={20} />
          )}
        </div>
      </Card>

      <div className="grid-2" style={{ alignItems: 'stretch' }}>
        <Card
          title="Needs you today"
          right={
            o && (
              <span className="faint" style={{ fontSize: 12 }}>
                {queueTotal ? `${queueTotal} ${queueTotal === 1 ? 'item needs' : 'items need'} you` : 'Nothing needs you right now'}
              </span>
            )
          }
        >
          {o ? (
            <>
              <ul className="stack plain-list">
                {queue.map((r) => (
                  <li key={r.key}>
                    <Link to={r.to} className="row row--click row-link-block">
                      <Badge tone={r.tone} style={{ minWidth: 26, textAlign: 'center', fontSize: 12, fontWeight: 800, padding: '3px 6px' }}>
                        {r.n}
                      </Badge>
                      <div className="min0" style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                        <div className="t-xs muted ellipsis" style={{ marginTop: 1 }}>
                          {r.sub}
                        </div>
                      </div>
                      <span className="faint" aria-hidden="true" style={{ fontSize: 14 }}>
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hstack" style={{ gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bd2)' }}>
                <div style={{ flex: 1 }}>
                  <div className="t-xs faint">MRR at risk</div>
                  <div className="hstack" style={{ alignItems: 'baseline' }}>
                    <span className="display fg-bad" style={{ fontSize: 20, fontWeight: 800 }}>
                      {money(o.mrrAtRisk.amount)}
                    </span>
                    <span className="t-xs muted">
                      {o.mrr.value ? `${Math.round((o.mrrAtRisk.amount / o.mrr.value) * 100)}% of MRR` : '0%'} · {o.mrrAtRisk.tenants}{' '}
                      {o.mrrAtRisk.tenants === 1 ? 'tenant' : 'tenants'}
                    </span>
                  </div>
                </div>
                <button type="button" className="btn btn--sm" onClick={() => void navigate('/tenants?segment=at_risk')}>
                  Review
                </button>
              </div>
            </>
          ) : (
            <SkeletonRows rows={5} h={26} />
          )}
        </Card>
        {can('audit.view') && (
          <Card
            title="Platform activity"
            right={
              <Link className="link" style={{ fontSize: 12 }} to={pathOf('audit')}>
                Audit log →
              </Link>
            }
          >
            {feed.isPending ? (
              <SkeletonRows rows={6} h={24} />
            ) : (
              <ul className="stack plain-list">
                {feed.data?.data.map((a) => (
                  <li key={a.id} className="row row--top" style={{ gap: 10, padding: '10px 0' }}>
                    <Dot tone={FEED_TONE[a.category] ?? 'warn'} style={{ marginTop: 6 }} />
                    <div className="min0" style={{ flex: 1 }}>
                      <div className="t-sm" style={{ lineHeight: 1.45 }}>
                        {a.action}
                      </div>
                      <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
                        {a.actorName} · <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time> · {a.category}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card title="Needs attention" right={<span className="card-sub">Health checks run hourly</span>}>
        {o ? (
          o.watchlist.length ? (
            <ul className="stack plain-list">
              {o.watchlist.map((w) => (
                <li key={w.tenantId} className="row wrap">
                  <Badge tone={healthTone(w.health)} style={{ width: 64, textAlign: 'center' }}>
                    {w.health}
                  </Badge>
                  <span style={{ fontWeight: 600 }}>{w.name}</span>
                  <span className="muted" style={{ flex: 1, minWidth: 160 }}>
                    {w.reason}
                  </span>
                  {can('tenants.view') && (
                    <Link className="link" to={`/tenants/${w.tenantId}`}>
                      Review →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">Every tenant is healthy.</div>
          )
        ) : (
          <SkeletonRows rows={3} h={22} />
        )}
      </Card>
    </Screen>
  );
}
