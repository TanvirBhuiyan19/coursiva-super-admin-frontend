import { Badge, Card, Empty, ErrorState, Screen, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { num, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useDeliverability, usePauseSending, useRecheckDns } from '../api';
import { Tiles } from '../components/Tiles';
import type { DnsCheck, SenderDomain, SenderRisk } from '../types';

const COLS =
  'minmax(0,1.8fr) minmax(0,0.6fr) minmax(0,0.6fr) minmax(0,0.9fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.8fr) minmax(0,2.1fr)';
const RISK_TONE: Record<SenderRisk, Tone> = { Healthy: 'good', Watch: 'warn', 'Over threshold': 'bad' };
const DNS_TONE: Record<DnsCheck, string> = { Pass: '', Fail: 'fg-bad', 'Not set': 'fg-warn' };
const pctText = (n: number) => `${n}%`;
const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

function DomainRow({ d, canManage }: { d: SenderDomain; canManage: boolean }) {
  const pause = usePauseSending();
  const recheck = useRecheckDns();
  const status = d.paused ? 'Sending paused' : d.risk;
  const tone: Tone = d.paused ? 'flat' : RISK_TONE[d.risk];

  const togglePause = () =>
    pause.mutate(
      { id: d.id, paused: !d.paused },
      {
        onSuccess: () =>
          toast(
            d.paused ? `Sending resumed for ${d.tenantName}` : `Sending paused for ${d.tenantName} — protects the shared IP reputation`,
          ),
      },
    );

  return (
    <TRow cols={COLS} min={980} style={{ gap: 10, padding: '11px 0', fontSize: 12.5 }}>
      <div role="cell" className="min0">
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {d.tenantName}
        </div>
        <div className="faint ellipsis" style={{ fontSize: 11 }} title={`DNS checked ${timeAgo(d.dnsCheckedAt)}`}>
          {d.domain}
        </div>
      </div>
      <div role="cell" className={DNS_TONE[d.spf]}>
        {d.spf}
      </div>
      <div role="cell" className={DNS_TONE[d.dkim]}>
        {d.dkim}
      </div>
      <div role="cell" className="muted">
        {d.dmarc}
      </div>
      <div role="cell">{num(d.sent30d)}</div>
      <div role="cell">{pctText(d.bounceRate)}</div>
      <div role="cell" style={{ fontWeight: 700 }}>
        {pctText(d.complaintRate)}
      </div>
      <div role="cell" className="hstack wrap" style={{ gap: 8 }}>
        <Badge tone={tone} style={{ fontSize: 11, padding: '3px 8px' }}>
          {status}
        </Badge>
        {canManage && (
          <>
            <button
              type="button"
              className="link link--muted"
              style={{ fontSize: 11 }}
              disabled={recheck.isPending}
              aria-label={`Re-check DNS for ${d.domain}`}
              onClick={() =>
                recheck.mutate(d.id, { onSuccess: () => toast(`DNS re-checked for ${d.domain} — SPF, DKIM and DMARC refreshed`) })
              }
            >
              {recheck.isPending ? 'Checking…' : 'Re-check DNS'}
            </button>
            <button
              type="button"
              className="link"
              style={{ fontSize: 11 }}
              disabled={pause.isPending}
              aria-label={`${d.paused ? 'Resume sending' : 'Pause sending'} for ${d.tenantName}`}
              onClick={togglePause}
            >
              {d.paused ? 'Resume' : 'Pause sending'}
            </button>
          </>
        )}
      </div>
    </TRow>
  );
}

export default function DeliverPage() {
  const can = useCan();
  const q = useDeliverability();
  const d = q.data;
  const canManage = can('platform.manage');
  const over = d ? d.domains.filter((x) => x.risk === 'Over threshold' && !x.paused) : [];

  if (q.error)
    return (
      <Screen max={1250}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1250} label="Email deliverability">
      <Tiles
        items={
          d && [
            { label: 'Sent · 30d', value: num(d.summary.sent30d), sub: 'Across every tenant domain' },
            { label: 'Bounce rate', value: pctText(d.summary.bounceRate), sub: `Provider threshold ${d.summary.thresholds.bounceMax}%` },
            {
              label: 'Complaint rate',
              value: pctText(d.summary.complaintRate),
              sub:
                d.summary.complaintRate >= d.summary.thresholds.complaintWatch
                  ? `Over the ${d.summary.thresholds.complaintWatch}% watch line`
                  : `Watch line ${d.summary.thresholds.complaintWatch}% · max ${d.summary.thresholds.complaintMax}%`,
            },
            { label: 'Domains at risk', value: num(d.summary.domainsAtRisk), sub: 'Missing DNS or over threshold' },
          ]
        }
      />

      {over.length > 0 && (
        <div className="callout callout--bad" role="status" style={{ alignItems: 'center' }}>
          <span aria-hidden="true">⚠</span>
          <span className="fg-bad" style={{ fontWeight: 600, flex: 1 }}>
            {list(over.map((x) => x.tenantName))} {over.length === 1 ? 'is' : 'are'} past the bounce or complaint threshold and still
            sending.
          </span>
        </div>
      )}

      <div className="card table-scroll" style={{ padding: '6px 18px 4px' }}>
        <div role="table" aria-label="Sending domains">
          <TRow cols={COLS} min={980} head style={{ gap: 10, fontSize: 10.5 }}>
            <div role="columnheader">Sending domain</div>
            <div role="columnheader">SPF</div>
            <div role="columnheader">DKIM</div>
            <div role="columnheader">DMARC</div>
            <div role="columnheader">Sent · 30d</div>
            <div role="columnheader">Bounce</div>
            <div role="columnheader">Complaint</div>
            <div role="columnheader">Status</div>
          </TRow>
          {q.isPending && <SkeletonRows rows={5} h={22} />}
          {d?.domains.map((x) => (
            <DomainRow key={x.id} d={x} canManage={canManage} />
          ))}
          {d && d.domains.length === 0 && <Empty>No tenant sends from its own domain yet.</Empty>}
        </div>
      </div>

      <div className="grid-2">
        <Card title="Suppression list" style={{ padding: '18px 20px' }}>
          <p className="muted t-sm" style={{ margin: '0 0 4px' }}>
            Shared across every tenant — a suppressed address is never emailed again.
          </p>
          {d ? (
            <ul className="plain-list">
              {d.suppression.map((s) => (
                <li key={s.list} className="row" style={{ gap: 10, padding: '10px 0', fontSize: 12.5 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{s.list}</div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {s.note}
                    </div>
                  </div>
                  <span style={{ fontWeight: 700 }}>{num(s.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <SkeletonRows rows={4} h={20} />
          )}
        </Card>
        <div className="card note" style={{ padding: '18px 20px', fontSize: 12.5, lineHeight: 1.6 }}>
          <b style={{ color: 'var(--tx)' }}>Why this matters</b>
          <br />
          Every tenant sends from their own domain but shares our IP pool — one bad sender raises everyone’s spam rate, so pausing is
          immediate and reversible.
          {d && (
            <>
              <br />
              <span className="faint">
                Watch at {d.summary.thresholds.bounceWatch}% bounces or {d.summary.thresholds.complaintWatch}% complaints; over at{' '}
                {d.summary.thresholds.bounceMax}% or {d.summary.thresholds.complaintMax}%.
              </span>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
