import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { useT as useCommonT } from '@/lib/i18n/common';
import { CountUp } from './CountUp';
import { useChangeFlash } from './freshRows';

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
  /**
   * On self-refreshing screens: what the figure answers (e.g. the selected range). A change of the value within the same
   * scope tints the tile once; `null` while placeholder data shows. Leave unset elsewhere (no tint).
   */
  changeScope?: string | null;
}

/** A stat tile. Every tile shares one style on every screen; `small` is accepted for older callers and has no effect. */
export function Kpi({ label, value, sub, delta, deltaColor, deltaSuffix, changeScope }: KpiProps) {
  const tc = useCommonT();
  const flash = useChangeFlash(
    changeScope !== undefined && (typeof value === 'string' || typeof value === 'number') ? value : null,
    changeScope ?? null,
  );
  return (
    <div className={cx('card', 'kpi', flash && 'fx-flash', flash)}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        <CountUp value={value} />
      </div>
      {delta != null && (
        <div style={{ fontSize: 12, marginTop: 6, color: deltaColor ?? 'var(--gFg)', fontWeight: 600 }}>
          {delta} <span style={{ color: 'var(--tx4)', fontWeight: 400 }}>{deltaSuffix ?? tc('time.vsPreviousPeriod')}</span>
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
