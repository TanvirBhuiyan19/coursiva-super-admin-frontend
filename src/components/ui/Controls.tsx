import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/lib/cx';

/** An option is either a value (shown as-is) or a [value, label] pair. */
export type Option<V extends string> = V | readonly [V, ReactNode];

const split = <V extends string>(o: Option<V>): readonly [V, ReactNode] => (typeof o === 'string' ? [o, o] : o);

interface ChipProps {
  on?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'xs';
  accent?: boolean;
  children: ReactNode;
  title?: string;
  disabled?: boolean;
}

export function Chip({ on, onClick, size, accent, children, title, disabled }: ChipProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!on}
      className={cx('chip', size === 'sm' && 'chip--sm', size === 'xs' && 'chip--xs', accent && 'chip--accent', on && 'is-on')}
    >
      {children}
    </button>
  );
}

interface ChipGroupProps<V extends string> {
  options: readonly Option<V>[];
  value: V;
  onChange: (v: V) => void;
  size?: 'sm' | 'xs';
  accent?: boolean;
  /** Accessible name for the group, e.g. "Filter by plan". */
  label: string;
}

/** Single-select filter chips. */
export function ChipGroup<V extends string>({ options, value, onChange, size, accent, label }: ChipGroupProps<V>) {
  return (
    <div role="group" aria-label={label} className="hstack wrap" style={{ gap: 6 }}>
      {options.map((o) => {
        const [v, text] = split(o);
        return (
          <Chip key={v} on={value === v} onClick={() => onChange(v)} size={size} accent={accent}>
            {text}
          </Chip>
        );
      })}
    </div>
  );
}

interface SegProps<V extends string> {
  options: readonly Option<V>[];
  value: V;
  onChange: (v: V) => void;
  label: string;
  disabled?: boolean;
}

/** Segmented radio control (plan / region pickers). */
export function Seg<V extends string>({ options, value, onChange, label, disabled }: SegProps<V>) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const [v, text] = split(o);
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            disabled={disabled}
            className={value === v ? 'is-on' : ''}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleProps {
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name (required — a switch has no visible text). */
  label: string;
}

export function Toggle({ on, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cx('toggle', on && 'is-on')}
      onClick={() => onChange?.(!on)}
    >
      <span />
    </button>
  );
}

interface ToggleRowProps extends Omit<ToggleProps, 'label'> {
  label: string;
  sub?: ReactNode;
}

export function ToggleRow({ label, sub, on, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <div className="min0" style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        {sub != null && (
          <div className="t-xs muted" style={{ marginTop: 2, lineHeight: 1.45 }}>
            {sub}
          </div>
        )}
      </div>
      <Toggle on={on} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

interface SelectProps<V extends string> {
  value: V;
  onChange: (v: V) => void;
  options: readonly Option<V>[];
  className?: string;
  style?: CSSProperties;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export function Select<V extends string>({ value, onChange, options, className = 'select', style, label, disabled, id }: SelectProps<V>) {
  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value as V)}
      style={style}
      aria-label={label}
      disabled={disabled}
    >
      {options.map((o) => {
        const [v, text] = split(o);
        return (
          <option key={v} value={v}>
            {typeof text === 'string' ? text : v}
          </option>
        );
      })}
    </select>
  );
}
