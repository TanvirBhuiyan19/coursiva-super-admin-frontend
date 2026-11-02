import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { useT as useCommonT } from '@/lib/i18n/common';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { canAnimate, DUR, EASE_OUT } from './motion';
import { Modal } from './Overlay';

export interface SectionNavItem<K extends string> {
  id: K;
  label: string;
  /** SVG path data (24×24) for the nav icon. */
  icon?: string;
  /** Small accent count after the label (e.g. settings changed from their default). Hidden when 0 or absent. */
  badge?: number;
  /** Screen-reader text for the badge, e.g. "2 settings changed from their defaults". */
  badgeLabel?: string;
  /** Badge colour: `accent` (default) for counts, `warn` / `bad` for things that need attention (e.g. failed deliveries). */
  badgeTone?: 'accent' | 'warn' | 'bad';
}

interface SectionedPageProps<K extends string> {
  sections: readonly SectionNavItem<K>[];
  active: K;
  /** Called with the section to show (after confirming, when `confirmSwitch` is set). */
  onChange: (id: K) => void;
  /** Accessible name of the nav, also the visible label of the narrow-screen picker. */
  label: string;
  /** URL of each section. When given, nav items are real links (open in a new tab, copy link) — pair with `useUrlState`. */
  href?: (id: K) => string;
  /** The active section has unsaved changes: switching asks first ("Discard and switch"). */
  confirmSwitch?: boolean;
  children: ReactNode;
}

/**
 * Long pages split into sections: a section nav (a tab bar across the top, as in the school dashboard; a labelled
 * `<select>` on phones) and the active section. The caller owns the active id — keep it in the URL so every section can be linked to.
 */
export function SectionedPage<K extends string>({
  sections,
  active,
  onChange,
  label,
  href,
  confirmSwitch,
  children,
}: SectionedPageProps<K>) {
  const tc = useCommonT();
  const pickerId = useId();
  const [pending, setPending] = useState<K | null>(null);
  const navRef = useRef<HTMLElement>(null);
  // Keep the active tab in view when the bar scrolls sideways (many sections, a narrow window, a deep link).
  useEffect(() => {
    const tab = navRef.current?.querySelector<HTMLElement>('[aria-current]');
    // jsdom (tests) has no scrollIntoView.
    if (tab && 'scrollIntoView' in tab) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  // Which edges have more tabs past them: those edges fade, and a round arrow button appears there.
  const [more, setMore] = useState({ start: false, end: false });
  useEffect(() => {
    const list = navRef.current?.querySelector('ul');
    if (!list) return;
    const mark = () => {
      const { scrollLeft, scrollWidth, clientWidth } = list;
      const next = { start: scrollLeft > 1, end: scrollLeft + clientWidth < scrollWidth - 1 };
      list.dataset.more = [next.start && 'start', next.end && 'end'].filter(Boolean).join(' ');
      setMore((m) => (m.start === next.start && m.end === next.end ? m : next));
    };
    mark();
    list.addEventListener('scroll', mark, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mark);
    ro?.observe(list);
    return () => {
      list.removeEventListener('scroll', mark);
      ro?.disconnect();
    };
  }, []);

  // The sliding pill under the active tab: placed on the active link, it glides to the next one on a switch. The glide
  // is a transform FLIP (translate + scaleX from where the pill is on screen now — mid-slide on fast clicks); width is
  // set once, never animated. Resizes and label changes re-place it without motion.
  const indicatorRef = useRef<HTMLLIElement>(null);
  const placed = useRef<{ geo: string; anim: Animation | null } | null>(null);
  useLayoutEffect(() => {
    const list = navRef.current?.querySelector('ul');
    const pill = indicatorRef.current;
    if (!list || !pill) return;
    const place = (glide: boolean) => {
      const tab = list.querySelector<HTMLElement>('.sectioned-link.is-active');
      if (!tab) return;
      // Reads first: relative to the list's padding box, in its scrolled content (the pill scrolls with the tabs).
      const box = list.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      const x = r.left - box.left - list.clientLeft + list.scrollLeft;
      const y = r.top - box.top - list.clientTop + list.scrollTop;
      const geo = `${x},${y},${r.width},${r.height}`;
      const prev = placed.current;
      if (prev?.geo === geo) return;
      let from: string | null = null;
      if (glide && prev && r.width > 0 && canAnimate()) {
        const now = pill.getBoundingClientRect();
        const cx = now.left - box.left - list.clientLeft + list.scrollLeft;
        const cy = now.top - box.top - list.clientTop + list.scrollTop;
        from = `translate(${cx}px, ${cy}px) scaleX(${now.width / r.width})`;
      }
      // Then the writes.
      prev?.anim?.cancel();
      const to = `translate(${x}px, ${y}px)`;
      pill.style.transform = to;
      pill.style.width = `${r.width}px`;
      pill.style.height = `${r.height}px`;
      pill.setAttribute('data-ready', '');
      placed.current = {
        geo,
        anim: from ? pill.animate([{ transform: from }, { transform: to }], { duration: DUR.long, easing: EASE_OUT }) : null,
      };
    };
    place(true);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place(false));
    ro?.observe(list);
    return () => ro?.disconnect();
  }, [active, sections]);

  const scrollTabs = (dir: 1 | -1) => {
    const list = navRef.current?.querySelector('ul');
    list?.scrollBy({ left: dir * list.clientWidth * 0.7, behavior: 'smooth' });
  };

  const request = (id: K) => {
    if (id === active) return;
    if (confirmSwitch) setPending(id);
    else onChange(id);
  };
  const onLinkClick = (e: MouseEvent<HTMLAnchorElement>, id: K) => {
    // Let the browser handle new-tab / new-window clicks.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    request(id);
  };

  return (
    <div className="sectioned">
      <div className="sectioned-picker">
        <label className="field-label" htmlFor={pickerId} style={{ marginTop: 0 }}>
          {label}
        </label>
        <select id={pickerId} className="select" value={active} onChange={(e) => request(e.target.value as K)}>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.badge ? `${s.label} (${s.badge})` : s.label}
            </option>
          ))}
        </select>
      </div>

      <nav ref={navRef} className="sectioned-nav" aria-label={label} data-indicator="">
        <ul className="plain-list">
          <li ref={indicatorRef} className="sectioned-indicator" aria-hidden="true" role="presentation" />
          {sections.map((s) => {
            const on = s.id === active;
            const content = (
              <>
                {s.icon && <Icon d={s.icon} size={15} />}
                <span className="sectioned-link-label">{s.label}</span>
                {!!s.badge && (
                  <>
                    <span
                      className={cx('sectioned-badge', s.badgeTone && s.badgeTone !== 'accent' && `sectioned-badge--${s.badgeTone}`)}
                      aria-hidden={s.badgeLabel ? true : undefined}
                    >
                      {s.badge}
                    </span>
                    {s.badgeLabel && <span className="sr-only">{s.badgeLabel}</span>}
                  </>
                )}
              </>
            );
            return (
              <li key={s.id}>
                {href ? (
                  <a
                    href={href(s.id)}
                    className={cx('sectioned-link', on && 'is-active')}
                    aria-current={on ? 'page' : undefined}
                    onClick={(e) => onLinkClick(e, s.id)}
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    type="button"
                    className={cx('sectioned-link', on && 'is-active')}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => request(s.id)}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {/* Pointer helpers only: keyboard users Tab through the tabs, which scroll into view on their own. */}
        {more.start && (
          <button
            type="button"
            className="sectioned-scroll sectioned-scroll--start"
            tabIndex={-1}
            aria-hidden="true"
            title={tc('sectioned.scrollBack')}
            onClick={() => scrollTabs(-1)}
          >
            <Icon d="M15 18l-6-6 6-6" size={15} />
          </button>
        )}
        {more.end && (
          <button
            type="button"
            className="sectioned-scroll sectioned-scroll--end"
            tabIndex={-1}
            aria-hidden="true"
            title={tc('sectioned.scrollMore')}
            onClick={() => scrollTabs(1)}
          >
            <Icon d="M9 18l6-6-6-6" size={15} />
          </button>
        )}
      </nav>

      <div className="sectioned-body">{children}</div>

      {pending !== null && (
        <Modal onClose={() => setPending(null)} label={tc('unsaved.label')} width={420}>
          <h2 className="modal-title">{tc('unsaved.switchTitle')}</h2>
          <p className="t-sm muted" style={{ margin: '6px 0 18px' }}>
            {tc('unsaved.switchBody')}
          </p>
          <div className="hstack wrap" style={{ justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn--lg" data-autofocus onClick={() => setPending(null)}>
              {tc('unsaved.keepEditing')}
            </button>
            <button
              type="button"
              className="btn btn--danger btn--lg"
              onClick={() => {
                setPending(null);
                onChange(pending);
              }}
            >
              {tc('unsaved.discardSwitch')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * One section's content inside `SectionedPage`, for pages that render every section and show one at a time.
 * Mounted the first time it's shown, then kept (hidden) — unsaved drafts, filters and loaded data survive a switch.
 */
export function SectionPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(active);
  if (active && !seen) setSeen(true);
  if (!seen) return null;
  return (
    <div className="sectioned-panel" hidden={!active}>
      {children}
    </div>
  );
}

export interface SettingControlProps {
  id: string;
  /** Id of the row's label text — for controls labelled by reference (radio groups, checkbox lists). */
  labelId: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

interface SettingRowProps {
  label: ReactNode;
  help?: ReactNode;
  error?: string | undefined;
  /** The saved value differs from its shipped default: shows a "changed" chip. */
  changed?: boolean;
  /**
   * `field` (default): the label is a `<label>` for the control's `id`.
   * `group`: the label is plain text with `labelId` — for switches, radio groups and checkbox lists that name themselves.
   */
  kind?: 'field' | 'group';
  children: (props: SettingControlProps) => ReactNode;
}

/** One setting: label, "changed" chip, help and inline error on the left; the control (≈280px) on the right. */
export function SettingRow({ label, help, error, changed, kind = 'field', children }: SettingRowProps) {
  const tc = useCommonT();
  const id = useId();
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [help != null && helpId, error && errorId].filter(Boolean).join(' ');
  return (
    <div className="setting-row">
      <div className="setting-row-grid">
        <div className="min0">
          <div className="setting-row-head">
            {kind === 'field' ? (
              <label id={labelId} htmlFor={id} className="setting-row-label">
                {label}
              </label>
            ) : (
              <span id={labelId} className="setting-row-label">
                {label}
              </span>
            )}
            {changed && (
              <Badge xs title={tc('sectioned.changedLabel')}>
                {tc('sectioned.changed')}
              </Badge>
            )}
          </div>
          {help != null && (
            <div id={helpId} className="setting-row-help">
              {help}
            </div>
          )}
          {error && (
            <div id={errorId} className="field-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="setting-row-control">
          {children({
            id,
            labelId,
            ...(error ? { 'aria-invalid': true } : {}),
            ...(describedBy ? { 'aria-describedby': describedBy } : {}),
          })}
        </div>
      </div>
    </div>
  );
}

export interface WhereReadItem {
  key: string;
  label: ReactNode;
  /** Where the value is read, e.g. "Marketing sign-up (POST /signup)". Rendered monospace. */
  effect: ReactNode;
}

/** Collapsible "where these values are read" list, kept next to a settings form so each value's effect is visible. */
export function WhereRead({ summary, items }: { summary: ReactNode; items: readonly WhereReadItem[] }) {
  if (!items.length) return null;
  return (
    <details className="card card--tight where-read">
      <summary>{summary}</summary>
      <dl className="where-read-list">
        {items.map((i) => (
          <div key={i.key}>
            <dt>{i.label}</dt>
            <dd className="mono">{i.effect}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
