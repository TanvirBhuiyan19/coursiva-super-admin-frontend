import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Tone } from '@/lib/domain';
import { cx } from '@/lib/cx';
import { toneFg } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { clampNum, useGrow } from './grow';
import { revealRef, useSkeletonSwap } from './motion';

interface BarProps {
  /** 0–100, or any CSS width. */
  value: number | string;
  color?: string;
  tone?: Tone;
  size?: 'lg' | 'md' | 'thin';
  style?: CSSProperties;
  label?: string;
}

/**
 * A meter. Motion (transform only, CSS in motion.css): the fill grows in from its start edge once it scrolls into view,
 * and eases from the old size to the new one when the value changes; its real width is always the exact value.
 */
export function Bar({ value, color, tone, size, style, label }: BarProps) {
  // API numbers are validated before they reach CSS: finite and clamped to 0–100 (NaN/Infinity render as empty).
  const numeric = typeof value === 'number' ? clampNum(value, 0, 100, 0) : undefined;
  const w = numeric != null ? numeric + '%' : (value as string);
  const grow = useGrow(numeric ?? 100);
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
      <span
        ref={revealRef}
        className={grow.className}
        style={{ ...grow.style, width: w, background: color ?? (tone ? toneFg(tone) : undefined) }}
      />
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

export function Empty({ children, action }: { children?: ReactNode; action?: ReactNode }) {
  const tc = useCommonT();
  return (
    <div className="empty">
      <div>{children ?? tc('states.empty')}</div>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

interface ConfirmButtonProps {
  children: ReactNode;
  /** Label while armed; defaults to “Are you sure?”. */
  confirmLabel?: ReactNode;
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
  const tc = useCommonT();
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
      {armed ? (confirmLabel ?? tc('actions.areYouSure')) : children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Placeholder block shown while data loads. Whatever replaces it fades in (see `useSkeletonSwap`). */
export function Skeleton({ h = 14, w = '100%', r = 6, style }: { h?: number; w?: number | string; r?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  useSkeletonSwap(ref);
  return <span ref={ref} className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}

/** Stacked skeleton rows for list/table placeholders. */
export function SkeletonRows({ rows = 5, h = 18 }: { rows?: number; h?: number }) {
  const tc = useCommonT();
  const ref = useRef<HTMLDivElement>(null);
  useSkeletonSwap(ref);
  return (
    <div ref={ref} className="stack" style={{ gap: 14, padding: '8px 0' }} role="status" aria-label={tc('states.loadingLabel')}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} w={`${92 - ((i * 13) % 30)}%`} />
      ))}
    </div>
  );
}
