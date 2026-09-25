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
import { RETENTION_PERIODS, type Dsar, type DsarType } from '../types';

const COLS = 'minmax(0,1.6fr) minmax(0,1.5fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1fr) minmax(0,1.3fr)';
const TYPE_TONE: Record<DsarType, Tone> = { Access: 'info', Deletion: 'bad', Portability: 'warn' };
const ACTION_LABEL: Record<DsarType, string> = { Access: 'Send report', Deletion: 'Erase data', Portability: 'Export data' };

function dueTone(days: number): Tone {
  return days <= 0 ? 'bad' : days <= 5 ? 'warn' : 'flat';
}

function DsarAction({ d }: { d: Dsar }) {
  const can = useCan();
  const fulfil = useFulfilDsar();
  if (d.fulfilledAt)
    return (
      <Badge tone="good" title={formatDateTime(d.fulfilledAt)}>
        ✓ {d.type === 'Deletion' ? 'Erased' : 'Fulfilled'} {timeAgo(d.fulfilledAt)}
      </Badge>
    );
  if (!can('governance.manage')) return <Badge tone="flat">Pending</Badge>;
  const run = () =>
    fulfil.mutate(d.id, {
      onSuccess: () =>
        toast(
          d.type === 'Deletion'
            ? `Data erased for ${d.requester} — ${d.tenantName} and the requester notified`
            : `Data package sent to ${d.requester}`,
        ),
    });
  return d.type === 'Deletion' ? (
    <ConfirmButton className="btn btn--sm btn--danger" confirmLabel="Confirm erase" pending={fulfil.isPending} onConfirm={run}>
      {ACTION_LABEL[d.type]}
    </ConfirmButton>
  ) : (
    <button type="button" className="btn btn--sm btn--primary" disabled={fulfil.isPending} onClick={run}>
      {ACTION_LABEL[d.type]}
    </button>
  );
}

function DsarTable() {
  const list = useDsars();
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <Card title="Data subject requests" sub="GDPR Art. 15 / 17 / 20 · 30-day statutory deadline" className="table-scroll">
      <div role="table" aria-label="Data subject requests" aria-busy={list.isFetching}>
        <TRow cols={COLS} min={760} head>
          <div role="columnheader">Requester</div>
          <div role="columnheader">Tenant</div>
          <div role="columnheader">Type</div>
          <div role="columnheader">Received</div>
          <div role="columnheader">Due</div>
          <div role="columnheader">Status</div>
        </TRow>
        {list.isPending ? (
          <SkeletonRows rows={4} h={22} />
        ) : list.data.data.length === 0 ? (
          <Empty>No privacy requests received.</Empty>
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
                  <Badge tone={TYPE_TONE[d.type]}>{d.type}</Badge>
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
  const can = useCan();
  const q = useRetention();
  const save = useSetRetention();
  return (
    <Card title="Retention policy">
      <p className="t-sm muted" style={{ margin: '0 0 12px' }}>
        How long the platform keeps each data class after deletion.
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
                  options={RETENTION_PERIODS}
                  label={`${r.label} retention`}
                  disabled={!can('governance.manage')}
                  style={{ width: 'auto', padding: '6px 9px', fontSize: 12.5, fontWeight: 600, borderRadius: 7 }}
                  onChange={(period) =>
                    save.mutate(
                      { key: r.key, period },
                      { onSuccess: () => toast(`${r.label} kept for ${period} — purge jobs pick this up tonight`) },
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
  const summary = useComplianceSummary();
  const s = summary.data;
  const nearest = s?.nearestDueAt ? daysUntil(s.nearestDueAt) : null;

  return (
    <Screen max={1150} label="Compliance and privacy">
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : s ? (
        <KpiRow
          items={[
            { label: 'Open DSARs', value: String(s.openDsars), sub: s.overdueDsars ? `${s.overdueDsars} overdue` : 'None overdue' },
            {
              label: 'Nearest deadline',
              value: (
                <span style={{ color: nearest != null && nearest <= 0 ? 'var(--rFg)' : undefined }}>
                  {nearest == null ? '—' : dueLabel(nearest, true)}
                </span>
              ),
              sub: s.nearestDueAt ? formatDate(s.nearestDueAt) : 'Nothing pending',
            },
            { label: 'Sub-processors', value: String(s.subProcessors), sub: 'Listed in the DPA' },
            { label: 'DPAs signed', value: `${s.dpasSigned} / ${s.tenants}`, sub: 'On the live DPA version' },
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
