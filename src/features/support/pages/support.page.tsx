import { useEffect, useState } from 'react';
import { Chip, ErrorState, KpiRow, Screen, Skeleton, SkeletonRows } from '@/components/ui';
import { num, shortDuration, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { useSupportSummary, useTicket, useTickets } from '../api';
import { Conversation } from '../components/Conversation';
import { TenantPanel } from '../components/TenantPanel';
import { TicketList } from '../components/TicketList';
import { TICKET_VIEWS, VIEW_LABELS, type TicketListParams, type TicketView } from '../types';

const DEFAULTS = { view: 'open', q: '', ticket: '', page: '1' };

function DetailSkeleton() {
  return (
    <>
      <div className="card" style={{ flex: '2.2 1 440px', minWidth: 0, minHeight: 560 }}>
        <Skeleton h={18} w="55%" />
        <Skeleton h={12} w="35%" style={{ marginTop: 8 }} />
        <SkeletonRows rows={4} h={36} />
      </div>
      <div className="card" style={{ flex: '1 1 260px', minWidth: 0 }}>
        <SkeletonRows rows={5} />
      </div>
    </>
  );
}

export default function SupportPage() {
  const [f, setF] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(f.q);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
  }, [debounced, f.q, setF]);

  const view = (TICKET_VIEWS as readonly string[]).includes(f.view) ? (f.view as TicketView) : 'open';
  const params: TicketListParams = {
    page: Number(f.page) || 1,
    perPage: 25,
    view,
    ...(f.q ? { search: f.q } : {}),
  };
  const list = useTickets(params);
  const summary = useSupportSummary();
  // Deep links (`?ticket=`) win; otherwise the first ticket in the current view is shown.
  const selectedId = f.ticket || list.data?.data[0]?.id;
  const detail = useTicket(selectedId);

  const s = summary.data;
  const kpis = s
    ? [
        { label: 'Open tickets', value: num(s.open), sub: `${num(s.unanswered)} still unanswered` },
        {
          label: 'Breaching SLA',
          value: num(s.breaching),
          sub: s.oldestBreachAt ? `Oldest opened ${timeAgo(s.oldestBreachAt)}` : 'All within target',
        },
        {
          label: 'First response',
          value: s.medianFirstReplyMinutes != null ? shortDuration(s.medianFirstReplyMinutes) : '—',
          sub: 'Median · target 60m on High',
        },
        {
          label: 'CSAT',
          value: s.csat ? `${s.csat.score} / 5` : '—',
          sub: s.csat ? `${num(s.csat.responses)} survey responses` : 'No responses yet',
        },
      ]
    : null;

  return (
    <Screen max={1400} gap={14} label="Support">
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : kpis ? (
        <KpiRow items={kpis} />
      ) : (
        <div className="grid-kpi" style={{ gap: 12 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card card--tight">
              <Skeleton h={12} w="40%" />
              <Skeleton h={24} w="60%" style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      )}

      <div className="hstack wrap">
        <div className="hstack wrap" style={{ gap: 6 }} role="group" aria-label="Inbox views">
          {TICKET_VIEWS.map((v) => (
            <Chip key={v} size="sm" on={view === v} onClick={() => setF({ view: v, ticket: '' })}>
              {VIEW_LABELS[v]}
              {s ? ` · ${s.views.find((x) => x.view === v)?.count ?? 0}` : ''}
            </Chip>
          ))}
        </div>
        <div className="spacer" style={{ minWidth: 8 }} />
        <input
          className="input"
          type="search"
          style={{ width: 260, maxWidth: '100%', fontSize: 12.5, padding: '8px 11px' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenant, subject or contact…"
          aria-label="Search tickets"
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <TicketList
          query={list}
          selectedId={selectedId}
          onSelect={(ticket) => setF({ ticket, page: f.page })}
          onPage={(page) => setF({ page: String(page), ticket: '' })}
          onClear={() => {
            setSearch('');
            setF({ view: 'open', q: '', ticket: '' });
          }}
        />
        {detail.error ? (
          <div style={{ flex: '3.2 1 440px', minWidth: 0 }}>
            <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
          </div>
        ) : detail.data ? (
          <>
            <Conversation key={detail.data.id} ticket={detail.data} />
            <TenantPanel ticket={detail.data} />
          </>
        ) : selectedId || list.isPending ? (
          <DetailSkeleton />
        ) : (
          <div className="card empty" style={{ flex: '3.2 1 440px', minWidth: 0 }}>
            Select a ticket to read the conversation.
          </div>
        )}
      </div>
    </Screen>
  );
}
