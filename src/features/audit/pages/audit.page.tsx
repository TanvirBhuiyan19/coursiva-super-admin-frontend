import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ChipGroup, Empty, ErrorState, Pagination, Screen, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/api/client';
import { AUDIT_CATEGORIES, type AuditCategory, type Tone } from '@/lib/domain';
import { formatDateTime, num, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useAuditLog } from '../api';
import type { AuditParams } from '../types';

const CATEGORY_TONE: Record<AuditCategory, Tone> = { Auth: 'info', Billing: 'warn', Tenants: 'good', Flags: 'flat', Security: 'bad' };

export default function AuditPage() {
  const [f, setF] = useUrlState({ q: '', category: 'All', page: '1' });
  const [search, setSearch] = useState(f.q);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
  }, [debounced, f.q, setF]);

  const params: AuditParams = {
    page: Number(f.page) || 1,
    perPage: 25,
    ...(f.q ? { search: f.q } : {}),
    ...(f.category !== 'All' ? { category: f.category as AuditCategory } : {}),
  };
  const log = useAuditLog(params);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { page: _p, perPage: _pp, ...filters } = params;
      await api.download('/audit/export', { ...filters }, 'audit-log.csv');
      toast(`${num(log.data?.meta.total ?? 0)} audit entries exported`);
    } catch {
      toast('Export failed — try again', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen max={1050} label="Audit log">
      <div className="hstack wrap">
        <input
          className="input"
          type="search"
          style={{ width: 260 }}
          placeholder="Search actor or action…"
          aria-label="Search audit log"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ChipGroup
          label="Filter by category"
          options={['All', ...AUDIT_CATEGORIES]}
          value={f.category}
          onChange={(category) => setF({ category })}
        />
        <div className="spacer" />
        <button type="button" className="btn" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {log.error ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : (
        <section className="card" aria-label="Audit entries" aria-busy={log.isFetching}>
          {log.isPending ? (
            <SkeletonRows rows={10} h={22} />
          ) : log.data.data.length === 0 ? (
            <Empty>No events match these filters.</Empty>
          ) : (
            <ol className="stack plain-list">
              {log.data.data.map((a) => (
                <li key={a.id} className="row wrap" style={{ gap: 12 }}>
                  <time
                    dateTime={a.createdAt}
                    title={formatDateTime(a.createdAt)}
                    className="t-xs faint nowrap"
                    style={{ width: 72, flexShrink: 0 }}
                  >
                    {timeAgo(a.createdAt)}
                  </time>
                  <span style={{ fontWeight: 600, width: 120, flexShrink: 0 }} className="ellipsis">
                    {a.actorName}
                  </span>
                  <span style={{ flex: 1, minWidth: 200 }}>
                    {a.action}
                    {a.tenantId && (
                      <>
                        {' '}
                        <Link className="link" style={{ fontSize: 11.5 }} to={`/tenants/${a.tenantId}`}>
                          View tenant
                        </Link>
                      </>
                    )}
                  </span>
                  {a.ip && <span className="mono t-xs faint">{a.ip}</span>}
                  <Badge tone={CATEGORY_TONE[a.category]}>{a.category}</Badge>
                </li>
              ))}
            </ol>
          )}
          {log.data && <Pagination meta={log.data.meta} noun="entries" onPage={(p) => setF({ page: String(p) })} />}
        </section>
      )}
    </Screen>
  );
}
