// A third-party brand's logo (integrations, providers, networks). Page-only: import it from '@/components/ui/BrandLogo'
// (not the barrel) so the mark data loads with the screens that show logos, never with the shell.
import { createElement, useId, type ReactNode } from 'react';
import { markOf, monogram, type MarkNode } from './brandMarks';

interface Props {
  /** Catalogue id, connection key or display name: `zapier`, `google-sheets`, `Cal.com`. */
  brand: string;
  /** Display name: tried when `brand` has no mark ("Prometheus metrics"), then the fallback monogram's source (defaults to `brand`). */
  name?: string;
  /** Rendered size in px (square). */
  size?: number;
  /** Only where the logo stands alone; next to the visible brand name it stays decorative. */
  title?: string;
}

/** The only elements a vendored mark may render (the data is sanitised to these already; this is a second fence). */
const TAGS = new Set([
  'g',
  'path',
  'circle',
  'rect',
  'polygon',
  'polyline',
  'ellipse',
  'line',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
]);

/** React key prefix of a mark's elements. */
const ROOT = 'n';

/** React elements for a mark's tree; gradient/clip ids get this instance's prefix so two logos never share an id. */
function renderNodes(nodes: readonly MarkNode[], uid: string, key: string): ReactNode[] {
  return nodes.flatMap(([tag, props, kids], i) => {
    if (!TAGS.has(tag)) return [];
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) {
      p[k] = k === 'id' ? uid + v : v.startsWith('url(#') ? `url(#${uid}${v.slice(5)}` : v;
    }
    const k = `${key}.${String(i)}`;
    return [createElement(tag, { key: k, ...p }, kids ? renderNodes(kids, uid, k) : undefined)];
  });
}

/**
 * The brand's mark as an inline SVG in its own colours (a single-colour mark takes the text colour where its colour
 * would vanish on the neutral tile in the current theme), else a monogram. Static data, no network.
 */
export function BrandLogo({ brand, name, size = 18, title }: Props) {
  const uid = `bl${useId().replace(/[^A-Za-z0-9_-]/g, '')}-`;
  const mark = markOf(brand) ?? (name ? markOf(name) : undefined);
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const };
  if (!mark) {
    return (
      <span className="ext-mono" style={{ fontSize: Math.round(size * 0.62) }} {...a11y}>
        {monogram(name ?? brand)}
      </span>
    );
  }
  if ('src' in mark) {
    // Official raster logo (no official SVG exists): a local, re-encoded PNG.
    return (
      <img
        className="ext-logo"
        src={mark.src}
        alt={title ?? ''}
        aria-hidden={title ? undefined : true}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if ('nodes' in mark) {
    return (
      <svg className="ext-logo" width={size} height={size} viewBox={mark.viewBox} focusable="false" {...a11y}>
        {renderNodes(mark.nodes, uid, ROOT)}
      </svg>
    );
  }
  if ('parts' in mark) {
    return (
      <svg className="ext-logo" width={size} height={size} viewBox={mark.viewBox} focusable="false" {...a11y}>
        {mark.parts.map(([fill, d]) => (
          <path key={d} fill={fill} d={d} />
        ))}
      </svg>
    );
  }
  return (
    <svg
      className={mark.tone ? `ext-logo ext-logo--${mark.tone}` : 'ext-logo'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      focusable="false"
      {...a11y}
    >
      <path fill={mark.hex} d={mark.path} />
    </svg>
  );
}
