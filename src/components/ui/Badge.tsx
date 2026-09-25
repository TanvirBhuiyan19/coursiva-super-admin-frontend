import type { CSSProperties, ReactNode } from 'react';
import type { Tone } from '@/lib/domain';
import { cx } from '@/lib/cx';

interface BadgeProps {
  tone?: Tone;
  pill?: boolean;
  xs?: boolean;
  tag?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  title?: string;
}

export function Badge({ tone = 'flat', pill, xs, tag, children, style, title }: BadgeProps) {
  return (
    <span
      className={cx('badge', `tone-${tone}`, pill && 'badge--pill', xs && 'badge--xs', tag && 'badge--tag')}
      style={style}
      title={title}
    >
      {children}
    </span>
  );
}

interface DotProps {
  tone?: Tone;
  color?: string;
  size?: number;
  style?: CSSProperties;
  /** Accessible label when the dot carries meaning on its own. */
  label?: string;
}

export function Dot({ tone = 'flat', color, size = 7, style, label }: DotProps) {
  return (
    <span
      className={cx('dot', !color && `dot-${tone}`)}
      style={{ width: size, height: size, background: color, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
