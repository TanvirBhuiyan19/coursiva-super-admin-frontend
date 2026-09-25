import { useId, type CSSProperties, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

export function Screen({ max = 1200, gap, children, label }: { max?: number; gap?: number; children: ReactNode; label?: string }) {
  return (
    <div className="screen" data-screen-label={label} style={{ maxWidth: max, gap }}>
      {children}
    </div>
  );
}

interface CardProps {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
  tight?: boolean;
  flush?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Surface container. A titled card renders as a <section> labelled by its heading. */
export function Card({ title, sub, right, className, tight, flush, style, children }: CardProps) {
  const headingId = useId();
  const hasHead = title != null || right != null || sub != null;
  const Tag = title != null ? 'section' : 'div';
  return (
    <Tag
      className={cx('card', tight && 'card--tight', flush && 'card--flush', className)}
      style={style}
      aria-labelledby={title != null ? headingId : undefined}
    >
      {hasHead && (
        <div className="card-head">
          {title != null && (
            <h2 className="card-title" id={headingId}>
              {title}
            </h2>
          )}
          {sub != null && <span className="card-sub">{sub}</span>}
          {right}
        </div>
      )}
      {children}
    </Tag>
  );
}

interface TRowProps {
  /** grid-template-columns value. */
  cols: string;
  /** Minimum width so the table scrolls instead of squashing on small screens. */
  min?: number;
  head?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
  selected?: boolean;
}

/** Grid-based table row. Put rows inside `.card.table-scroll`. */
export function TRow({ cols, min, head, onClick, children, style, selected }: TRowProps) {
  return (
    // Row click is a mouse shortcut; every clickable row also renders a link/button for keyboard and AT users.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
    <div
      role="row"
      className={cx('trow', head && 'trow--head', onClick && 'trow--click', selected && 'is-selected')}
      onClick={onClick}
      style={{ gridTemplateColumns: cols, minWidth: min, ...style }}
    >
      {children}
    </div>
  );
}
