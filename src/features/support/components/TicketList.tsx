import { Badge, Dot, Empty, ErrorState, Pagination, SkeletonRows } from '@/components/ui';
import type { Paginated } from '@/lib/api/types';
import { timeAgo } from '@/lib/format';
import type { UseQueryResult } from '@tanstack/react-query';
import { priorityTone, slaFg, slaLabel, slaTone, statusTone } from '../sla';
import type { Ticket } from '../types';

interface Props {
  query: UseQueryResult<Paginated<Ticket>>;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  onClear: () => void;
}

export function TicketList({ query, selectedId, onSelect, onPage, onClear }: Props) {
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const rows = query.data?.data ?? [];
  return (
    <section
      className="card card--flush"
      aria-label="Tickets"
      aria-busy={query.isFetching}
      style={{ flex: '1 1 280px', minWidth: 0, padding: 0 }}
    >
      {query.isPending ? (
        <div style={{ padding: 16 }}>
          <SkeletonRows rows={5} h={40} />
        </div>
      ) : rows.length === 0 ? (
        <Empty
          action={
            <button type="button" className="btn btn--sm" onClick={onClear}>
              Show all open tickets
            </button>
          }
        >
          Nothing in this view.
        </Empty>
      ) : (
        <ul className="plain-list">
          {rows.map((tk) => {
            const on = tk.id === selectedId;
            const tone = slaTone(tk.slaState);
            return (
              <li key={tk.id}>
                <button
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => onSelect(tk.id)}
                  className="row--click"
                  style={{
                    display: 'flex',
                    width: '100%',
                    textAlign: 'left',
                    gap: 11,
                    padding: '13px 16px 13px 13px',
                    border: 'none',
                    borderBottom: '1px solid var(--bd2)',
                    borderLeft: `3px solid ${on ? 'var(--ac)' : 'transparent'}`,
                    background: on ? 'var(--acT)' : 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <span className="min0" style={{ flex: 1, display: 'block' }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span className="ellipsis" style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>
                        {tk.subject}
                      </span>
                      <span className="faint nowrap" style={{ fontSize: 11 }}>
                        {timeAgo(tk.createdAt)}
                      </span>
                    </span>
                    <span className="ellipsis" style={{ display: 'block', fontSize: 12.5, color: 'var(--tx2)', marginTop: 2 }}>
                      #{tk.number} · {tk.tenant.name} · {tk.requesterName} · {tk.tenant.plan}
                    </span>
                    <span className="hstack wrap" style={{ gap: 6, marginTop: 6 }}>
                      <Badge tone={priorityTone(tk.priority)} pill xs>
                        {tk.priority}
                      </Badge>
                      <Badge tone={statusTone(tk.status)} pill xs>
                        {tk.status}
                      </Badge>
                      {tk.escalated && (
                        <Badge tone="bad" pill xs>
                          Escalated
                        </Badge>
                      )}
                      <Dot tone={tone} size={6} />
                      <span className="nowrap" style={{ fontSize: 11, fontWeight: 600, color: slaFg(tone) }}>
                        {slaLabel(tk)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {query.data && query.data.meta.lastPage > 1 && <Pagination meta={query.data.meta} noun="tickets" onPage={onPage} />}
    </section>
  );
}
