import { Badge, Bar, Dot, Empty, ErrorState, KpiRow, Screen, Select, Skeleton, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Region } from '@/lib/domain';
import { num, toneDot } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useMoveTenantRegion, useRegions } from '../api';
import { REGION_TONE } from '../components/format';
import { useT } from '../i18n';
import type { RegionInfo, TenantResidency } from '../types';

const COLS = 'minmax(0,2fr) minmax(0,0.8fr) minmax(0,0.9fr) minmax(0,1.6fr)';

function ResidencyRow({ tenant: tn, regions }: { tenant: TenantResidency; regions: RegionInfo[] }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const move = useMoveTenantRegion(tn.tenantId);
  const value = move.pendingRegion ?? tn.region;
  return (
    <TRow cols={COLS} min={640} style={{ padding: '10px 0', fontSize: 12.5 }}>
      <div role="cell" className="hstack min0">
        <Dot color={toneDot(REGION_TONE[value])} size={8} />
        <span className="ellipsis t-strong">{tn.name}</span>
      </div>
      <div role="cell" className="muted">
        {tc(`enums.plan.${tn.plan}`)}
      </div>
      <div role="cell">{num(tn.students)}</div>
      <div role="cell" className="hstack wrap" style={{ gap: 8 }}>
        <Select<Region>
          value={value}
          options={regions.map((r) => [r.region, r.label] as const)}
          label={t('regions.regionFor', { tenant: tn.name })}
          disabled={!can('tenants.manage') || move.isPending}
          style={{ width: 'auto', padding: '6px 8px', fontSize: 12 }}
          onChange={(region) => {
            if (region === tn.region) return;
            const label = regions.find((r) => r.region === region)?.label ?? region;
            move.move(region, () => toast(t('regions.migrateToast', { tenant: tn.name, region: label })));
          }}
        />
        {tn.migrating && !move.isPending && (
          <Badge tone="warn" xs>
            {t('regions.migrating')}
          </Badge>
        )}
      </div>
    </TRow>
  );
}

export default function RegionsPage() {
  const t = useT();
  const q = useRegions();
  const d = q.data;

  if (q.error)
    return (
      <Screen max={1250} label={t('regions.title')}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const total = d?.tenants.length ?? 0;
  const eu = d?.regions.find((r) => r.region === 'EU')?.tenants ?? 0;

  return (
    <Screen max={1250} label={t('regions.title')}>
      {d ? (
        <KpiRow
          items={[
            {
              label: t('regions.kpi.live'),
              value: String(d.regions.length),
              sub: d.regions.map((r) => r.label.split(' · ')[1]).join(' · '),
            },
            { label: t('regions.kpi.eu'), value: String(eu), sub: t('regions.kpi.euSub') },
            { label: t('regions.kpi.pending'), value: String(d.pendingMigrations), sub: t('regions.kpi.pendingSub') },
            { label: t('regions.kpi.subProcessors'), value: String(d.subProcessors), sub: t('regions.kpi.listedInDpa') },
          ]}
        />
      ) : (
        <div className="grid-kpi">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card card--tight">
              <Skeleton h={12} w="50%" />
              <Skeleton h={24} w="40%" style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      )}

      <ul className="grid-kpi plain-list" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
        {d
          ? d.regions.map((r) => (
              <li key={r.region} className="card" style={{ padding: '16px 18px' }}>
                <div className="hstack">
                  <Dot color={toneDot(REGION_TONE[r.region])} size={10} />
                  <h2 style={{ fontWeight: 700, fontSize: 13.5, flex: 1, margin: 0 }}>{r.label}</h2>
                </div>
                <div className="display" style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>
                  {t('regions.tenants', { count: r.tenants })}
                </div>
                <Bar
                  tone={REGION_TONE[r.region]}
                  value={Math.round((r.tenants / Math.max(1, total)) * 100)}
                  style={{ marginTop: 8 }}
                  label={t('regions.barLabel', { region: r.label, tenants: t('regions.tenants', { count: r.tenants }), total })}
                />
                <div className="t-xs faint" style={{ marginTop: 8 }}>
                  {t('regions.learners', { framework: r.framework, count: r.learners })}
                </div>
              </li>
            ))
          : Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="card">
                <Skeleton h={14} w="50%" />
                <Skeleton h={22} w="35%" style={{ marginTop: 10 }} />
              </li>
            ))}
      </ul>

      <div className="card table-scroll" style={{ padding: '6px 18px 4px' }}>
        <div role="table" aria-label={t('regions.table')} aria-busy={q.isFetching}>
          <TRow cols={COLS} min={640} head style={{ fontSize: 10.5, fontWeight: 700 }}>
            <div role="columnheader">{t('regions.tenant')}</div>
            <div role="columnheader">{t('regions.plan')}</div>
            <div role="columnheader">{t('regions.learnersCol')}</div>
            <div role="columnheader">{t('regions.dataRegion')}</div>
          </TRow>
          {!d ? (
            <SkeletonRows rows={8} h={22} />
          ) : d.tenants.length === 0 ? (
            <Empty>{t('regions.empty')}</Empty>
          ) : (
            d.tenants.map((tn) => <ResidencyRow key={tn.tenantId} tenant={tn} regions={d.regions} />)
          )}
        </div>
      </div>

      <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
        {t('regions.note')}
      </div>
    </Screen>
  );
}
