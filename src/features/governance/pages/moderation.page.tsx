import { Link } from 'react-router-dom';
import {
  Badge,
  Bar,
  Card,
  ChipGroup,
  ConfirmButton,
  Empty,
  ErrorState,
  KpiRow,
  QueryState,
  Screen,
  Skeleton,
  SkeletonRows,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { formatDateTime, sevTone, timeAgo } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useDecideReport, useModerationSummary, useReports, useStrikes } from '../api';
import { monthList, strikeTone } from '../components/format';
import { SEVERITIES, type ModerationDecision, type ModerationReport, type ReportStatus, type Severity } from '../types';

const DECISION: Record<ModerationDecision, [string, Tone]> = {
  removed: ['Content removed', 'bad'],
  kept: ['Kept · no violation', 'good'],
  limited: ['Access limited', 'flat'],
};

const DECISION_TOAST: Record<ModerationDecision, (r: ModerationReport) => string> = {
  removed: (r) => `${r.kind} upheld — content removed, ${r.tenantName} notified with the appeal window`,
  limited: () => 'Access limited — hidden from students while the tenant responds',
  kept: () => 'Closed as no violation — reporter notified',
};

function ReportCard({ r }: { r: ModerationReport }) {
  const can = useCan();
  const decide = useDecideReport();
  const [status, tone] = r.decision ? DECISION[r.decision] : [`${r.severity} priority`, sevTone(r.severity)];
  const open = r.decision === null || r.decision === 'limited';
  const act = (decision: ModerationDecision) =>
    decide.mutate({ id: r.id, decision }, { onSuccess: () => toast(DECISION_TOAST[decision](r)) });
  const pending = decide.isPending;

  return (
    <li className="card" style={{ padding: '16px 18px' }} aria-label={`${r.kind} — ${r.tenantName}`}>
      <div className="hstack wrap" style={{ alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ fontWeight: 700, fontSize: 13.5, margin: 0 }}>{r.kind}</h2>
        <Badge tone={tone} style={{ fontSize: 11 }}>
          {status}
        </Badge>
        {r.decision && r.severity === 'High' && (
          <Badge tone="bad" xs>
            High
          </Badge>
        )}
        <div className="spacer" />
        <time className="t-xs faint" dateTime={r.receivedAt} title={formatDateTime(r.receivedAt)}>
          {timeAgo(r.receivedAt)}
        </time>
      </div>
      <div className="t-sm muted" style={{ marginTop: 5 }}>
        <b style={{ color: 'var(--tx)' }}>{r.tenantName}</b> · {r.location}
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: '8px 0 0' }}>{r.detail}</p>
      <div className="t-xs faint" style={{ marginTop: 6 }}>
        Source · {r.source}
        {r.decidedAt && r.decidedBy && ` · ${r.decision === 'limited' ? 'limited' : 'decided'} by ${r.decidedBy} ${timeAgo(r.decidedAt)}`}
      </div>
      {(open || can('tenants.view')) && (
        <div className="hstack wrap" style={{ marginTop: 12 }}>
          {open && can('governance.manage') && (
            <>
              <ConfirmButton
                className="btn btn--sm btn--danger"
                confirmLabel="Confirm removal"
                pending={pending && decide.variables.decision === 'removed'}
                disabled={pending}
                onConfirm={() => act('removed')}
              >
                Remove content
              </ConfirmButton>
              {r.decision !== 'limited' && (
                <button type="button" className="btn btn--sm" disabled={pending} onClick={() => act('limited')}>
                  Limit access
                </button>
              )}
              <button type="button" className="btn btn--sm" disabled={pending} onClick={() => act('kept')}>
                No violation
              </button>
            </>
          )}
          {can('tenants.view') && (
            <Link className="btn btn--sm" to={`/tenants/${r.tenantId}`}>
              Open tenant
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function StrikeRecord({ limit }: { limit: number }) {
  const q = useStrikes();
  return (
    <Card title="Strike record" style={{ padding: '18px 20px' }}>
      <p className="t-sm muted" style={{ margin: '0 0 4px' }}>
        {limit} upheld violations suspends publishing for that tenant.
      </p>
      <QueryState query={q} skeleton={<SkeletonRows rows={3} h={30} />} compact>
        {(rows) =>
          rows.length ? (
            <ul className="plain-list">
              {rows.map((s) => {
                const tone = strikeTone(s.strikes, limit);
                const kinds = [...new Set(s.history.map((h) => h.kind))];
                return (
                  <li key={s.tenantId} style={{ padding: '11px 0', borderBottom: '1px solid var(--bd2)' }}>
                    <div className="hstack t-sm">
                      <span className="ellipsis t-strong" style={{ flex: 1 }}>
                        {s.tenantName}
                      </span>
                      <Badge tone={tone} style={{ fontSize: 11, padding: '3px 8px' }}>
                        {s.strikes} of {limit} strikes
                      </Badge>
                    </div>
                    <Bar
                      size="thin"
                      tone={tone}
                      value={Math.round((Math.min(s.strikes, limit) / limit) * 100)}
                      style={{ marginTop: 6 }}
                      label={`${s.tenantName}: ${s.strikes} of ${limit} strikes`}
                    />
                    <div className="faint" style={{ fontSize: 11, marginTop: 5 }}>
                      {kinds.map((k) => `${k} · ${monthList(s.history.filter((h) => h.kind === k).map((h) => h.decidedAt))}`).join(' · ')}
                    </div>
                    {s.publishingSuspended && (
                      <div className="t-xs fg-bad" style={{ marginTop: 4, fontWeight: 700 }}>
                        Publishing suspended
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No tenant has an upheld violation.</Empty>
          )
        }
      </QueryState>
    </Card>
  );
}

export default function ModerationPage() {
  const [f, setF] = useUrlState({ severity: 'All', status: 'open' });
  const status: ReportStatus = f.status === 'decided' ? 'decided' : 'open';
  const severity = (SEVERITIES as readonly string[]).includes(f.severity) ? (f.severity as Severity) : undefined;
  const summary = useModerationSummary();
  const list = useReports({ status, ...(severity ? { severity } : {}) });
  const s = summary.data;
  const counts = list.data?.meta.severityCounts ?? [];
  const total = counts.reduce((n, c) => n + c.count, 0);
  const countOf = (sev: Severity) => counts.find((c) => c.severity === sev)?.count ?? 0;

  return (
    <Screen max={1250} label="Trust and moderation">
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : s ? (
        <KpiRow
          items={[
            { label: 'Open reports', value: String(s.openReports), sub: `${s.openHigh} high priority` },
            { label: 'DMCA notices · 90d', value: String(s.dmcaNotices90d), sub: 'Legal notices received' },
            {
              label: 'Median time to action',
              value: s.medianHoursToAction == null ? '—' : `${s.medianHoursToAction}h`,
              sub: 'Target 24h on legal notices',
            },
            { label: 'Tenants on strikes', value: String(s.tenantsOnStrikes), sub: `${s.strikeLimit} strikes suspends publishing` },
          ]}
        />
      ) : (
        <div className="grid-kpi">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card card--tight">
              <Skeleton h={12} w="50%" />
              <Skeleton h={24} w="40%" style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      )}

      <div className="hstack wrap" style={{ gap: 12 }}>
        <ChipGroup
          label="Report status"
          size="sm"
          accent
          options={[
            ['open', 'Open'],
            ['decided', 'Decided'],
          ]}
          value={status}
          onChange={(v) => setF({ status: v })}
        />
        <ChipGroup
          label="Filter by severity"
          size="sm"
          options={[['All', `All · ${total}`], ...SEVERITIES.map((sev) => [sev, `${sev} · ${countOf(sev)}`] as const)]}
          value={severity ?? 'All'}
          onChange={(v) => setF({ severity: v })}
        />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}
      >
        <section className="min0" aria-label="Report queue" aria-busy={list.isFetching}>
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : list.isPending ? (
            <div className="card">
              <SkeletonRows rows={5} h={24} />
            </div>
          ) : list.data.data.length === 0 ? (
            <div className="card">
              <Empty>{status === 'open' ? 'Nothing in this queue.' : 'No decided reports match.'}</Empty>
            </div>
          ) : (
            <ul className="stack plain-list" style={{ gap: 12 }}>
              {list.data.data.map((r) => (
                <ReportCard key={r.id} r={r} />
              ))}
            </ul>
          )}
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <StrikeRecord limit={s?.strikeLimit ?? 3} />
          <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
            We host other people’s content, so takedowns are handled here rather than by the tenant. Every decision notifies both sides and
            starts the appeal clock.
          </div>
        </div>
      </div>
    </Screen>
  );
}
