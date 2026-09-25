import type { CSSProperties, ReactNode } from 'react';

interface IconProps {
  /** SVG path data (24×24 viewBox). Omit to pass custom children. */
  d?: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Icon({ d, size = 16, stroke = 1.8, children, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}
