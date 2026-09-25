import {
  Badge,
  Card,
  ConfirmButton,
  Empty,
  ErrorState,
  KpiRow,
  QueryState,
  Screen,
  Select,
  Skeleton,
  SkeletonRows,
  TRow,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { daysUntil, formatDate, formatDateTime, timeAgo, toneFg } from '@/lib/format';
import { toast } from '@/store/ui';
import { useComplianceSummary, useDsars, useFulfilDsar, useRetention, useSetRetention } from '../api';
import { dueLabel } from '../components/format';
import { SubProcessorsCard } from '../components/SubProcessorsCard';
import { useT } from '../i18n';
import { RETENTION_PERIODS, type Dsar, type DsarType } from '../types';

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
  const list = useDsars();
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
    </Card>
  );
}

function RetentionCard() {
  const t = useT();
  const can = useCan();
  const q = useRetention();
  const save = useSetRetention();
  return (
    <Card title={t('compliance.retention.title')}>
      <p className="t-sm muted" style={{ margin: '0 0 12px' }}>
        {t('compliance.retention.intro')}
      </p>
      <QueryState query={q} skeleton={<SkeletonRows rows={4} h={22} />} compact>
        {(rows) => (
          <ul className="stack plain-list">
            {rows.map((r) => (
              <li key={r.key} className="row">
                <span className="t-strong" style={{ flex: 1 }}>
                  {r.label}
                </span>
                <Select
                  value={r.period}
                  options={RETENTION_PERIODS.map((p) => [p, t(`enums.retentionPeriod.${p}`)] as const)}
                  label={t('compliance.retention.selectLabel', { label: r.label })}
                  disabled={!can('governance.manage')}
                  style={{ width: 'auto', padding: '6px 9px', fontSize: 12.5, fontWeight: 600, borderRadius: 7 }}
                  onChange={(period) =>
                    save.mutate(
                      { key: r.key, period },
                      {
                        onSuccess: () =>
                          toast(t('compliance.retention.saved', { label: r.label, period: t(`enums.retentionPeriod.${period}`) })),
                      },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}

export default function CompliancePage() {
  const t = useT();
  const summary = useComplianceSummary();
  const s = summary.data;
  const nearest = s?.nearestDueAt ? daysUntil(s.nearestDueAt) : null;

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

      <DsarTable />

      <div className="grid-2">
        <RetentionCard />
        <SubProcessorsCard />
      </div>
    </Screen>
  );
}
