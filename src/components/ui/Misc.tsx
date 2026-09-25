import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Tone } from '@/lib/domain';
import { cx } from '@/lib/cx';
import { toneFg } from '@/lib/format';

interface BarProps {
  /** 0–100, or any CSS width. */
  value: number | string;
  color?: string;
  tone?: Tone;
  size?: 'lg' | 'md' | 'thin';
  style?: CSSProperties;
  label?: string;
}

export function Bar({ value, color, tone, size, style, label }: BarProps) {
  const numeric = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : undefined;
  const w = numeric != null ? numeric + '%' : (value as string);
  return (
    <div
      className={cx('bar', size === 'lg' && 'bar--lg', size === 'md' && 'bar--md', size === 'thin' && 'bar--thin')}
      style={style}
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuenow={label ? numeric : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <span style={{ width: w, background: color ?? (tone ? toneFg(tone) : undefined) }} />
    </div>
  );
}

interface AvatarProps {
  text: string;
  color: string;
  size?: number;
  round?: boolean;
  radius?: number;
  fontSize?: number;
}

export function Avatar({ text, color, size = 28, round, radius, fontSize }: AvatarProps) {
  return (
    <div
      className={cx('avatar', round && 'avatar--round')}
      aria-hidden="true"
      style={{ width: size, height: size, background: color, borderRadius: radius, fontSize: fontSize ?? (size >= 40 ? 15 : 11) }}
    >
      {text}
    </div>
  );
}

export function Empty({ children = 'Nothing here', action }: { children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div>{children}</div>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

interface ConfirmButtonProps {
  children: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  /** Shown while the action runs. */
  pending?: boolean;
}

/** Two-step destructive button: the first click arms it, the second commits. Disarms after 4 s or on blur. */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  className = 'btn btn--danger',
  style,
  disabled,
  pending,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={cx(className, armed && 'is-armed')}
      style={style}
      disabled={disabled || pending}
      aria-live="polite"
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {pending ? <Spinner /> : null}
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Placeholder block shown while data loads. */
export function Skeleton({ h = 14, w = '100%', r = 6, style }: { h?: number; w?: number | string; r?: number; style?: CSSProperties }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** Stacked skeleton rows for list/table placeholders. */
export function SkeletonRows({ rows = 5, h = 18 }: { rows?: number; h?: number }) {
  return (
    <div className="stack" style={{ gap: 14, padding: '8px 0' }} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} w={`${92 - ((i * 13) % 30)}%`} />
      ))}
    </div>
  );
}
