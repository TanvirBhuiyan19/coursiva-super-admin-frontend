import { useEffect, useRef } from 'react';
import { Badge, Card, Empty, ErrorState, Pagination, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { cx } from '@/lib/cx';
import { formatDate, money } from '@/lib/format';
import { toast } from '@/store/ui';
import { useInvoices, useSettleInvoice } from '../api';
import type { Invoice, InvoiceListParams } from '../types';

const COLS = 'minmax(0,1.8fr) minmax(0,0.8fr) minmax(0,0.7fr) minmax(0,0.8fr) minmax(0,1.1fr)';
const MIN = 460;
const PER_PAGE = 10;

const STATUS_TONE = { Paid: 'good', 'Past due': 'bad', Waived: 'flat' } as const;

interface Props {
  /** Invoice id from a deep link (`/revenue?invoice=…`): its page is loaded and the row highlighted. */
  focusId: string;
  page: number | null;
  onPage: (p: number) => void;
  style?: React.CSSProperties;
}

export function InvoicesCard({ focusId, page, onPage, style }: Props) {
  const can = useCan();
  const canManage = can('billing.manage');
  const params: InvoiceListParams = { perPage: PER_PAGE, ...(page ? { page } : focusId ? { focus: focusId } : {}) };
  const list = useInvoices(params);
  const settle = useSettleInvoice();
  const focusRef = useRef<HTMLDivElement>(null);
  const rows = list.data?.data ?? [];
  const focusVisible = rows.some((v) => v.id === focusId);

  useEffect(() => {
    const el = focusRef.current;
    if (!focusVisible || !el) return;
    if ('scrollIntoView' in el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }, [focusVisible, focusId]);

  const retry = (v: Invoice) =>
    settle.mutate(
      { id: v.id, action: 'retry' },
      { onSuccess: () => toast(`Charge retried — ${money(v.amount)} collected from ${v.tenantName}`) },
    );

  return (
    <Card title="Latest invoices" className="table-scroll" style={style}>
      {list.error ? (
        <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div role="table" aria-label="Latest invoices" aria-busy={list.isFetching}>
          <div role="row" className="trow trow--head" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '9px 0' }}>
            <div role="columnheader">Tenant</div>
            <div role="columnheader">Plan</div>
            <div role="columnheader">Amount</div>
            <div role="columnheader">Date</div>
            <div role="columnheader">Status</div>
          </div>
          {list.isPending && <SkeletonRows rows={6} h={20} />}
          {rows.map((v) => {
            const focused = v.id === focusId;
            const pending = settle.isPending && settle.variables.id === v.id;
            return (
              <div
                key={v.id}
                id={`invoice-${v.id}`}
                ref={focused ? focusRef : undefined}
                tabIndex={focused ? -1 : undefined}
                role="row"
                aria-current={focused ? 'true' : undefined}
                className={cx('trow', focused && 'is-selected')}
                style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '11px 0' }}
              >
                <div role="cell" className="min0">
                  <div className="ellipsis" style={{ fontWeight: 600 }}>
                    {v.tenantName}
                  </div>
                  <div className="mono faint ellipsis" style={{ fontSize: 10.5 }}>
                    {v.number}
                  </div>
                </div>
                <div role="cell" className="muted">
                  {v.plan}
                </div>
                <div role="cell" style={{ fontWeight: 700 }}>
                  {money(v.amount)}
                </div>
                <div role="cell" className="muted nowrap">
                  {formatDate(v.issuedAt)}
                </div>
                <div role="cell">
                  {v.status === 'Past due' && canManage ? (
                    <button
                      type="button"
                      className="btn btn--sm btn--danger-solid"
                      disabled={pending}
                      onClick={() => retry(v)}
                      aria-label={`Retry charge for ${v.tenantName}`}
                    >
                      {pending ? 'Retrying…' : 'Retry charge'}
                    </button>
                  ) : (
                    <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge>
                  )}
                </div>
              </div>
            );
          })}
          {list.isSuccess && rows.length === 0 && <Empty>No invoices issued yet.</Empty>}
        </div>
      )}
      {list.data && list.data.meta.lastPage > 1 && <Pagination meta={list.data.meta} noun="invoices" onPage={onPage} />}
    </Card>
  );
}
