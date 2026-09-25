import { Link } from 'react-router-dom';
import { Badge, Bar, Card, Empty, ErrorState, Screen, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { money, monthName, num } from '@/lib/format';
import { useUsage } from '../api';
import { KpiSkeletons } from '../components/charts';
import { compactCount, formatGb } from '../format';
import { t as tPlain, useT } from '../i18n';
import type { Usage, UsageMeter } from '../types';

const meterLabel = (m: UsageMeter) => tPlain(`usage.meter.${m}`);
/** Storage is a point-in-time total; the other meters reset each billing month. */
const MONTHLY: Record<UsageMeter, boolean> = { storage: false, bandwidth: true, transcode: true, api_requests: true };

function formatMeter(meter: UsageMeter, n: number) {
  if (meter === 'storage' || meter === 'bandwidth') return formatGb(n);
  if (meter === 'transcode') return tPlain('usage.minutes', { value: compactCount(n) });
  return compactCount(n);
}

const COLS = 'minmax(190px,1.6fr) 80px 90px 90px 80px minmax(150px,1fr)';
const NUM = { textAlign: 'right' } as const;

function Capacity({ u }: { u: Usage }) {
  const t = useT();
  const month = monthName(u.period);
  return (
    <div className="grid-kpi">
      {u.capacity.map((c) => (
        <section key={c.meter} className="card" aria-label={meterLabel(c.meter)}>
          <h2 className="kpi-label" style={{ margin: 0 }}>
            {meterLabel(c.meter)}
            {MONTHLY[c.meter] ? ` · ${month}` : ''}
          </h2>
          <div className="kpi-value" style={{ fontSize: 24 }}>
            {formatMeter(c.meter, c.used)}{' '}
            <span className="faint nowrap" style={{ fontSize: 12, fontWeight: 400, fontFamily: 'inherit' }}>
              {t('usage.ofCapacity', { value: formatMeter(c.meter, c.capacity) })}
            </span>
          </div>
          <Bar
            value={c.usedPct}
            color={c.nearLimit ? 'var(--aDot)' : undefined}
            size="md"
            style={{ marginTop: 12 }}
            label={t('usage.capacityLabel', { meter: meterLabel(c.meter), pct: c.usedPct })}
          />
          {c.nearLimit ? (
            <div className="fg-warn" style={{ fontSize: 11.5, fontWeight: 600, marginTop: 8 }}>
              {t('usage.approaching', { pct: c.usedPct })}
            </div>
          ) : (
            <div className="kpi-sub" style={{ marginTop: 8 }}>
              {t('usage.used', { pct: c.usedPct })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default function UsagePage() {
  const t = useT();
  const q = useUsage();
  const can = useCan();
  const u = q.data;

  if (q.error)
    return (
      <Screen max={1150}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const month = u ? monthName(u.period, 'long') : '';

  return (
    <Screen max={1150} label={t('usage.title')}>
      {u ? <Capacity u={u} /> : <KpiSkeletons n={4} />}

      <Card title={month ? t('usage.topConsumersIn', { month }) : t('usage.topConsumers')} className="table-scroll">
        {!u ? (
          <SkeletonRows rows={5} h={22} />
        ) : u.topConsumers.length === 0 ? (
          <Empty>{t('usage.empty')}</Empty>
        ) : (
          <div role="table" aria-label={t('usage.topConsumers')}>
            <TRow cols={COLS} min={760} head style={{ gap: 14 }}>
              <div role="columnheader">{t('usage.cols.tenant')}</div>
              <div role="columnheader" style={NUM}>
                {t('usage.cols.storage')}
              </div>
              <div role="columnheader" style={NUM}>
                {t('usage.cols.bandwidth')}
              </div>
              <div role="columnheader" style={NUM}>
                {t('usage.cols.video')}
              </div>
              <div role="columnheader" style={NUM}>
                {t('usage.cols.api')}
              </div>
              <div role="columnheader" style={NUM}>
                {t('usage.cols.share')}
              </div>
            </TRow>
            {u.topConsumers.map((r) => (
              <TRow key={r.tenantId} cols={COLS} min={760} style={{ gap: 14, padding: '11px 0' }}>
                <div role="cell" className="min0" style={{ fontWeight: 600 }}>
                  {can('tenants.view') ? (
                    <Link to={`/tenants/${r.tenantId}`} style={{ color: 'inherit' }}>
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                  {r.overage && (
                    <Badge tone="warn" style={{ marginLeft: 6, fontSize: 11 }}>
                      {t('usage.overage', { meter: r.overage.meter, amount: money(r.overage.amount) })}
                    </Badge>
                  )}
                </div>
                <div role="cell" className="mono t-sm" style={NUM}>
                  {formatGb(r.storageGb)}
                </div>
                <div role="cell" className="mono t-sm" style={NUM}>
                  {formatGb(r.bandwidthGb)}
                </div>
                <div role="cell" className="mono t-sm" style={NUM}>
                  {t('usage.minutes', { value: compactCount(r.videoMinutes) })}
                </div>
                <div role="cell" className="mono t-sm" style={NUM}>
                  {compactCount(r.apiRequests)}
                </div>
                <div role="cell" className="hstack" style={{ justifyContent: 'flex-end' }}>
                  <Bar value={r.sharePct} size="md" style={{ flex: 'none', width: 110 }} />
                  <span className="muted" style={{ width: 34, textAlign: 'right', fontSize: 12 }}>
                    {num(r.sharePct)}%
                  </span>
                </div>
              </TRow>
            ))}
          </div>
        )}
        {u && u.topConsumers.length > 0 && (
          <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
            {t('usage.shareNote')}
          </div>
        )}
      </Card>
    </Screen>
  );
}
