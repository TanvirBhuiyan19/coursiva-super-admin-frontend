import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Chip, Empty, ErrorState, Pagination, Select, SkeletonRows, TRow } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { warm } from '@/lib/queryClient';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { domainQueries, useRegistrations } from '../api';
import { RegistrationDrawer } from '../components/RegistrationDrawer';
import { ExpiryDistance, RegistrationStatusBadge, TenantFilterButton, TenantFilterChip } from '../components/shared';
import { usd } from '../format';
import { useT } from '../i18n';
import { REGISTRATION_STATUSES, type RegistrationListParams, type RegistrationStatus } from '../types';

const COLS = 'minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,0.9fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.8fr) minmax(0,0.6fr)';
const MIN = 940;
const DEFAULTS = { q: '', status: 'all', tenant: '', expiring: '', page: '1' };
const EXPIRING = ['30', '60', '90'] as const;

export default function RegistrationsView() {
  const t = useT();
  const tc = useCommonT();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [f, setF] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(f.q);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
  }, [debounced, f.q, setF]);

  const status = (REGISTRATION_STATUSES as readonly string[]).includes(f.status) ? (f.status as RegistrationStatus) : null;
  const expiring = Number(f.expiring) || null;
  const params: RegistrationListParams = {
    page: Number(f.page) || 1,
    perPage: 25,
    ...(status ? { status } : {}),
    ...(f.tenant ? { tenantId: f.tenant } : {}),
    ...(expiring ? { expiringWithinDays: expiring } : {}),
    ...(f.q ? { search: f.q } : {}),
  };
  const list = useRegistrations(params);
  const rows = list.data?.data ?? [];
  const counts = list.data?.meta.counts;
  const total = counts?.reduce((s, c) => s + c.count, 0);
  const tenantName = rows.find((r) => r.tenantId === f.tenant)?.tenantName ?? f.tenant;

  const open = (id: string) => void navigate({ pathname: `/domains/${id}`, search: location.search });
  const warmDetail = (id: string) => warm(qc.query(domainQueries.registration(id)));
  const clear = () => {
    setSearch('');
    setF({ q: '', status: 'all', tenant: '', expiring: '' });
  };

  return (
    <>
      <div className="hstack wrap" style={{ gap: 6 }} role="group" aria-label={t('registrations.statusLabel')}>
        <Chip size="sm" on={!status} onClick={() => setF({ status: 'all' })}>
          {total != null ? t('withCount', { label: t('all'), count: total }) : t('all')}
        </Chip>
        {REGISTRATION_STATUSES.map((s) => {
          const count = counts?.find((c) => c.status === s)?.count;
          return (
            <Chip key={s} size="sm" on={status === s} onClick={() => setF({ status: s })}>
              {count != null ? t('withCount', { label: t(`registrationStatus.${s}`), count }) : t(`registrationStatus.${s}`)}
            </Chip>
          );
        })}
      </div>

      <div className="hstack wrap">
        <input
          className="input"
          type="search"
          style={{ width: 260, maxWidth: '100%' }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('registrations.searchPlaceholder')}
          aria-label={t('registrations.searchLabel')}
        />
        <Select
          label={t('registrations.expiringLabel')}
          value={EXPIRING.find((d) => d === f.expiring) ?? ''}
          onChange={(v) => setF({ expiring: v })}
          options={[
            ['', t('registrations.expiringAny')] as const,
            ...EXPIRING.map((d) => [d, t('registrations.expiringWithin', { days: d })] as const),
          ]}
        />
        {f.tenant && <TenantFilterChip name={tenantName} onClear={() => setF({ tenant: '' })} />}
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="card table-scroll" aria-busy={list.isFetching}>
          <div role="table" aria-label={t('registrations.tableLabel')} aria-rowcount={list.data?.meta.total}>
            <TRow cols={COLS} min={MIN} head>
              <div role="columnheader">{t('registrations.domain')}</div>
              <div role="columnheader">{t('registrations.tenant')}</div>
              <div role="columnheader">{t('registrations.status')}</div>
              <div role="columnheader">{t('registrations.expires')}</div>
              <div role="columnheader">{t('registrations.autoRenew')}</div>
              <div role="columnheader">{t('registrations.renewal')}</div>
              <div role="columnheader">{t('registrations.tasks')}</div>
            </TRow>
            {list.isPending && <SkeletonRows rows={8} h={22} />}
            {rows.map((r) => {
              const mismatch = r.providerAutoRenew != null && r.providerAutoRenew !== r.autoRenew;
              return (
                // Row click is a mouse shortcut; the domain link is the keyboard/AT target.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                <div
                  key={r.id}
                  role="row"
                  className="trow trow--click"
                  style={{ gridTemplateColumns: COLS, minWidth: MIN }}
                  onClick={() => open(r.id)}
                  onMouseEnter={() => warmDetail(r.id)}
                  onFocus={() => warmDetail(r.id)}
                >
                  <div role="cell" className="min0">
                    <a
                      href={`/domains/${r.id}`}
                      className="row-link ellipsis"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        open(r.id);
                      }}
                    >
                      {r.domain}
                    </a>
                    {r.environment === 'sandbox' && (
                      <>
                        {' '}
                        <Badge tone="warn" pill xs>
                          {t('sandbox.badge')}
                        </Badge>
                      </>
                    )}
                    <div className="t-xs muted ellipsis">
                      {r.provider === 'fake' ? t('registrations.providerFake') : t('registrations.providerCloudflare')}
                      {!r.customDomain && ` · ${t('registrations.notConnected')}`}
                      {r.contactPending && ` · ${t('registrations.contactPending')}`}
                    </div>
                  </div>
                  <div role="cell" className="min0">
                    <TenantFilterButton id={r.tenantId} name={r.tenantName} onFilter={(id) => setF({ tenant: id })} />
                  </div>
                  <div role="cell">
                    <RegistrationStatusBadge status={r.status} />
                  </div>
                  <div role="cell" className="min0">
                    {r.expiresAt ? (
                      <>
                        <div className="nowrap">{formatDate(r.expiresAt)}</div>
                        <div className="t-xs">
                          <ExpiryDistance days={r.daysUntilExpiry} />
                        </div>
                      </>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </div>
                  <div role="cell" className="min0">
                    <div>{r.autoRenew ? t('autoRenew.on') : t('autoRenew.off')}</div>
                    {mismatch && (
                      <div className="t-xs fg-warn">
                        {t('autoRenew.mismatch', { state: r.providerAutoRenew ? t('autoRenew.on') : t('autoRenew.off') })}
                      </div>
                    )}
                  </div>
                  <div role="cell" className="min0">
                    {r.renewalPrice != null ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{usd(r.renewalPrice)}</div>
                        {r.renewalCost != null && <div className="t-xs muted">{usd(r.renewalCost)}</div>}
                      </>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </div>
                  <div role="cell">
                    {r.openTasks > 0 ? (
                      <Badge tone="warn" pill xs>
                        {t('registrations.openTasks', { count: r.openTasks })}
                      </Badge>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </div>
                </div>
              );
            })}
            {list.isSuccess && rows.length === 0 && (
              <Empty
                action={
                  <button type="button" className="btn btn--sm" onClick={clear}>
                    {tc('actions.clearFilters')}
                  </button>
                }
              >
                {t('registrations.empty')}
              </Empty>
            )}
          </div>
          {list.data && <Pagination meta={list.data.meta} noun={t('registrations.noun')} onPage={(p) => setF({ page: String(p) })} />}
        </div>
      )}

      <Routes>
        <Route
          path=":registrationId"
          element={<RegistrationDrawer onClose={() => void navigate({ pathname: '/domains', search: location.search })} />}
        />
      </Routes>
    </>
  );
}
