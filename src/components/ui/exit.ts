// Exit animations for overlays (lazy: motion.ts loads this chunk the first time an overlay opens, so it never sits on
// the first paint). Only ever called when motion is wanted.
import { EASE_IN, EXIT } from './motion';

/** Attributes a visual-only copy must not carry: ids/names (duplicates, form submission, label targets) and focus hooks. */
const STRIP = ['id', 'name', 'for', 'autofocus', 'data-autofocus', 'tabindex', 'href'];

/**
 * Plays an exit for an element React is about to remove: a visual-only copy (cloneNode — never markup strings) takes
 * its place and animates out, then is removed. The copy is inert, aria-hidden, has no ids, names, links or password
 * values, and ignores the pointer; removal never depends on `finish` firing (a timeout backs it up). It is inserted on
 * the next microtask only if the original really left the document, so StrictMode's simulated unmount (and any remount)
 * never shows a ghost. Only overlays use this (one element at a time), never list rows.
 */
export function playExit(el: HTMLElement, animate: (ghost: HTMLElement) => Animation[]): void {
  const parent = el.parentNode;
  if (!parent) return;
  const next = el.nextSibling;
  const ghost = el.cloneNode(true) as HTMLElement;
  // Reads first (scroll offsets and textarea/select values are properties, not attributes), then writes on the copy,
  // which isn't in the document yet (no layout).
  const from = [el, ...el.querySelectorAll<HTMLElement>('*')];
  const to = [ghost, ...ghost.querySelectorAll<HTMLElement>('*')];
  const scrolls: [HTMLElement, number, number][] = [];
  from.forEach((src, i) => {
    const dst = to[i]!;
    if (src.scrollTop || src.scrollLeft) scrolls.push([dst, src.scrollTop, src.scrollLeft]);
    if (src instanceof HTMLTextAreaElement || src instanceof HTMLSelectElement) (dst as HTMLTextAreaElement).value = src.value;
  });
  for (const node of to) for (const attr of STRIP) node.removeAttribute(attr);
  for (const pw of ghost.querySelectorAll('input[type="password"]')) pw.removeAttribute('value');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.classList.add('is-exiting');
  ghost.style.pointerEvents = 'none';

  queueMicrotask(() => {
    if (el.isConnected || !(parent as Node).isConnected) return;
    parent.insertBefore(ghost, next && next.parentNode === parent ? next : null);
    for (const [node, top, left] of scrolls) {
      node.scrollTop = top;
      node.scrollLeft = left;
    }
    // The exit holds its last frame (fill: forwards) until a timer removes the copy — no reliance on `finish` events.
    const anims = animate(ghost);
    const longest = Math.max(0, ...anims.map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0)));
    setTimeout(() => ghost.remove(), longest + 40);
  });
}

const leave = (duration: number) => ({ duration, easing: EASE_IN, fill: 'forwards' as const });
/** Backdrop fades while its panel (first child) plays `panel`. */
const withPanel = (duration: number, panel: Keyframe[]) => (ghost: HTMLElement) => {
  const box = ghost.firstElementChild as HTMLElement | null;
  return [ghost.animate([{ opacity: 1 }, { opacity: 0 }], leave(duration)), ...(box ? [box.animate(panel, leave(duration))] : [])];
};

/** Standard exits: shorter than the entrance, accelerating away. */
export const exits = {
  /** Modal / palette: the backdrop fades, the panel shrinks to .98 and fades. */
  modal: withPanel(EXIT.medium, [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'scale(0.98)' },
  ]),
  /** Drawer: the backdrop fades, the panel slides back toward its edge. */
  drawer: withPanel(EXIT.long, [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'translateX(24px)' },
  ]),
  /** Menus and popovers: fade back up toward the anchor. */
  popover: (ghost: HTMLElement) => [
    ghost.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-4px)' },
      ],
      leave(EXIT.short),
    ),
  ],
};
