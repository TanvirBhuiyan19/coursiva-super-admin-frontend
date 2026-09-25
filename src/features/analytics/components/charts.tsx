// Small presentational pieces shared by the analytics screens.
import type { ReactNode } from 'react';
import { Bar, Skeleton } from '@/components/ui';

/** A labelled horizontal bar row (funnel stages). The bar itself is decorative; pair it with an sr-only table. */
export function FunnelBar({
  label,
  right,
  width,
  h,
  foot,
}: {
  label: string;
  right: ReactNode;
  width: number;
  h: number;
  foot?: ReactNode;
}) {
  return (
    <div>
      <div className="hstack" style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">{right}</span>
      </div>
      <Bar value={width} style={{ height: h, borderRadius: 5 }} />
      {foot && (
        <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
          {foot}
        </div>
      )}
    </div>
  );
}

/** Skeleton for a KPI row while data loads. */
export function KpiSkeletons({ n }: { n: number }) {
  return (
    <div className="grid-kpi" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card card--tight">
          <Skeleton h={12} w="50%" />
          <Skeleton h={24} w="60%" style={{ marginTop: 10 }} />
          <Skeleton h={11} w="70%" style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}
