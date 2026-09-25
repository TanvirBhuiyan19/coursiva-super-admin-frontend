import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Bar, Card, ChipGroup, Dot, ErrorState, Kpi, Screen, Skeleton, SkeletonRows } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useAuditLog } from '@/features/audit/api';
import { useCan } from '@/features/auth/useCan';
import { useTenants } from '@/features/tenants/api';
import type { Tone } from '@/lib/domain';
import { avatarColor, healthTone, initials, money, monthName, num, planTone, timeAgo } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUrlState } from '@/lib/useUrlState';
import { useOverview } from '../api';
import { t as tPlain, useT } from '../i18n';
import { OVERVIEW_RANGES, type Overview, type OverviewRange } from '../types';

const FEED_TONE: Record<string, Tone> = { Billing: 'good', Security: 'bad', Tenants: 'accent', Auth: 'bad' };
const signed = (n: number, unit = '') => `${n >= 0 ? '+' : '−'}${num(Math.abs(n))}${unit}`;

function queueItems(q: Overview['queue']) {
  const privacyDetail = !q.privacy.dueSoon
    ? tPlain('queue.privacyNothing')
    : q.privacy.overdue
      ? q.privacy.soonestDays != null
        ? tPlain('queue.privacyOverdueNext', { count: q.privacy.overdue, days: q.privacy.soonestDays })
        : tPlain('queue.privacyOverdue', { count: q.privacy.overdue })
      : tPlain('queue.privacyEarliest', { days: q.privacy.soonestDays ?? '—' });
  return [
    {
      key: 'dunning',
      n: q.dunning.count,
      label: tPlain('queue.dunning'),
      sub: q.dunning.count ? tPlain('queue.dunningAtStake', { amount: money(q.dunning.amount) }) : tPlain('queue.allCollected'),
      to: pathOf('revenue'),
      tone: q.dunning.count ? 'bad' : 'good',
    },
    {
      key: 'tickets',
      n: q.tickets.high,
      label: tPlain('queue.tickets'),
      sub: tPlain('queue.ticketsOpen', { count: q.tickets.open }),
      to: pathOf('support'),
      tone: q.tickets.high ? 'bad' : 'good',
    },
    {
      key: 'trials',
      n: q.trials.count,
      label: tPlain('queue.trials'),
      sub: q.trials.count ? q.trials.names.join(', ') : tPlain('queue.noTrials'),
      to: '/tenants?segment=trials_ending',
      tone: q.trials.count ? 'warn' : 'good',
    },
    {
      key: 'overages',
      n: q.overages.count,
      label: tPlain('queue.overages'),
      sub: q.overages.count ? tPlain('queue.overagesReady', { amount: money(q.overages.amount) }) : tPlain('queue.everythingBilled'),
      to: pathOf('revenue'),
      tone: q.overages.count ? 'warn' : 'good',
    },
    {
      key: 'privacy',
      n: q.privacy.dueSoon,
      label: tPlain('queue.privacy'),
      sub: privacyDetail,
      to: pathOf('compliance'),
      tone: q.privacy.overdue ? 'bad' : q.privacy.dueSoon ? 'warn' : 'good',
    },
  ] satisfies { key: string; n: number; label: string; sub: string; to: string; tone: Tone }[];
}

function MrrChart({ series }: { series: Overview['mrrSeries'] }) {
  const t = useT();
  const max = Math.max(...series.map((p) => p.mrr), 1);
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, marginTop: 20, minWidth: 0 }} aria-hidden="true">
        {series.map((p, i) => {
          const label = monthName(p.month);
          return (
            <div key={p.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <div
                title={t('mrrChart.barTitle', { month: label, amount: money(p.mrr) })}
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
          <caption>{t('mrrChart.caption')}</caption>
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
  const t = useT();
  const tc = useCommonT();
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
    <Screen max={1200} gap={20} label={t('title')}>
      <div className="hstack wrap" style={{ gap: 10 }}>
        {o && can('platform.view') && (
          <Link className="t-sm muted" to={pathOf('entitlements')} style={{ fontSize: 12 }}>
            {o.entitlementOverrides ? t('entitlementOverrides', { count: o.entitlementOverrides }) : t('plansMatchDefaults')}
          </Link>
        )}
        <div className="hstack wrap" style={{ gap: 10, marginLeft: 'auto' }}>
          {can('announcements.send') && (
            <Link className="btn btn--sm" to={pathOf('announce')}>
              {t('actions.announcement')}
            </Link>
          )}
          {can('billing.view') && (
            <Link className="btn btn--sm" to={pathOf('revenue')}>
              {t('actions.runPayout')}
            </Link>
          )}
          {can('analytics.view') && (
            <Link className="btn btn--sm" to={pathOf('health')}>
              {t('actions.systemHealth')}
            </Link>
          )}
        </div>
      </div>

      <div className="hstack" style={{ justifyContent: 'flex-end', marginBottom: -8 }}>
        <ChipGroup
          label={t('range.label')}
          options={OVERVIEW_RANGES.map((r) => [r, t(`range.${r}`)] as const)}
          value={range}
          onChange={(r) => setF({ range: r })}
          size="sm"
        />
      </div>

      <div className="grid-kpi">
        {o ? (
          <>
            <Kpi label={t('kpis.mrr')} value={money(o.mrr.value)} delta={signed(o.mrr.deltaPct, '%')} />
            <Kpi label={t('kpis.activeTenants')} value={num(o.tenants.value)} delta={signed(o.tenants.delta)} />
            <Kpi label={t('kpis.totalStudents')} value={num(o.students.value)} delta={signed(o.students.delta)} />
            <Kpi
              label={t('kpis.revenueChurn')}
              value={`${o.revenueChurn.valuePct}%`}
              delta={t('kpis.pt', { value: signed(o.revenueChurn.deltaPts) })}
            />
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
        <Card title={t('mrrChart.title')} right={<span className="card-sub">{t('mrrChart.sub')}</span>}>
          {o ? <MrrChart series={o.mrrSeries} /> : <Skeleton h={180} style={{ marginTop: 20 }} />}
        </Card>
        {can('tenants.view') && (
          <Card title={t('recentSignups')}>
            {signups.isPending ? (
              <SkeletonRows rows={5} h={26} />
            ) : (
              <ul className="stack plain-list">
                {signups.data?.data.map((tn) => (
                  <li key={tn.id}>
                    <Link to={`/tenants/${tn.id}`} className="row row--click row-link-block">
                      <Avatar text={initials(tn.name)} color={avatarColor(tn.id)} size={30} radius={8} />
                      <div className="min0" style={{ flex: 1 }}>
                        <div className="ellipsis" style={{ fontWeight: 600 }}>
                          {tn.name}
                        </div>
                        <div className="t-xs muted">{timeAgo(tn.createdAt)}</div>
                      </div>
                      <Badge tone={planTone(tn.plan)} style={{ fontSize: 11 }}>
                        {tc(`enums.plan.${tn.plan}`)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card title={t('plans.title')}>
        <div className="stack" style={{ gap: 12, marginTop: 6 }}>
          {o ? (
            o.planDistribution.map((p) => (
              <div key={p.plan}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>{tc(`enums.plan.${p.plan}`)}</span>
                  <span className="muted">{t('plans.row', { count: p.tenants, mrr: money(p.mrr) })}</span>
                </div>
                <Bar
                  size="lg"
                  value={Math.round((p.tenants / maxPlan) * 100)}
                  label={t('plans.barLabel', { plan: tc(`enums.plan.${p.plan}`), count: p.tenants })}
                />
              </div>
            ))
          ) : (
            <SkeletonRows rows={3} h={20} />
          )}
        </div>
      </Card>

      <div className="grid-2" style={{ alignItems: 'stretch' }}>
        <Card
          title={t('queue.title')}
          right={
            o && (
              <span className="faint" style={{ fontSize: 12 }}>
                {t('queue.total', { count: queueTotal })}
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
                        {t('queue.chevron')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hstack" style={{ gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--bd2)' }}>
                <div style={{ flex: 1 }}>
                  <div className="t-xs faint">{t('queue.mrrAtRisk')}</div>
                  <div className="hstack" style={{ alignItems: 'baseline' }}>
                    <span className="display fg-bad" style={{ fontSize: 20, fontWeight: 800 }}>
                      {money(o.mrrAtRisk.amount)}
                    </span>
                    <span className="t-xs muted">
                      {t('queue.atRiskTenants', {
                        share: o.mrr.value ? t('queue.ofMrr', { pct: Math.round((o.mrrAtRisk.amount / o.mrr.value) * 100) }) : '0%',
                        count: o.mrrAtRisk.tenants,
                      })}
                    </span>
                  </div>
                </div>
                <button type="button" className="btn btn--sm" onClick={() => void navigate('/tenants?segment=at_risk')}>
                  {t('queue.review')}
                </button>
              </div>
            </>
          ) : (
            <SkeletonRows rows={5} h={26} />
          )}
        </Card>
        {can('audit.view') && (
          <Card
            title={t('activity.title')}
            right={
              <Link className="link" style={{ fontSize: 12 }} to={pathOf('audit')}>
                {t('activity.auditLog')}
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
                        {a.actorName} · <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time> ·{' '}
                        {tc(`enums.auditCategory.${a.category}`)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card title={t('watchlist.title')} right={<span className="card-sub">{t('watchlist.sub')}</span>}>
        {o ? (
          o.watchlist.length ? (
            <ul className="stack plain-list">
              {o.watchlist.map((w) => (
                <li key={w.tenantId} className="row wrap">
                  <Badge tone={healthTone(w.health)} style={{ width: 64, textAlign: 'center' }}>
                    {tc(`enums.tenantHealth.${w.health}`)}
                  </Badge>
                  <span style={{ fontWeight: 600 }}>{w.name}</span>
                  <span className="muted" style={{ flex: 1, minWidth: 160 }}>
                    {w.reason}
                  </span>
                  {can('tenants.view') && (
                    <Link className="link" to={`/tenants/${w.tenantId}`}>
                      {t('watchlist.review')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">{t('watchlist.empty')}</div>
          )
        ) : (
          <SkeletonRows rows={3} h={22} />
        )}
      </Card>
    </Screen>
  );
}
