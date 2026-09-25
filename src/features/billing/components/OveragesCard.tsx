import { Link } from 'react-router-dom';
import { Badge, Card, Empty, ErrorState, SkeletonRows } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { money, monthName } from '@/lib/format';
import { toast } from '@/store/ui';
import { useBillOverage, useOverages } from '../api';
import { useT } from '../i18n';
import type { Overage } from '../types';

const COLS = 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.3fr) minmax(0,0.9fr) minmax(0,0.6fr) minmax(0,1fr)';
const MIN = 720;

export function OveragesCard() {
  const t = useT();
  const can = useCan();
  const canManage = can('billing.manage');
  const list = useOverages();
  const bill = useBillOverage();
  const d = list.data;

  const addToInvoice = (o: Overage) =>
    bill.mutate(o.id, { onSuccess: () => toast(t('overages.toasts.added', { amount: money(o.amount), tenant: o.tenantName })) });

  return (
    <Card
      title={d ? t('overages.titlePeriod', { month: monthName(d.period, 'long') }) : t('overages.title')}
      className="table-scroll"
      right={
        d && (
          <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
            {t('overages.unbilledTotal')} <b style={{ color: 'var(--tx)' }}>{money(d.unbilledTotal)}</b>
          </span>
        )
      }
    >
      {list.isPending ? (
        <SkeletonRows rows={4} h={20} />
      ) : list.error ? (
        <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        <Empty>{t('overages.empty')}</Empty>
      ) : (
        <div role="table" aria-label={t('overages.title')}>
          <div role="row" className="trow trow--head" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '9px 0' }}>
            <div role="columnheader">{t('columns.tenant')}</div>
            <div role="columnheader">{t('columns.meter')}</div>
            <div role="columnheader">{t('columns.usage')}</div>
            <div role="columnheader">{t('columns.rate')}</div>
            <div role="columnheader">{t('columns.amount')}</div>
            <div role="columnheader" className="sr-only">
              {t('columns.billing')}
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
                  <Badge tone="good">{t('overages.queued')}</Badge>
                ) : canManage ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--outline-accent"
                    disabled={bill.isPending && bill.variables === o.id}
                    onClick={() => addToInvoice(o)}
                    aria-label={t('overages.addToInvoiceFor', { tenant: o.tenantName, meter: o.meter.toLowerCase() })}
                  >
                    {t('overages.addToInvoice')}
                  </button>
                ) : (
                  <Badge tone="warn">{t('overages.unbilled')}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
        {t('overages.footer')}{' '}
        <Link className="link" style={{ fontSize: 11.5 }} to={pathOf('plans')}>
          {t('overages.footerLink')}
        </Link>
        .
      </div>
    </Card>
  );
}
