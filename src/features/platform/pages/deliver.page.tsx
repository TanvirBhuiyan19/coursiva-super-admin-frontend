import { Badge, Card, Empty, ErrorState, Screen, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { num, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useDeliverability, usePauseSending, useRecheckDns } from '../api';
import { Tiles } from '../components/Tiles';
import { t, useT } from '../i18n';
import type { DnsCheck, SenderDomain, SenderRisk } from '../types';

/** Decorative warning glyph (not text). */
const WARN_ICON = '⚠';
const COLS =
  'minmax(0,1.8fr) minmax(0,0.6fr) minmax(0,0.6fr) minmax(0,0.9fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.8fr) minmax(0,2.1fr)';
const RISK_TONE: Record<SenderRisk, Tone> = { Healthy: 'good', Watch: 'warn', 'Over threshold': 'bad' };
const DNS_TONE: Record<DnsCheck, string> = { Pass: '', Fail: 'fg-bad', 'Not set': 'fg-warn' };
const pctText = (n: number) => `${n}%`;
function list(names: string[]) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return t('deliver.listPair', { first: names[0]!, second: names[1]! });
  return t('deliver.listMany', { rest: names.slice(0, -1).join(t('deliver.listSeparator')), last: names.at(-1)! });
}

function DomainRow({ d, canManage }: { d: SenderDomain; canManage: boolean }) {
  const t = useT();
  const pause = usePauseSending();
  const recheck = useRecheckDns();
  const status = d.paused ? t('deliver.sendingPaused') : t(`enums.senderRisk.${d.risk}`);
  const tone: Tone = d.paused ? 'flat' : RISK_TONE[d.risk];

  const togglePause = () =>
    pause.mutate(
      { id: d.id, paused: !d.paused },
      {
        onSuccess: () => toast(d.paused ? t('deliver.resumed', { tenant: d.tenantName }) : t('deliver.paused', { tenant: d.tenantName })),
      },
    );

  return (
    <TRow cols={COLS} min={980} style={{ gap: 10, padding: '11px 0', fontSize: 12.5 }}>
      <div role="cell" className="min0">
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {d.tenantName}
        </div>
        <div className="faint ellipsis" style={{ fontSize: 11 }} title={t('deliver.dnsChecked', { time: timeAgo(d.dnsCheckedAt) })}>
          {d.domain}
        </div>
      </div>
      <div role="cell" className={DNS_TONE[d.spf]}>
        {t(`enums.dnsCheck.${d.spf}`)}
      </div>
      <div role="cell" className={DNS_TONE[d.dkim]}>
        {t(`enums.dnsCheck.${d.dkim}`)}
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
              aria-label={t('deliver.recheckLabel', { domain: d.domain })}
              onClick={() => recheck.mutate(d.id, { onSuccess: () => toast(t('deliver.rechecked', { domain: d.domain })) })}
            >
              {recheck.isPending ? t('deliver.checking') : t('deliver.recheck')}
            </button>
            <button
              type="button"
              className="link"
              style={{ fontSize: 11 }}
              disabled={pause.isPending}
              aria-label={t(d.paused ? 'deliver.resumeLabel' : 'deliver.pauseLabel', { tenant: d.tenantName })}
              onClick={togglePause}
            >
              {d.paused ? t('deliver.resume') : t('deliver.pause')}
            </button>
          </>
        )}
      </div>
    </TRow>
  );
}

export default function DeliverPage() {
  const t = useT();
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
    <Screen max={1250} label={t('deliver.screenLabel')}>
      <Tiles
        items={
          d && [
            { label: t('deliver.tiles.sent'), value: num(d.summary.sent30d), sub: t('deliver.tiles.sentSub') },
            {
              label: t('deliver.tiles.bounce'),
              value: pctText(d.summary.bounceRate),
              sub: t('deliver.tiles.bounceSub', { max: d.summary.thresholds.bounceMax }),
            },
            {
              label: t('deliver.tiles.complaint'),
              value: pctText(d.summary.complaintRate),
              sub:
                d.summary.complaintRate >= d.summary.thresholds.complaintWatch
                  ? t('deliver.tiles.complaintOver', { watch: d.summary.thresholds.complaintWatch })
                  : t('deliver.tiles.complaintSub', { watch: d.summary.thresholds.complaintWatch, max: d.summary.thresholds.complaintMax }),
            },
            { label: t('deliver.tiles.atRisk'), value: num(d.summary.domainsAtRisk), sub: t('deliver.tiles.atRiskSub') },
          ]
        }
      />

      {over.length > 0 && (
        <div className="callout callout--bad" role="status" style={{ alignItems: 'center' }}>
          <span aria-hidden="true">{WARN_ICON}</span>
          <span className="fg-bad" style={{ fontWeight: 600, flex: 1 }}>
            {t('deliver.overThreshold', { count: over.length, names: list(over.map((x) => x.tenantName)) })}
          </span>
        </div>
      )}

      <div className="card table-scroll" style={{ padding: '6px 18px 4px' }}>
        <div role="table" aria-label={t('deliver.table')}>
          <TRow cols={COLS} min={980} head style={{ gap: 10, fontSize: 10.5 }}>
            <div role="columnheader">{t('deliver.cols.domain')}</div>
            <div role="columnheader">{t('deliver.cols.spf')}</div>
            <div role="columnheader">{t('deliver.cols.dkim')}</div>
            <div role="columnheader">{t('deliver.cols.dmarc')}</div>
            <div role="columnheader">{t('deliver.cols.sent')}</div>
            <div role="columnheader">{t('deliver.cols.bounce')}</div>
            <div role="columnheader">{t('deliver.cols.complaint')}</div>
            <div role="columnheader">{t('deliver.cols.status')}</div>
          </TRow>
          {q.isPending && <SkeletonRows rows={5} h={22} />}
          {d?.domains.map((x) => (
            <DomainRow key={x.id} d={x} canManage={canManage} />
          ))}
          {d && d.domains.length === 0 && <Empty>{t('deliver.empty')}</Empty>}
        </div>
      </div>

      <div className="grid-2">
        <Card title={t('deliver.suppressionTitle')} style={{ padding: '18px 20px' }}>
          <p className="muted t-sm" style={{ margin: '0 0 4px' }}>
            {t('deliver.suppressionIntro')}
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
          <b style={{ color: 'var(--tx)' }}>{t('deliver.whyTitle')}</b>
          <br />
          {t('deliver.whyBody')}
          {d && (
            <>
              <br />
              <span className="faint">
                {t('deliver.thresholds', {
                  bounceWatch: d.summary.thresholds.bounceWatch,
                  complaintWatch: d.summary.thresholds.complaintWatch,
                  bounceMax: d.summary.thresholds.bounceMax,
                  complaintMax: d.summary.thresholds.complaintMax,
                })}
              </span>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
