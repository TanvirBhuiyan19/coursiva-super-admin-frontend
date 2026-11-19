import { useState } from 'react';
import {
  Badge,
  Card,
  ConfirmButton,
  Empty,
  ErrorState,
  KpiRow,
  Modal,
  Pagination,
  QueryState,
  Screen,
  Select,
  Skeleton,
  SkeletonRows,
  TRow,
} from '@/components/ui';
import { useUrlState } from '@/lib/useUrlState';
import { SectionedPage, SectionPanel } from '@/components/ui/Sectioned';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { daysUntil, formatDate, formatDateTime, timeAgo, toneFg } from '@/lib/format';
import { useSection } from '@/lib/useSection';
import { toast } from '@/store/ui';
import { previewRetention, useComplianceSummary, useDsars, useFulfilDsar, useRetention, useSetRetention } from '../api';
import { dueLabel } from '../components/format';
import { SubProcessorsCard } from '../components/SubProcessorsCard';
import { useT } from '../i18n';
import { RETENTION_PERIODS, type Dsar, type DsarType, type RetentionPeriod, type RetentionSetting } from '../types';

const SECTIONS = ['dsars', 'retention', 'processors'] as const;

const COLS = 'minmax(0,1.6fr) minmax(0,1.5fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1fr) minmax(0,1.3fr)';
const TYPE_TONE: Record<DsarType, Tone> = { Access: 'info', Deletion: 'bad', Portability: 'warn' };

function dueTone(days: number): Tone {
  return days <= 0 ? 'bad' : days <= 5 ? 'warn' : 'flat';
}

function DsarAction({ d }: { d: Dsar }) {
  const t = useT();
  const can = useCan();
  const fulfil = useFulfilDsar();
  if (d.fulfilledAt)
    return (
      <Badge tone="good" title={formatDateTime(d.fulfilledAt)}>
        {t(d.type === 'Deletion' ? 'compliance.erased' : 'compliance.fulfilled', { when: timeAgo(d.fulfilledAt) })}
      </Badge>
    );
  if (!can('governance.manage')) return <Badge tone="flat">{t('compliance.pending')}</Badge>;
  const run = () =>
    fulfil.mutate(d.id, {
      onSuccess: () =>
        toast(
          d.type === 'Deletion'
            ? t('compliance.toastErased', { requester: d.requester, tenant: d.tenantName })
            : t('compliance.toastSent', { requester: d.requester }),
        ),
    });
  return d.type === 'Deletion' ? (
    <ConfirmButton
      className="btn btn--sm btn--danger"
      confirmLabel={t('compliance.confirmErase')}
      pending={fulfil.isPending}
      onConfirm={run}
    >
      {t(`compliance.actions.${d.type}`)}
    </ConfirmButton>
  ) : (
    <button type="button" className="btn btn--sm btn--primary" disabled={fulfil.isPending} onClick={run}>
      {t(`compliance.actions.${d.type}`)}
    </button>
  );
}

function DsarTable() {
  const t = useT();
  const [f, setF] = useUrlState({ dsarPage: '' });
  const list = useDsars(undefined, Number(f.dsarPage) || 1);
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <Card title={t('compliance.dsars.title')} sub={t('compliance.dsars.sub')} className="table-scroll">
      <div role="table" aria-label={t('compliance.dsars.title')} aria-busy={list.isFetching}>
        <TRow cols={COLS} min={760} head>
          <div role="columnheader">{t('compliance.dsars.requester')}</div>
          <div role="columnheader">{t('compliance.dsars.tenant')}</div>
          <div role="columnheader">{t('compliance.dsars.type')}</div>
          <div role="columnheader">{t('compliance.dsars.received')}</div>
          <div role="columnheader">{t('compliance.dsars.due')}</div>
          <div role="columnheader">{t('compliance.dsars.status')}</div>
        </TRow>
        {list.isPending ? (
          <SkeletonRows rows={4} h={22} />
        ) : list.data.data.length === 0 ? (
          <Empty>{t('compliance.dsars.empty')}</Empty>
        ) : (
          list.data.data.map((d) => {
            const days = daysUntil(d.dueAt);
            return (
              <TRow key={d.id} cols={COLS} min={760}>
                <div role="cell" className="ellipsis t-strong">
                  {d.requester}
                </div>
                <div role="cell" className="ellipsis muted">
                  {d.tenantName}
                </div>
                <div role="cell">
                  <Badge tone={TYPE_TONE[d.type]}>{t(`enums.dsarType.${d.type}`)}</Badge>
                </div>
                <div role="cell" className="muted">
                  <time dateTime={d.receivedAt} title={formatDateTime(d.receivedAt)}>
                    {timeAgo(d.receivedAt)}
                  </time>
                </div>
                <div role="cell" className="t-strong" style={{ color: d.fulfilledAt ? 'var(--tx4)' : toneFg(dueTone(days)) }}>
                  {d.fulfilledAt ? (
                    '—'
                  ) : (
                    <time dateTime={d.dueAt} title={formatDate(d.dueAt)}>
                      {dueLabel(days)}
                    </time>
                  )}
                </div>
                <div role="cell">
                  <DsarAction d={d} />
                </div>
              </TRow>
            );
          })
        )}
      </div>
      {list.data && list.data.meta.lastPage > 1 && (
        <Pagination meta={list.data.meta} onPage={(p) => setF({ dsarPage: String(p) })} noun={t('compliance.dsars.noun')} />
      )}
    </Card>
  );
}

/** `affected`: null while counting, 'error' when the count failed (never shown as "nothing affected"). */
type PendingRetention = { key: string; label: string; period: RetentionPeriod; affected: number | null | 'error' };

function RetentionCard() {
  const t = useT();
  const can = useCan();
  const q = useRetention();
  const save = useSetRetention();
  const [pending, setPending] = useState<PendingRetention | null>(null);
  const commit = (key: string, label: string, period: RetentionPeriod) =>
    save.mutate(
      { key, period },
      {
        onSuccess: () => {
          setPending(null);
          toast(t('compliance.retention.saved', { label, period: t(`enums.retentionPeriod.${period}`) }));
        },
      },
    );
  const choose = (r: RetentionSetting, period: RetentionPeriod) => {
    // A shorter period purges records sooner: show how many before saving it.
    if (RETENTION_PERIODS.indexOf(period) >= RETENTION_PERIODS.indexOf(r.period)) {
      commit(r.key, r.label, period);
      return;
    }
    setPending({ key: r.key, label: r.label, period, affected: null });
    previewRetention(r.key, period).then(
      (p) => setPending((cur) => (cur && cur.key === r.key && cur.period === period ? { ...cur, affected: p.affected } : cur)),
      () => setPending((cur) => (cur && cur.key === r.key && cur.period === period ? { ...cur, affected: 'error' } : cur)),
    );
  };
  return (
    <Card title={t('compliance.retention.title')}>
      <p className="t-sm muted" style={{ margin: '0 0 12px' }}>
        {t('compliance.retention.intro')}
      </p>
      <QueryState query={q} skeleton={<SkeletonRows rows={4} h={22} />} compact>
        {(rows) => (
          <ul className="stack plain-list">
            {rows.map((r) => {
              const floor = r.minPeriod ? RETENTION_PERIODS.indexOf(r.minPeriod) : 0;
              return (
                <li key={r.key} className="row" style={{ alignItems: 'flex-start' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-strong">{r.label}</span>
                    <span className="faint" style={{ display: 'block', fontSize: 11.5 }}>
                      {r.lastRunAt
                        ? t('compliance.retention.lastRun', { when: timeAgo(r.lastRunAt), count: r.lastAffected })
                        : t('compliance.retention.neverRun')}
                      {r.minPeriod && ` · ${t('compliance.retention.minimum', { period: t(`enums.retentionPeriod.${r.minPeriod}`) })}`}
                    </span>
                  </span>
                  <Select
                    value={r.period}
                    options={RETENTION_PERIODS.slice(floor).map((p) => [p, t(`enums.retentionPeriod.${p}`)] as const)}
                    label={t('compliance.retention.selectLabel', { label: r.label })}
                    disabled={!can('governance.manage') || save.isPending}
                    style={{ width: 'auto', padding: '6px 9px', fontSize: 12.5, fontWeight: 600, borderRadius: 7 }}
                    onChange={(period) => choose(r, period)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
      {pending && (
        <Modal
          onClose={() => setPending(null)}
          label={t('compliance.retention.confirmTitle', { label: pending.label, period: t(`enums.retentionPeriod.${pending.period}`) })}
        >
          <h2 className="modal-title">
            {t('compliance.retention.confirmTitle', { label: pending.label, period: t(`enums.retentionPeriod.${pending.period}`) })}
          </h2>
          <p className="t-sm" style={{ margin: '6px 0 16px' }}>
            {pending.affected === null
              ? t('compliance.retention.checking')
              : pending.affected === 'error'
                ? t('compliance.retention.countFailed')
                : pending.affected === 0
                  ? t('compliance.retention.confirmNone')
                  : t('compliance.retention.confirmBody', { count: pending.affected })}
          </p>
          <div className="hstack" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              {t('compliance.retention.cancel')}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={pending.affected === null || save.isPending}
              onClick={() => commit(pending.key, pending.label, pending.period)}
            >
              {t('compliance.retention.confirm')}
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

export default function CompliancePage() {
  const t = useT();
  const summary = useComplianceSummary();
  const s = summary.data;
  const nearest = s?.nearestDueAt ? daysUntil(s.nearestDueAt) : null;
  const [section, setSection, sectionHref] = useSection(SECTIONS, 'dsars');
  const open = s?.openDsars ?? 0;

  return (
    <Screen max={1150} label={t('compliance.title')}>
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : s ? (
        <KpiRow
          items={[
            {
              label: t('compliance.kpi.openDsars'),
              value: String(s.openDsars),
              sub: s.overdueDsars ? t('compliance.kpi.overdue', { count: s.overdueDsars }) : t('compliance.kpi.noneOverdue'),
            },
            {
              label: t('compliance.kpi.nearestDeadline'),
              value: (
                <span style={{ color: nearest != null && nearest <= 0 ? 'var(--rFg)' : undefined }}>
                  {nearest == null ? '—' : dueLabel(nearest, true)}
                </span>
              ),
              sub: s.nearestDueAt ? formatDate(s.nearestDueAt) : t('compliance.kpi.nothingPending'),
            },
            { label: t('compliance.kpi.subProcessors'), value: String(s.subProcessors), sub: t('compliance.kpi.listedInDpa') },
            {
              label: t('compliance.kpi.dpasSigned'),
              value: t('compliance.kpi.dpasSignedValue', { signed: s.dpasSigned, total: s.tenants }),
              sub: t('compliance.kpi.onLiveDpa'),
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

      <SectionedPage
        sections={SECTIONS.map((id) => ({
          id,
          label: t(`sections.compliance.${id}`),
          ...(id === 'dsars'
            ? {
                badge: open,
                badgeLabel: t('sections.compliance.openBadge', { count: open }),
                badgeTone: s?.overdueDsars ? ('bad' as const) : ('accent' as const),
              }
            : {}),
        }))}
        active={section}
        onChange={setSection}
        label={t('sections.compliance.nav')}
        href={sectionHref}
      >
        <SectionPanel active={section === 'dsars'}>
          <DsarTable />
        </SectionPanel>
        <SectionPanel active={section === 'retention'}>
          <RetentionCard />
        </SectionPanel>
        <SectionPanel active={section === 'processors'}>
          <SubProcessorsCard />
        </SectionPanel>
      </SectionedPage>
    </Screen>
  );
}
