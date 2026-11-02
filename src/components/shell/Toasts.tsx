import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '@/features/shell/i18n';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUi, type Toast } from '@/store/ui';
import { canAnimate, DUR, EASE_OUT, EXIT } from '../ui/motion';

/**
 * Motion: a toast rises in (CSS `toastRise`); a dismissed one stays for a short exit (fade + shrink, `.toast--leaving`,
 * inert and hidden from assistive tech) and then leaves, while the others glide to their new places (a transform FLIP
 * of each toast's measured position). Without motion, a dismissed toast goes at once.
 */
export default function Toasts() {
  const t = useT();
  const tc = useCommonT();
  const live = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);

  // What's on screen, in order: the store's toasts plus dismissed ones playing their exit in their old slot.
  const [items, setItems] = useState<{ toast: Toast; out: boolean }[]>(() => live.map((toast) => ({ toast, out: false })));
  const [prevLive, setPrevLive] = useState(live);
  if (prevLive !== live) {
    setPrevLive(live);
    const motion = canAnimate();
    const byId = new Map(live.map((x) => [x.id, x]));
    const merged = items.flatMap((it) => {
      const now = byId.get(it.toast.id);
      if (now) return [{ toast: now, out: false }];
      return motion && !it.out ? [{ toast: it.toast, out: true }] : [];
    });
    for (const x of live) if (!items.some((it) => it.toast.id === x.id)) merged.push({ toast: x, out: false });
    setItems(merged);
  }

  // Leaving toasts are removed after their exit (a timer, never an animationend that might not fire).
  useEffect(() => {
    const out = new Set(items.filter((it) => it.out).map((it) => it.toast.id));
    if (!out.size) return undefined;
    const timer = setTimeout(() => setItems((cur) => cur.filter((it) => !(it.out && out.has(it.toast.id)))), EXIT.long + 20);
    return () => clearTimeout(timer);
  }, [items]);

  // FLIP: when the stack changes, each remaining toast slides from where it was to where it is now. Positions are layout
  // offsets from the stack's bottom edge (it is bottom-anchored), so running transforms never skew them. All positions
  // are read first, then the animations start (no layout reads between writes).
  const nodes = useRef(new Map<number, HTMLElement>());
  const tops = useRef(new Map<number, number>());
  useLayoutEffect(() => {
    if (!nodes.current.size && !tops.current.size) return;
    const next = new Map<number, number>();
    for (const [id, el] of nodes.current) {
      if (!el.isConnected) continue;
      next.set(id, el.offsetTop - (el.offsetParent instanceof HTMLElement ? el.offsetParent.offsetHeight : 0));
    }
    if (canAnimate()) {
      for (const [id, top] of next) {
        const before = tops.current.get(id);
        if (before == null || Math.abs(before - top) <= 0.5) continue;
        nodes.current.get(id)?.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
          duration: DUR.medium,
          easing: EASE_OUT,
          composite: 'add',
        });
      }
    }
    tops.current = next;
  });

  return (
    <div className="toasts" role="region" aria-label={t('toasts.label')}>
      <div aria-live="polite" className="stack" style={{ gap: 8, alignItems: 'center' }}>
        {items.map(({ toast, out }) => (
          <div
            key={toast.id}
            ref={(el) => {
              if (el) nodes.current.set(toast.id, el);
              else nodes.current.delete(toast.id);
            }}
            className={'toast' + (toast.tone === 'error' ? ' toast--error' : '') + (out ? ' toast--leaving' : '')}
            role={out ? undefined : toast.tone === 'error' ? 'alert' : 'status'}
            aria-hidden={out || undefined}
            inert={out}
          >
            <span>{toast.message}</span>
            <button type="button" className="toast-x" aria-label={tc('actions.dismiss')} onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
