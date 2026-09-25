import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChipGroup, ErrorState, Screen, Skeleton } from '@/components/ui';
import { Can } from '@/features/auth/Can';
import { useCan } from '@/features/auth/useCan';
import { ROLES, type Role } from '@/features/auth/permissions';
import { num } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { useStaffList, useStaffSummary } from '../api';
import { InviteForm } from '../components/InviteForm';
import { PermissionMatrix } from '../components/PermissionMatrix';
import { AccessReviewCard, StaffActivityCard } from '../components/StaffCards';
import { StaffTable } from '../components/StaffTable';
import type { StaffListParams, StaffSummary } from '../types';

function Kpis({ s }: { s: StaffSummary | undefined }) {
  const items: [string, string, string][] | null = s
    ? [
        ['Staff', num(s.total), `${s.invited} invited · ${s.suspended} suspended`],
        [
          '2FA coverage',
          `${s.twoFactorCoverage}%`,
          s.withoutTwoFactor.length ? `${s.withoutTwoFactor.length} without 2FA` : 'Everyone enrolled',
        ],
        ['Elevated now', num(s.elevatedNow), 'Just-in-time Owner access'],
        ['Impersonations · 7d', num(s.impersonations7d), 'All recorded in the audit log'],
      ]
    : null;
  return (
    <div className="grid-kpi" style={{ gap: 12 }}>
      {items
        ? items.map(([label, value, sub]) => (
            <div key={label} className="card card--tight">
              <div className="kpi-label">{label}</div>
              <div className="kpi-value kpi-value--sm">{value}</div>
              <div className="kpi-sub" style={{ marginTop: 2 }}>
                {sub}
              </div>
            </div>
          ))
        : Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card card--tight">
              <Skeleton h={12} w="40%" />
              <Skeleton h={22} w="60%" style={{ marginTop: 8 }} />
            </div>
          ))}
    </div>
  );
}

export default function StaffPage() {
  const can = useCan();
  const [f, setF] = useUrlState({ q: '', role: 'all', member: '' });
  const [search, setSearch] = useState(f.q);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
  }, [debounced, f.q, setF]);

  const params: StaffListParams = {
    perPage: 100,
    ...(f.q ? { search: f.q } : {}),
    ...(f.role !== 'all' ? { role: f.role as Role } : {}),
  };
  const list = useStaffList(params);
  const summary = useStaffSummary();
  // The access review always covers everyone, independent of the table filters.
  const everyone = useStaffList({ perPage: 100 });
  const s = summary.data;

  return (
    <Screen max={1250} label="Platform staff">
      {summary.error ? <ErrorState error={summary.error} onRetry={() => void summary.refetch()} /> : <Kpis s={s} />}

      {s && s.withoutTwoFactor.length > 0 && (
        <div className="callout callout--warn" role="status" style={{ alignItems: 'center' }}>
          <span aria-hidden="true">⚠</span>
          <span className="fg-warn" style={{ fontWeight: 600, flex: 1 }}>
            {s.withoutTwoFactor.map((x) => x.name).join(', ')} can sign in without 2FA —{' '}
            {s.requireStaffTwoFactor ? 'they must enroll at their next sign-in.' : 'require it in Console settings.'}
          </span>
          {!s.requireStaffTwoFactor && can('platform.view') && (
            <Link className="btn btn--sm" to="/settings">
              Open settings
            </Link>
          )}
        </div>
      )}

      <div className="card" style={{ padding: '18px 20px' }}>
        <Can permission="staff.manage">
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--bd2)' }}>
            <InviteForm onInvited={(id) => setF({ member: id, q: '', role: 'all' })} />
          </div>
        </Can>
        <div className="hstack wrap" style={{ gap: 12, marginBottom: 14 }}>
          <div className="hstack wrap" style={{ gap: 10 }}>
            <input
              className="input"
              type="search"
              style={{ width: 220 }}
              placeholder="Search name or email…"
              aria-label="Search staff"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ChipGroup
              size="sm"
              label="Filter by role"
              options={['all', ...ROLES].map((r) => [r, r === 'all' ? 'All roles' : r] as const)}
              value={f.role}
              onChange={(role) => setF({ role })}
            />
          </div>
          {can('audit.view') && (
            <Link className="btn btn--sm" to="/audit" style={{ marginLeft: 'auto' }}>
              Open audit log →
            </Link>
          )}
        </div>
        {list.error ? (
          <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
        ) : (
          <div className="table-scroll" style={{ position: 'relative' }} aria-busy={list.isFetching}>
            <StaffTable rows={list.data?.data} loading={list.isPending} highlight={f.member} />
          </div>
        )}
      </div>

      <div className="grid-2">
        <AccessReviewCard members={everyone.data?.data ?? []} />
        <StaffActivityCard />
      </div>

      <PermissionMatrix />
    </Screen>
  );
}
