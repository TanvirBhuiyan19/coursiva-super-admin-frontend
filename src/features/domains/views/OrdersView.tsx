import { Link } from 'react-router-dom';
import { ChipGroup, Empty, ErrorState, Pagination, SkeletonRows, TRow } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUrlState } from '@/lib/useUrlState';
import { useDomainOrders } from '../api';
import { OrderStatusBadge, TenantFilterButton, TenantFilterChip } from '../components/shared';
import { usd } from '../format';
import { useT } from '../i18n';
import { DOMAIN_ORDER_KINDS, DOMAIN_ORDER_STATUSES, type DomainOrderKind, type OrderListParams, type OrderStatusFilter } from '../types';

const COLS =
  'minmax(0,1.5fr) minmax(0,1.1fr) minmax(0,0.75fr) minmax(0,1.3fr) minmax(0,0.6fr) minmax(0,0.6fr) minmax(0,0.6fr) minmax(0,0.8fr) minmax(0,0.75fr)';
const MIN = 1020;
const DEFAULTS = { status: 'all', kind: 'all', tenant: '', page: '1' };
/** Problems first: the filters operators reach for. */
const STATUS_FILTERS: readonly OrderStatusFilter[] = [
  'problem',
  'failed',
  'refunded',
  'credited',
  ...DOMAIN_ORDER_STATUSES.filter((s) => !['failed', 'refunded', 'credited'].includes(s)),
];

export default function OrdersView() {
  const t = useT();
  const tc = useCommonT();
  const [f, setF] = useUrlState(DEFAULTS);
  const status = STATUS_FILTERS.find((s) => s === f.status) ?? null;
  const kind = (DOMAIN_ORDER_KINDS as readonly string[]).includes(f.kind) ? (f.kind as DomainOrderKind) : null;
  const params: OrderListParams = {
    page: Number(f.page) || 1,
    perPage: 25,
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
    ...(f.tenant ? { tenantId: f.tenant } : {}),
  };
  const list = useDomainOrders(params);
  const rows = list.data?.data ?? [];
  const tenantName = rows.find((r) => r.tenantId === f.tenant)?.tenantName ?? f.tenant;

  return (
    <>
      <ChipGroup
        size="sm"
        label={t('orders.statusLabel')}
        options={[['all', t('all')] as const, ...STATUS_FILTERS.map((s) => [s, t(`orderStatus.${s}`)] as const)]}
        value={status ?? 'all'}
        onChange={(v) => setF({ status: v })}
      />
      <div className="hstack wrap">
        <ChipGroup
          size="sm"
          label={t('orders.kindLabel')}
          options={[['all', t('all')] as const, ...DOMAIN_ORDER_KINDS.map((k) => [k, t(`orderKind.${k}`)] as const)]}
          value={kind ?? 'all'}
          onChange={(v) => setF({ kind: v })}
        />
        {f.tenant && <TenantFilterChip name={tenantName} onClear={() => setF({ tenant: '' })} />}
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="card table-scroll" aria-busy={list.isFetching}>
          <div role="table" aria-label={t('orders.tableLabel')} aria-rowcount={list.data?.meta.total}>
            <TRow cols={COLS} min={MIN} head>
              <div role="columnheader">{t('orders.domain')}</div>
              <div role="columnheader">{t('orders.tenant')}</div>
              <div role="columnheader">{t('orders.kind')}</div>
              <div role="columnheader">{t('orders.status')}</div>
              <div role="columnheader">{t('orders.price')}</div>
              <div role="columnheader">{t('orders.cost')}</div>
              <div role="columnheader">{t('orders.margin')}</div>
              <div role="columnheader">{t('orders.invoice')}</div>
              <div role="columnheader">{t('orders.created')}</div>
            </TRow>
            {list.isPending && <SkeletonRows rows={8} h={22} />}
            {rows.map((o) => (
              <TRow key={o.id} cols={COLS} min={MIN}>
                <div role="cell" className="min0">
                  {o.registrationId ? (
                    <Link to={`/domains/${o.registrationId}`} className="row-link ellipsis">
                      {o.domain}
                    </Link>
                  ) : (
                    <span className="ellipsis" style={{ fontWeight: 600 }}>
                      {o.domain}
                    </span>
                  )}
                </div>
                <div role="cell" className="min0">
                  <TenantFilterButton id={o.tenantId} name={o.tenantName} onFilter={(id) => setF({ tenant: id })} />
                </div>
                <div role="cell">{t(`orderKind.${o.kind}`)}</div>
                <div role="cell" className="min0">
                  <OrderStatusBadge status={o.status} />
                  {o.failureReason && (
                    <div className="t-xs muted" style={{ marginTop: 3, lineHeight: 1.4 }}>
                      {o.failureReason}
                    </div>
                  )}
                </div>
                <div role="cell" style={{ fontWeight: 600 }}>
                  {usd(o.price)}
                </div>
                <div role="cell" className="muted">
                  {usd(o.cost)}
                </div>
                <div role="cell" className="fg-good">
                  {usd(Math.round((o.price - o.cost) * 100) / 100)}
                </div>
                <div role="cell" className="mono t-xs">
                  {o.invoiceNumber ?? '—'}
                </div>
                <div role="cell" className="muted nowrap">
                  {formatDate(o.createdAt)}
                </div>
              </TRow>
            ))}
            {list.isSuccess && rows.length === 0 && (
              <Empty
                action={
                  <button type="button" className="btn btn--sm" onClick={() => setF({ status: 'all', kind: 'all', tenant: '' })}>
                    {tc('actions.clearFilters')}
                  </button>
                }
              >
                {t('orders.empty')}
              </Empty>
            )}
          </div>
          {list.data && <Pagination meta={list.data.meta} noun={t('orders.noun')} onPage={(p) => setF({ page: String(p) })} />}
        </div>
      )}
    </>
  );
}
