import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface KpiItem {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

interface KpiProps extends KpiItem {
  delta?: ReactNode;
  deltaColor?: string;
  deltaSuffix?: string;
  small?: boolean;
}

export function Kpi({ label, value, sub, delta, deltaColor, deltaSuffix = 'vs previous period', small }: KpiProps) {
  return (
    <div className={cx('card', small && 'card--tight')}>
      <div className="kpi-label">{label}</div>
      <div className={cx('kpi-value', small && 'kpi-value--sm')}>{value}</div>
      {delta != null && (
        <div style={{ fontSize: 12, marginTop: 6, color: deltaColor ?? 'var(--gFg)', fontWeight: 600 }}>
          {delta} <span style={{ color: 'var(--tx4)', fontWeight: 400 }}>{deltaSuffix}</span>
        </div>
      )}
      {sub != null && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function KpiRow({ items, small = true, min }: { items: KpiItem[]; small?: boolean; min?: number }) {
  return (
    <div className="grid-kpi" style={min ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` } : undefined}>
      {items.map((k) => (
        <Kpi key={k.label} {...k} small={small} />
      ))}
    </div>
  );
}
