import { Badge, Bar, Dot, Empty, ErrorState, KpiRow, Screen, Select, Skeleton, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Region } from '@/lib/domain';
import { num, plural, toneDot } from '@/lib/format';
import { toast } from '@/store/ui';
import { useMoveTenantRegion, useRegions } from '../api';
import { REGION_TONE } from '../components/format';
import type { RegionInfo, TenantResidency } from '../types';

const COLS = 'minmax(0,2fr) minmax(0,0.8fr) minmax(0,0.9fr) minmax(0,1.6fr)';

function ResidencyRow({ t, regions }: { t: TenantResidency; regions: RegionInfo[] }) {
  const can = useCan();
  const move = useMoveTenantRegion(t.tenantId);
  const value = move.pendingRegion ?? t.region;
  return (
    <TRow cols={COLS} min={640} style={{ padding: '10px 0', fontSize: 12.5 }}>
      <div role="cell" className="hstack min0">
        <Dot color={toneDot(REGION_TONE[value])} size={8} />
        <span className="ellipsis t-strong">{t.name}</span>
      </div>
      <div role="cell" className="muted">
        {t.plan}
      </div>
      <div role="cell">{num(t.students)}</div>
      <div role="cell" className="hstack wrap" style={{ gap: 8 }}>
        <Select<Region>
          value={value}
          options={regions.map((r) => [r.region, r.label] as const)}
          label={`Data region for ${t.name}`}
          disabled={!can('tenants.manage') || move.isPending}
          style={{ width: 'auto', padding: '6px 8px', fontSize: 12 }}
          onChange={(region) => {
            if (region === t.region) return;
            const label = regions.find((r) => r.region === region)?.label ?? region;
            move.move(region, () => toast(`${t.name} scheduled to migrate to ${label} — read-only for ~20 minutes during cutover`));
          }}
        />
        {t.migrating && !move.isPending && (
          <Badge tone="warn" xs>
            Migrating
          </Badge>
        )}
      </div>
    </TRow>
  );
}

export default function RegionsPage() {
  const q = useRegions();
  const d = q.data;

  if (q.error)
    return (
      <Screen max={1250} label="Data residency">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const total = d?.tenants.length ?? 0;
  const eu = d?.regions.find((r) => r.region === 'EU')?.tenants ?? 0;

  return (
    <Screen max={1250} label="Data residency">
      {d ? (
        <KpiRow
          items={[
            { label: 'Regions live', value: String(d.regions.length), sub: d.regions.map((r) => r.label.split(' · ')[1]).join(' · ') },
            { label: 'EU-resident tenants', value: String(eu), sub: 'Data never leaves the EU' },
            { label: 'Pending migrations', value: String(d.pendingMigrations), sub: 'Cutover ~20 min read-only' },
            { label: 'Sub-processors', value: String(d.subProcessors), sub: 'Listed in the DPA' },
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
                  {plural(r.tenants, 'tenant')}
                </div>
                <Bar
                  tone={REGION_TONE[r.region]}
                  value={Math.round((r.tenants / Math.max(1, total)) * 100)}
                  style={{ marginTop: 8 }}
                  label={`${r.label}: ${plural(r.tenants, 'tenant')} of ${total}`}
                />
                <div className="t-xs faint" style={{ marginTop: 8 }}>
                  {r.framework} · {num(r.learners)} learners
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
        <div role="table" aria-label="Tenant data regions" aria-busy={q.isFetching}>
          <TRow cols={COLS} min={640} head style={{ fontSize: 10.5, fontWeight: 700 }}>
            <div role="columnheader">Tenant</div>
            <div role="columnheader">Plan</div>
            <div role="columnheader">Learners</div>
            <div role="columnheader">Data region</div>
          </TRow>
          {!d ? (
            <SkeletonRows rows={8} h={22} />
          ) : d.tenants.length === 0 ? (
            <Empty>No tenants yet.</Empty>
          ) : (
            d.tenants.map((t) => <ResidencyRow key={t.tenantId} t={t} regions={d.regions} />)
          )}
        </div>
      </div>

      <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
        Region is chosen at signup and pinned for database, storage and backups. Video is served from the nearest CDN edge regardless of
        region. Moving a tenant schedules a migration; the workspace is read-only for about 20 minutes during cutover.
      </div>
    </Screen>
  );
}
