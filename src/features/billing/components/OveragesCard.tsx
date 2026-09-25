import { Link } from 'react-router-dom';
import { Badge, Card, Empty, ErrorState, SkeletonRows } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { money } from '@/lib/format';
import { toast } from '@/store/ui';
import { useBillOverage, useOverages } from '../api';
import { monthName } from '../format';
import type { Overage } from '../types';

const COLS = 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.3fr) minmax(0,0.9fr) minmax(0,0.6fr) minmax(0,1fr)';
const MIN = 720;

export function OveragesCard() {
  const can = useCan();
  const canManage = can('billing.manage');
  const list = useOverages();
  const bill = useBillOverage();
  const d = list.data;

  const addToInvoice = (o: Overage) =>
    bill.mutate(o.id, { onSuccess: () => toast(`${money(o.amount)} overage added to ${o.tenantName}’s next invoice`) });

  return (
    <Card
      title={d ? `Metered overages · ${monthName(d.period)}` : 'Metered overages'}
      className="table-scroll"
      right={
        d && (
          <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
            Unbilled: <b style={{ color: 'var(--tx)' }}>{money(d.unbilledTotal)}</b>
          </span>
        )
      }
    >
      {list.isPending ? (
        <SkeletonRows rows={4} h={20} />
      ) : list.error ? (
        <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        <Empty>No usage above plan limits this month.</Empty>
      ) : (
        <div role="table" aria-label="Metered overages">
          <div role="row" className="trow trow--head" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '9px 0' }}>
            <div role="columnheader">Tenant</div>
            <div role="columnheader">Meter</div>
            <div role="columnheader">Usage</div>
            <div role="columnheader">Rate</div>
            <div role="columnheader">Amount</div>
            <div role="columnheader" className="sr-only">
              Billing
            </div>
          </div>
          {list.data.items.map((o) => (
            <div
              key={o.id}
              role="row"
              className="trow"
              style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '11px 0', fontSize: 12.5 }}
            >
              <div role="cell" className="ellipsis" style={{ fontWeight: 600 }}>
                {o.tenantName}
              </div>
              <div role="cell">{o.meter}</div>
              <div role="cell" className="muted">
                {o.usage}
              </div>
              <div role="cell" className="muted">
                {o.rate}
              </div>
              <div role="cell" style={{ fontWeight: 700 }}>
                {money(o.amount)}
              </div>
              <div role="cell" style={{ textAlign: 'right' }}>
                {o.billedAt ? (
                  <Badge tone="good">Queued</Badge>
                ) : canManage ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--outline-accent"
                    disabled={bill.isPending && bill.variables === o.id}
                    onClick={() => addToInvoice(o)}
                    aria-label={`Add ${o.tenantName} ${o.meter.toLowerCase()} overage to invoice`}
                  >
                    Add to invoice
                  </button>
                ) : (
                  <Badge tone="warn">Unbilled</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
        Overage meters reset on the 1st. Rates are set in{' '}
        <Link className="link" style={{ fontSize: 11.5 }} to={pathOf('plans')}>
          Plans &amp; pricing → Add-ons
        </Link>
        .
      </div>
    </Card>
  );
}
