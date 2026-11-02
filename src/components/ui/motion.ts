import { useLayoutEffect, type RefObject } from 'react';
import type * as ExitModule from './exit';

// Script-side motion helpers. CSS (styles/motion.css) does the work wherever it can; these cover what CSS can't: exits
// of conditionally rendered overlays, FLIP moves, skeleton swaps and "start when scrolled into view". Timings mirror the
// --dur-* / --ease-* tokens in motion.css. Every helper is a no-op when the user prefers reduced motion or the
// environment has no Web Animations API (jsdom), so correctness never depends on an animation running or finishing.

/** --dur-micro / --dur-short / --dur-medium / --dur-long / --dur-draw. */
export const DUR = { micro: 120, short: 180, medium: 240, long: 320, draw: 700 } as const;
/** --ease-out / --ease-in. */
export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
/** Departures are shorter than arrivals (~65% of the matching entrance). */
export const EXIT = { short: Math.round(DUR.short * 0.65), medium: Math.round(DUR.medium * 0.65), long: Math.round(DUR.long * 0.65) };

const REDUCE = '(prefers-reduced-motion: reduce)';

/** True when motion is wanted and the Web Animations API exists. */
export function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof Element === 'undefined') return false;
  if (typeof Element.prototype.animate !== 'function') return false;
  return !(typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches);
}

/* ---------- Exits (the copy-and-animate code lives in ./exit, loaded on first use) ---------- */

export type ExitKind = 'modal' | 'drawer' | 'popover';
let exitModule: typeof ExitModule | null = null;
let exitLoading: Promise<unknown> | null = null;
/** Starts loading the exit code (once) when an overlay opens; by the time it closes, it is there. */
function loadExits() {
  if (exitModule || exitLoading || !canAnimate()) return;
  exitLoading = import('./exit').then(
    (m) => (exitModule = m),
    () => (exitLoading = null),
  );
}
/** Plays the exit for `el` if the exit code has arrived (otherwise the overlay simply goes, as without motion). */
function exit(el: HTMLElement, kind: ExitKind) {
  if (exitModule && canAnimate()) exitModule.playExit(el, exitModule.exits[kind]);
}

/**
 * Plays an exit when the component unmounts, on a copy of the panel's parent (its backdrop), so scrim and panel leave
 * together. The element is resolved at mount, while the tree is attached.
 */
export function useBackdropExit(panel: RefObject<HTMLElement | null>, kind: ExitKind): void {
  useLayoutEffect(() => {
    const el = panel.current?.parentElement;
    loadExits();
    return () => {
      if (el) exit(el, kind);
    };
  }, [panel, kind]);
}

/** Ref callback (React 19 ref cleanup) for menus and popovers: fade back toward the anchor on close. Module-level, so stable. */
export const popoverExitRef = (el: HTMLElement | null) => {
  if (!el) return undefined;
  loadExits();
  return () => exit(el, 'popover');
};

/* ---------- Skeleton → content ---------- */

/**
 * When the skeleton in `ref` unmounts, whatever replaces it in the same parent fades in (--dur-short). Elements already
 * running an entrance (the page cascade) are left to it; a skeleton whose parent left too does nothing.
 */
export function useSkeletonSwap(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (!el || !canAnimate()) return;
      const parent = el.parentElement;
      if (!parent) return;
      const before = new Set(parent.children);
      queueMicrotask(() => {
        if (el.isConnected || !parent.isConnected) return;
        const fresh = [...parent.children].filter((c): c is HTMLElement => !before.has(c) && c instanceof HTMLElement);
        // Reads (running animations) for every element, then the writes.
        const idle = fresh.filter((c) => !c.getAnimations().length);
        for (const c of idle) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.short, easing: EASE_OUT });
      });
    };
  }, [ref]);
}

/* ---------- Start an intro when scrolled into view ---------- */

// One IntersectionObserver for every waiting chart/meter. An element waits with `data-fx-wait` (its CSS intro is paused
// at the first frame); when it scrolls into view the attribute comes off and it is no longer observed. The observer is
// disconnected as soon as nothing is waiting. Without motion (or without IO) nothing waits.
let io: IntersectionObserver | null = null;
const waiting = new Set<Element>();

function release(el: Element) {
  el.removeAttribute('data-fx-wait');
  waiting.delete(el);
  io?.unobserve(el);
  if (!waiting.size) {
    io?.disconnect();
    io = null;
  }
}

/** Ref callback: hold this element's CSS intro until it is on screen. Module-level, so stable across renders. */
export const revealRef = (el: Element | null) => {
  if (!el || typeof IntersectionObserver !== 'function' || !canAnimate()) return undefined;
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) release(e.target);
  });
  el.setAttribute('data-fx-wait', '');
  waiting.add(el);
  io.observe(el);
  return () => {
    if (waiting.has(el)) release(el);
  };
};
