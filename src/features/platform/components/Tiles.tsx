import { KpiRow, Skeleton, type KpiItem } from '@/components/ui';

/** Compact KPI tiles used across the platform-settings screens, with a skeleton while loading. */
export function Tiles({ items, count = 4 }: { items: KpiItem[] | undefined; count?: number }) {
  if (items) return <KpiRow items={items} />;
  return (
    <div className="grid-kpi" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card card--tight">
          <Skeleton h={12} w="45%" />
          <Skeleton h={22} w="55%" style={{ marginTop: 8 }} />
          <Skeleton h={11} w="70%" style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}
