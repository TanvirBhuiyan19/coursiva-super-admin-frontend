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
  Pagination,
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
import { t as tStatic, useT } from '../i18n';
import { SEVERITIES, type ModerationDecision, type ModerationReport, type ReportStatus, type Severity } from '../types';

const DECISION_TONE: Record<ModerationDecision, Tone> = { removed: 'bad', kept: 'good', limited: 'flat' };

/** What the decision did, from the server's answer (the item hidden or restored, the reporter emailed). */
const decisionToast = (decision: ModerationDecision, r: ModerationReport) => {
  const linked = r.contentType !== null && r.enforcement !== 'not_found';
  const base =
    decision === 'removed'
      ? tStatic(linked ? 'moderation.toast.removed' : 'moderation.toast.removedNoRef', { kind: r.kind, tenant: r.tenantName })
      : decision === 'limited'
        ? tStatic(linked ? 'moderation.toast.limited' : 'moderation.toast.limitedNoRef', { tenant: r.tenantName })
        : tStatic(r.enforcement === 'restored' ? 'moderation.toast.keptRestored' : 'moderation.toast.kept');
  return r.reporterNotifiedAt && decision !== 'limited' ? base + tStatic('moderation.toast.reporterNotified') : base;
};

function ReportCard({ r }: { r: ModerationReport }) {
  const t = useT();
  const can = useCan();
  const decide = useDecideReport();
  const [status, tone] = r.decision
    ? [t(`moderation.decision.${r.decision}`), DECISION_TONE[r.decision]]
    : [t('moderation.priority', { severity: t(`enums.severity.${r.severity}`) }), sevTone(r.severity)];
  const open = r.decision === null || r.decision === 'limited';
  const act = (decision: ModerationDecision) =>
    decide.mutate({ id: r.id, decision }, { onSuccess: (next) => toast(decisionToast(decision, next)) });
  const pending = decide.isPending;

  return (
    <li className="card" style={{ padding: '16px 18px' }} aria-label={t('moderation.cardLabel', { kind: r.kind, tenant: r.tenantName })}>
      <div className="hstack wrap" style={{ alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ fontWeight: 700, fontSize: 13.5, margin: 0 }}>{r.kind}</h2>
        <Badge tone={tone} style={{ fontSize: 11 }}>
          {status}
        </Badge>
        {r.decision && r.severity === 'High' && (
          <Badge tone="bad" xs>
            {t('enums.severity.High')}
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
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: '8px 0 0', overflowWrap: 'anywhere' }}>{r.detail}</p>
      {(r.category || r.enforcement || !r.countsAsStrike) && (
        <div className="hstack wrap" style={{ gap: 6, marginTop: 8 }}>
          {r.category && (
            <Badge tone="flat" xs>
              {t(`moderation.category.${r.category}`)}
            </Badge>
          )}
          {r.category && (
            <Badge tone="flat" xs>
              {r.contentType ? t(`moderation.content.${r.contentType}`) : t('moderation.content.none')}
            </Badge>
          )}
          {r.enforcement && (
            <Badge tone={r.enforcement === 'hidden' ? 'warn' : 'flat'} xs>
              {t(`moderation.enforcement.${r.enforcement}`)}
            </Badge>
          )}
          {!r.countsAsStrike && (
            <Badge tone="flat" xs>
              {t('moderation.noStrike')}
            </Badge>
          )}
        </div>
      )}
      <div className="t-xs faint" style={{ marginTop: 6, overflowWrap: 'anywhere' }}>
        {t('moderation.source', { source: r.source })}
        {r.category &&
          ` · ${r.reporter ? t('moderation.reporter', { who: r.reporter.name ? `${r.reporter.name} <${r.reporter.email}>` : r.reporter.email }) : t('moderation.anonymous')}`}
        {(r.reporterCount ?? 0) > 1 && ` · ${t('moderation.reporterCount', { count: r.reporterCount ?? 0 })}`}
        {r.decidedAt &&
          r.decidedBy &&
          t(r.decision === 'limited' ? 'moderation.limitedBy' : 'moderation.decidedBy', { name: r.decidedBy, when: timeAgo(r.decidedAt) })}
      </div>
      {(open || can('tenants.view')) && (
        <div className="hstack wrap" style={{ marginTop: 12 }}>
          {open && can('governance.manage') && (
            <>
              <ConfirmButton
                className="btn btn--sm btn--danger"
                confirmLabel={t('moderation.confirmRemoval')}
                pending={pending && decide.variables.decision === 'removed'}
                disabled={pending}
                onConfirm={() => act('removed')}
              >
                {t('moderation.removeContent')}
              </ConfirmButton>
              {r.decision !== 'limited' && (
                <button type="button" className="btn btn--sm" disabled={pending} onClick={() => act('limited')}>
                  {t('moderation.limitAccess')}
                </button>
              )}
              <button type="button" className="btn btn--sm" disabled={pending} onClick={() => act('kept')}>
                {t('moderation.noViolation')}
              </button>
            </>
          )}
          {can('tenants.view') && (
            <Link className="btn btn--sm" to={`/tenants/${r.tenantId}`}>
              {t('moderation.openTenant')}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function StrikeRecord({ limit }: { limit: number }) {
  const t = useT();
  const [f, setF] = useUrlState({ strikesPage: '' });
  const q = useStrikes(Number(f.strikesPage) || 1);
  return (
    <Card title={t('moderation.strikes.title')} style={{ padding: '18px 20px' }}>
      <p className="t-sm muted" style={{ margin: '0 0 4px' }}>
        {t('moderation.strikes.intro', { limit })}
      </p>
      <QueryState query={q} skeleton={<SkeletonRows rows={3} h={30} />} compact>
        {(page) =>
          page.data.length ? (
            <>
              <ul className="plain-list" aria-busy={q.isPlaceholderData} style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
                {page.data.map((s) => {
                  const tone = strikeTone(s.strikes, limit);
                  const kinds = [...new Set(s.history.map((h) => h.kind))];
                  return (
                    <li key={s.tenantId} style={{ padding: '11px 0', borderBottom: '1px solid var(--bd2)' }}>
                      <div className="hstack t-sm">
                        <span className="ellipsis t-strong" style={{ flex: 1 }}>
                          {s.tenantName}
                        </span>
                        <Badge tone={tone} style={{ fontSize: 11, padding: '3px 8px' }}>
                          {t('moderation.strikes.count', { strikes: s.strikes, limit })}
                        </Badge>
                      </div>
                      <Bar
                        size="thin"
                        tone={tone}
                        value={Math.round((Math.min(s.strikes, limit) / limit) * 100)}
                        style={{ marginTop: 6 }}
                        label={t('moderation.strikes.barLabel', { tenant: s.tenantName, strikes: s.strikes, limit })}
                      />
                      <div className="faint" style={{ fontSize: 11, marginTop: 5 }}>
                        {kinds
                          .map((k) =>
                            t('moderation.strikes.history', {
                              kind: k,
                              months: monthList(s.history.filter((h) => h.kind === k).map((h) => h.decidedAt)),
                            }),
                          )
                          .join(' · ')}
                      </div>
                      {s.publishingSuspended && (
                        <div className="t-xs fg-bad" style={{ marginTop: 4, fontWeight: 700 }}>
                          {t('moderation.strikes.suspended')}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {page.meta.lastPage > 1 && (
                <Pagination meta={page.meta} onPage={(p) => setF({ strikesPage: String(p) })} noun={t('moderation.strikes.noun')} />
              )}
            </>
          ) : (
            <Empty>{t('moderation.strikes.empty')}</Empty>
          )
        }
      </QueryState>
    </Card>
  );
}

export default function ModerationPage() {
  const t = useT();
  const [f, setF] = useUrlState({ severity: 'All', status: 'open', page: '1' });
  const status: ReportStatus = f.status === 'decided' ? 'decided' : 'open';
  const severity = (SEVERITIES as readonly string[]).includes(f.severity) ? (f.severity as Severity) : undefined;
  const summary = useModerationSummary();
  const page = Math.max(1, Number(f.page) || 1);
  const list = useReports({ status, page, ...(severity ? { severity } : {}) });
  const s = summary.data;
  const counts = list.data?.meta.severityCounts ?? [];
  const total = counts.reduce((n, c) => n + c.count, 0);
  const countOf = (sev: Severity) => counts.find((c) => c.severity === sev)?.count ?? 0;

  return (
    <Screen max={1250} label={t('moderation.title')}>
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : s ? (
        <KpiRow
          items={[
            {
              label: t('moderation.kpi.openReports'),
              value: String(s.openReports),
              sub: t('moderation.kpi.highPriority', { count: s.openHigh }),
            },
            { label: t('moderation.kpi.dmca'), value: String(s.dmcaNotices90d), sub: t('moderation.kpi.legalNotices') },
            {
              label: t('moderation.kpi.medianTime'),
              value: s.medianHoursToAction == null ? '—' : t('moderation.kpi.hours', { hours: s.medianHoursToAction }),
              sub: t('moderation.kpi.target'),
            },
            {
              label: t('moderation.kpi.onStrikes'),
              value: String(s.tenantsOnStrikes),
              sub: t('moderation.kpi.strikeLimit', { limit: s.strikeLimit }),
            },
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
          label={t('moderation.filters.status')}
          size="sm"
          accent
          options={[
            ['open', t('moderation.filters.open')],
            ['decided', t('moderation.filters.decided')],
          ]}
          value={status}
          onChange={(v) => setF({ status: v, page: '1' })}
        />
        <ChipGroup
          label={t('moderation.filters.severity')}
          size="sm"
          options={[
            ['All', t('moderation.filters.all', { count: total })],
            ...SEVERITIES.map(
              (sev) => [sev, t('moderation.filters.option', { severity: t(`enums.severity.${sev}`), count: countOf(sev) })] as const,
            ),
          ]}
          value={severity ?? 'All'}
          onChange={(v) => setF({ severity: v, page: '1' })}
        />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}
      >
        <section className="min0" aria-label={t('moderation.queue')} aria-busy={list.isFetching}>
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : list.isPending ? (
            <div className="card">
              <SkeletonRows rows={5} h={24} />
            </div>
          ) : list.data.data.length === 0 ? (
            <div className="card">
              <Empty>{status === 'open' ? t('moderation.emptyOpen') : t('moderation.emptyDecided')}</Empty>
            </div>
          ) : (
            <>
              <ul className="stack plain-list" style={{ gap: 12 }}>
                {list.data.data.map((r) => (
                  <ReportCard key={r.id} r={r} />
                ))}
              </ul>
              {list.data.meta.lastPage > 1 && (
                <div className="card card--tight" style={{ marginTop: 12 }}>
                  <Pagination meta={list.data.meta} noun={t('moderation.noun')} onPage={(p) => setF({ page: String(p) })} />
                </div>
              )}
            </>
          )}
        </section>

        <div className="stack" style={{ gap: 16 }}>
          <StrikeRecord limit={s?.strikeLimit ?? 3} />
          <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
            {t('moderation.note')}
          </div>
        </div>
      </div>
    </Screen>
  );
}
