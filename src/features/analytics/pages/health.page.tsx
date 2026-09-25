import { Card, Dot, Empty, ErrorState, Screen, SkeletonRows, Spinner } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { usePlatformStatus } from '@/features/shell/api';
import type { Tone } from '@/lib/domain';
import { num, plural, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useHealth, useRetryQueue } from '../api';
import type { Health, ServiceStatus } from '../types';

const STATUS_TONE: Record<ServiceStatus, Tone> = { Operational: 'good', Degraded: 'warn', Outage: 'bad' };
const COL = { width: 72, textAlign: 'right', flexShrink: 0 } as const;

function Services({ services }: { services: Health['services'] }) {
  return (
    <>
      <div className="hstack faint" style={{ gap: 10, fontSize: 11, justifyContent: 'flex-end', marginTop: 4 }} aria-hidden="true">
        <span style={COL}>Uptime 90d</span>
        <span style={COL}>p95 latency</span>
      </div>
      <ul className="stack plain-list">
        {services.map((s) => {
          const tone = STATUS_TONE[s.status];
          return (
            <li key={s.id} className="row" style={{ display: 'block', padding: '12px 0' }}>
              <div className="hstack wrap" style={{ gap: 10 }}>
                <Dot tone={tone} size={8} />
                <span className="min0" style={{ flex: '1 1 160px', fontWeight: 600 }}>
                  {s.name}
                </span>
                <span className="hstack" style={{ gap: 10, marginLeft: 'auto' }}>
                  <span className={`fg-${tone}`} style={{ width: 90, fontSize: 12, fontWeight: 700 }}>
                    {s.status}
                  </span>
                  <span className="mono t-sm" style={COL}>
                    <span className="sr-only">Uptime </span>
                    {s.uptimePct}%
                  </span>
                  <span className="mono t-sm muted" style={COL}>
                    <span className="sr-only">p95 latency </span>
                    {s.p95Ms != null ? `${num(s.p95Ms)} ms` : '—'}
                  </span>
                </span>
              </div>
              {s.note && (
                <div className={`fg-${tone}`} style={{ fontSize: 12, margin: '6px 0 0 18px' }}>
                  {s.note}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Queues({ queues }: { queues: Health['queues'] }) {
  const can = useCan();
  const retry = useRetryQueue();
  if (!queues.length) return <Empty>No job queues configured.</Empty>;
  return (
    <ul className="stack plain-list">
      {queues.map((q) => {
        const busy = retry.isPending && retry.variables === q.name;
        return (
          <li key={q.name} className="row wrap" style={{ gap: 10, padding: '10px 0' }}>
            <span className="mono t-sm min0 ellipsis" style={{ flex: 1 }}>
              {q.name}
            </span>
            <span className="muted nowrap" style={{ fontSize: 12 }}>
              {num(q.depth)} queued
            </span>
            <span
              className={q.failed ? 'fg-bad nowrap' : 'fg-good nowrap'}
              style={{ width: 64, textAlign: 'right', fontWeight: 700, fontSize: 12 }}
            >
              {num(q.failed)} failed
            </span>
            {q.failed > 0 && can('platform.manage') && (
              <button
                type="button"
                className="btn btn--sm btn--danger"
                disabled={retry.isPending}
                aria-label={`Retry ${plural(q.failed, 'failed job')} on ${q.name}`}
                onClick={() =>
                  retry.mutate(q.name, {
                    onSuccess: (r) => toast(`${plural(r.requeued, 'failed job')} requeued on ${r.queue.name}`),
                  })
                }
              >
                {busy && <Spinner />} Retry
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Deliverability({ d }: { d: Health['deliverability'] }) {
  const tiles: { label: string; value: number; tone: Tone }[] = [
    { label: 'Delivered', value: d.deliveredPct, tone: 'good' },
    { label: 'Soft bounces', value: d.softBouncePct, tone: 'warn' },
    { label: 'Hard bounces', value: d.hardBouncePct, tone: 'bad' },
    { label: 'Spam complaints', value: d.complaintPct, tone: 'bad' },
  ];
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '6px 0 0' }}>
      {tiles.map((t) => (
        <div key={t.label} className="card card--inset" style={{ display: 'flex', flexDirection: 'column-reverse' }}>
          <dt className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
            {t.label}
          </dt>
          <dd className={`display fg-${t.tone}`} style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {t.value}%
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function HealthPage() {
  const q = useHealth();
  const status = usePlatformStatus();
  const h = q.data;
  const incident = status.data?.incident;

  if (q.error)
    return (
      <Screen max={1150}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1150} label="System health">
      {incident && (
        <div className="callout callout--bad" role="status">
          <Dot tone="bad" size={8} style={{ marginTop: 6 }} />
          <div>
            <strong>Active incident:</strong> {incident.title}{' '}
            <span className="muted">
              · posted <time dateTime={incident.postedAt}>{timeAgo(incident.postedAt)}</time>
            </span>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card title="Services · last 90 days" style={{ flex: '1.4 1 420px', minWidth: 0 }}>
          {h ? <Services services={h.services} /> : <SkeletonRows rows={6} h={22} />}
        </Card>

        <div className="stack" style={{ gap: 16, flex: '1 1 320px', minWidth: 0 }}>
          <Card title="Background job queues">{h ? <Queues queues={h.queues} /> : <SkeletonRows rows={4} h={20} />}</Card>
          <Card title="Email deliverability · 7 days">
            {h ? <Deliverability d={h.deliverability} /> : <SkeletonRows rows={2} h={40} />}
          </Card>
        </div>
      </div>
    </Screen>
  );
}
