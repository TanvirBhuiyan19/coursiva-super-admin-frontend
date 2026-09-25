import { Link } from 'react-router-dom';
import { Badge, Bar, Card, Empty, ErrorState, Screen, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { money, num } from '@/lib/format';
import { useUsage } from '../api';
import { KpiSkeletons } from '../components/charts';
import { compactCount, formatGb } from '../format';
import type { Usage, UsageMeter } from '../types';

const METER_LABEL: Record<UsageMeter, string> = {
  storage: 'Object storage',
  bandwidth: 'CDN bandwidth',
  transcode: 'Video transcode',
  api_requests: 'API requests',
};
/** Storage is a point-in-time total; the other meters reset each billing month. */
const MONTHLY: Record<UsageMeter, boolean> = { storage: false, bandwidth: true, transcode: true, api_requests: true };

function formatMeter(meter: UsageMeter, n: number) {
  if (meter === 'storage' || meter === 'bandwidth') return formatGb(n);
  if (meter === 'transcode') return `${compactCount(n)} min`;
  return compactCount(n);
}

const COLS = 'minmax(190px,1.6fr) 80px 90px 90px 80px minmax(150px,1fr)';
const NUM = { textAlign: 'right' } as const;

function Capacity({ u }: { u: Usage }) {
  const month = new Date(u.period + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return (
    <div className="grid-kpi">
      {u.capacity.map((c) => (
        <section key={c.meter} className="card" aria-label={METER_LABEL[c.meter]}>
          <h2 className="kpi-label" style={{ margin: 0 }}>
            {METER_LABEL[c.meter]}
            {MONTHLY[c.meter] ? ` · ${month}` : ''}
          </h2>
          <div className="kpi-value" style={{ fontSize: 24 }}>
            {formatMeter(c.meter, c.used)}{' '}
            <span className="faint nowrap" style={{ fontSize: 12, fontWeight: 400, fontFamily: 'inherit' }}>
              of {formatMeter(c.meter, c.capacity)}
            </span>
          </div>
          <Bar
            value={c.usedPct}
            color={c.nearLimit ? 'var(--aDot)' : undefined}
            size="md"
            style={{ marginTop: 12 }}
            label={`${METER_LABEL[c.meter]}: ${c.usedPct}% of capacity used`}
          />
          {c.nearLimit ? (
            <div className="fg-warn" style={{ fontSize: 11.5, fontWeight: 600, marginTop: 8 }}>
              Approaching limit · {c.usedPct}% used
            </div>
          ) : (
            <div className="kpi-sub" style={{ marginTop: 8 }}>
              {c.usedPct}% used
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export default function UsagePage() {
  const q = useUsage();
  const can = useCan();
  const u = q.data;

  if (q.error)
    return (
      <Screen max={1150}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const month = u ? new Date(u.period + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) : '';

  return (
    <Screen max={1150} label="Usage and infrastructure">
      {u ? <Capacity u={u} /> : <KpiSkeletons n={4} />}

      <Card title={`Top consumers${month ? ` · ${month}` : ''}`} className="table-scroll">
        {!u ? (
          <SkeletonRows rows={5} h={22} />
        ) : u.topConsumers.length === 0 ? (
          <Empty>No usage recorded this month yet.</Empty>
        ) : (
          <div role="table" aria-label="Top consumers">
            <TRow cols={COLS} min={760} head style={{ gap: 14 }}>
              <div role="columnheader">Tenant</div>
              <div role="columnheader" style={NUM}>
                Storage
              </div>
              <div role="columnheader" style={NUM}>
                Bandwidth
              </div>
              <div role="columnheader" style={NUM}>
                Video
              </div>
              <div role="columnheader" style={NUM}>
                API calls
              </div>
              <div role="columnheader" style={NUM}>
                Share of platform
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
                      {r.overage.meter} overage · +{money(r.overage.amount)}
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
                  {compactCount(r.videoMinutes)} min
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
            Share of platform = the tenant’s average share of storage, bandwidth, video and API usage.
          </div>
        )}
      </Card>
    </Screen>
  );
}
