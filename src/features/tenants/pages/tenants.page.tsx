import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Bar, Chip, ChipGroup, Empty, ErrorState, Pagination, Screen, Skeleton, SkeletonRows, TRow } from '@/components/ui';
import { Can } from '@/features/auth/Can';
import { useCan } from '@/features/auth/useCan';
import { api } from '@/lib/api/client';
import { PLANS, TENANT_STATUSES, type Plan, type TenantStatus } from '@/lib/domain';
import { avatarColor, healthTone, initials, money, num, statusTone, timeAgo, toneFg, utilTone } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { warm } from '@/lib/queryClient';
import { tenantQueries, useBulkTenants, useTenantSummary, useTenants } from '../api';
import { EmailComposer } from '../components/EmailComposer';
import { TenantDrawer } from '../components/TenantDrawer';
import { useT } from '../i18n';
import { TENANT_SEGMENTS, type TenantListParams, type TenantSegment, type TenantSort } from '../types';

const COLS =
  '24px minmax(0,1.9fr) minmax(0,1.2fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.7fr) minmax(0,0.9fr) minmax(0,0.85fr) minmax(0,0.8fr) minmax(0,0.8fr)';
const PER_PAGE = 25;

const DEFAULTS = { q: '', segment: 'all', plan: 'all', status: 'all', sort: '', page: '1' };

function SortHeader({
  field,
  sort,
  onSort,
  children,
}: {
  field: 'students' | 'mrr';
  sort: string;
  onSort: (s: TenantSort | '') => void;
  children: string;
}) {
  const dir = sort === field ? 'ascending' : sort === '-' + field ? 'descending' : 'none';
  const next: TenantSort | '' = dir === 'descending' ? field : dir === 'ascending' ? '' : `-${field}`;
  return (
    <div role="columnheader" aria-sort={dir}>
      <button type="button" className="th-sort" onClick={() => onSort(next)}>
        {children}
        <span aria-hidden="true">{dir === 'descending' ? ' ↓' : dir === 'ascending' ? ' ↑' : ''}</span>
      </button>
    </div>
  );
}

export default function TenantsPage() {
  const t = useT();
  const tc = useCommonT();
  const navigate = useNavigate();
  const location = useLocation();
  const can = useCan();
  const [f, setF] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(f.q);
  const debounced = useDebounced(search, 300);
  const [selected, setSelected] = useState<string[]>([]);
  const [emailTo, setEmailTo] = useState<string[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const bulk = useBulkTenants();

  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
  }, [debounced, f.q, setF]);

  const params: TenantListParams = {
    page: Number(f.page) || 1,
    perPage: PER_PAGE,
    ...(f.q ? { search: f.q } : {}),
    ...(f.segment !== 'all' ? { segment: f.segment as TenantSegment } : {}),
    ...(f.plan !== 'all' ? { plan: f.plan as Plan } : {}),
    ...(f.status !== 'all' ? { status: f.status as TenantStatus } : {}),
    ...(f.sort ? { sort: f.sort as TenantSort } : {}),
  };
  const list = useTenants(params);
  const summary = useTenantSummary();
  const rows = list.data?.data ?? [];
  const allSel = rows.length > 0 && rows.every((tn) => selected.includes(tn.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const openTenant = (id: string) => void navigate({ pathname: `/tenants/${id}`, search: location.search });
  const qc = useQueryClient();
  // Hovering a row warms its drawer so it opens with data already in cache.
  const warmTenant = (id: string) => warm(qc.query(tenantQueries.detail(id)));

  const runBulk = (action: 'suspend' | 'watch' | 'export') =>
    bulk.mutate(
      { action, ids: selected },
      {
        onSuccess: ({ affected }) => {
          toast(
            action === 'suspend'
              ? t('toasts.suspended', { count: affected })
              : action === 'watch'
                ? t('toasts.addedToWatchlist')
                : t('toasts.exported', { count: affected }),
          );
          setSelected([]);
        },
      },
    );

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { page: _p, perPage: _pp, ...filters } = params;
      await api.download('/tenants/export', { ...filters }, 'tenants.csv');
      toast(t('toasts.exported', { count: list.data?.meta.total ?? 0 }));
    } catch {
      toast(t('toasts.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const s = summary.data;
  const portfolio = s
    ? [
        [t('directory.portfolio.tenants'), num(s.total), t('directory.portfolio.tenantsSub', { trials: s.trials, active: s.active })],
        [t('directory.portfolio.mrr'), money(s.mrr), t('directory.portfolio.mrrSub', { amount: money(s.arpa) })],
        [t('directory.portfolio.atRisk'), num(s.atRisk), t('directory.portfolio.atRiskSub', { amount: money(s.atRiskMrr) })],
        [t('directory.portfolio.learners'), num(s.learners), t('directory.portfolio.learnersSub')],
      ]
    : null;

  return (
    <Screen max={1250} label={t('directory.title')}>
      <div className="grid-kpi" style={{ gap: 12 }}>
        {portfolio
          ? portfolio.map(([label, val, sub]) => (
              <div key={label} className="card card--tight">
                <div className="kpi-label">{label}</div>
                <div className="kpi-value kpi-value--sm">{val}</div>
                <div className="kpi-sub" style={{ marginTop: 2 }}>
                  {sub}
                </div>
              </div>
            ))
          : Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="card card--tight">
                <Skeleton h={12} w="40%" />
                <Skeleton h={24} w="60%" style={{ marginTop: 8 }} />
              </div>
            ))}
      </div>

      <div className="hstack wrap" style={{ gap: 6 }} role="group" aria-label={t('directory.segmentsLabel')}>
        {TENANT_SEGMENTS.map((seg) => (
          <Chip key={seg} size="sm" on={f.segment === seg} onClick={() => setF({ segment: seg })}>
            {t(`directory.segments.${seg}`)}
            {s ? ` · ${s.segments.find((x) => x.segment === seg)?.count ?? 0}` : ''}
          </Chip>
        ))}
      </div>

      <div className="hstack wrap">
        <input
          className="input"
          style={{ width: 240 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('directory.searchPlaceholder')}
          aria-label={t('directory.searchLabel')}
          type="search"
        />
        <ChipGroup
          label={t('directory.filterPlan')}
          options={[['all', t('directory.all')] as const, ...PLANS.map((p) => [p, tc(`enums.plan.${p}`)] as const)]}
          value={f.plan}
          onChange={(v) => setF({ plan: v })}
        />
        <span className="divider-v" aria-hidden="true" />
        <ChipGroup
          label={t('directory.filterStatus')}
          options={[['all', t('directory.all')] as const, ...TENANT_STATUSES.map((p) => [p, tc(`enums.tenantStatus.${p}`)] as const)]}
          value={f.status}
          onChange={(v) => setF({ status: v })}
        />
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => void exportCsv()} disabled={exporting}>
          {exporting ? t('directory.exporting') : tc('actions.exportCsv')}
        </button>
      </div>

      {selected.length > 0 && (
        <div className="bulk-bar" role="region" aria-label={t('directory.bulk.label')}>
          <span className="fg-accent" style={{ fontSize: 12.5, fontWeight: 700 }}>
            {t('directory.bulk.selected', { count: selected.length })}
          </span>
          <div className="spacer" />
          <Can permission="tenants.manage">
            <button type="button" className="btn btn--sm" onClick={() => setEmailTo(selected)}>
              {t('directory.bulk.emailOwners')}
            </button>
          </Can>
          <button type="button" className="btn btn--sm" disabled={bulk.isPending} onClick={() => runBulk('watch')}>
            {t('directory.bulk.addToWatchlist')}
          </button>
          <button type="button" className="btn btn--sm" disabled={bulk.isPending} onClick={() => runBulk('export')}>
            {tc('actions.exportCsv')}
          </button>
          <Can permission="tenants.suspend">
            <button type="button" className="btn btn--sm btn--danger" disabled={bulk.isPending} onClick={() => runBulk('suspend')}>
              {t('directory.bulk.suspend')}
            </button>
          </Can>
          <button type="button" className="link link--muted" style={{ marginLeft: 4, fontSize: 12 }} onClick={() => setSelected([])}>
            {tc('actions.clear')}
          </button>
        </div>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className="card table-scroll" aria-busy={list.isFetching}>
          <div role="table" aria-label={t('directory.table.label')} aria-rowcount={list.data?.meta.total}>
            <TRow cols={COLS} min={900} head>
              <div role="columnheader">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={allSel}
                  aria-label={t('directory.table.selectAll')}
                  onChange={() =>
                    setSelected(
                      allSel
                        ? selected.filter((id) => !rows.some((r) => r.id === id))
                        : [...new Set([...selected, ...rows.map((r) => r.id)])],
                    )
                  }
                />
              </div>
              <div role="columnheader">{t('directory.table.tenant')}</div>
              <div role="columnheader">{t('directory.table.owner')}</div>
              <div role="columnheader">{t('directory.table.plan')}</div>
              <SortHeader field="students" sort={f.sort} onSort={(v) => setF({ sort: v })}>
                {t('directory.table.students')}
              </SortHeader>
              <SortHeader field="mrr" sort={f.sort} onSort={(v) => setF({ sort: v })}>
                {t('directory.table.mrr')}
              </SortHeader>
              <div role="columnheader">{t('directory.table.usage')}</div>
              <div role="columnheader">{t('directory.table.lastActive')}</div>
              <div role="columnheader">{t('directory.table.health')}</div>
              <div role="columnheader">{t('directory.table.status')}</div>
            </TRow>
            {list.isPending && <SkeletonRows rows={8} h={22} />}
            {rows.map((tn) => (
              // Row click is a mouse shortcut; the tenant name link is the keyboard/AT target.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
              <div
                key={tn.id}
                role="row"
                className="trow trow--click"
                style={{ gridTemplateColumns: COLS, minWidth: 900 }}
                onClick={() => openTenant(tn.id)}
                onMouseEnter={() => warmTenant(tn.id)}
                onFocus={() => warmTenant(tn.id)}
              >
                {/* Stops the row click so ticking the checkbox doesn't open the drawer. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
                <div role="cell" className="hstack" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.includes(tn.id)}
                    onChange={() => toggle(tn.id)}
                    aria-label={t('directory.table.selectRow', { name: tn.name })}
                  />
                </div>
                <div role="cell" className="hstack min0" style={{ gap: 10 }}>
                  <Avatar text={initials(tn.name)} color={avatarColor(tn.id)} />
                  <div className="min0">
                    <a
                      href={`/tenants/${tn.id}`}
                      className="row-link ellipsis"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openTenant(tn.id);
                      }}
                    >
                      {tn.name}
                    </a>
                    <div className="t-xs muted ellipsis">{tn.domain}</div>
                  </div>
                </div>
                <div role="cell" className="min0">
                  <div className="ellipsis" style={{ color: 'var(--tx2)' }}>
                    {tn.ownerName}
                  </div>
                  <div className="faint ellipsis" style={{ fontSize: 11 }}>
                    {tn.stage}
                  </div>
                </div>
                <div role="cell">{tc(`enums.plan.${tn.plan}`)}</div>
                <div role="cell">{num(tn.students)}</div>
                <div role="cell" style={{ fontWeight: 600 }}>
                  {tn.mrr ? money(tn.mrr) : '—'}
                </div>
                <div role="cell" className="hstack" style={{ gap: 6 }}>
                  <Bar
                    size="thin"
                    value={Math.max(3, tn.utilization)}
                    color={toneFg(utilTone(tn.utilization))}
                    label={t('directory.table.utilization', { pct: tn.utilization })}
                  />
                  <span className="muted nowrap" style={{ fontSize: 11 }}>
                    {tn.utilization}%
                  </span>
                </div>
                <div role="cell" className="muted nowrap">
                  {timeAgo(tn.lastActiveAt)}
                </div>
                <div role="cell">
                  <Badge tone={healthTone(tn.health)}>{tc(`enums.tenantHealth.${tn.health}`)}</Badge>
                </div>
                <div role="cell">
                  <Badge tone={statusTone(tn.status)}>{tc(`enums.tenantStatus.${tn.status}`)}</Badge>
                </div>
              </div>
            ))}
            {list.isSuccess && rows.length === 0 && (
              <Empty
                action={
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setSearch('');
                      setF({ q: '', segment: 'all', plan: 'all', status: 'all' });
                    }}
                  >
                    {tc('actions.clearFilters')}
                  </button>
                }
              >
                {t('directory.empty')}
              </Empty>
            )}
          </div>
          {list.data && <Pagination meta={list.data.meta} noun={t('directory.noun')} onPage={(p) => setF({ page: String(p) })} />}
        </div>
      )}

      {emailTo && <EmailComposer ids={emailTo} onClose={() => setEmailTo(null)} onSent={() => setSelected([])} />}
      {can('tenants.view') && (
        <Routes>
          <Route
            path=":tenantId"
            element={<TenantDrawer onClose={() => void navigate({ pathname: '/tenants', search: location.search })} />}
          />
        </Routes>
      )}
    </Screen>
  );
}
