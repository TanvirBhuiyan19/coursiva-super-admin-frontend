import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// React's own `lazy` signature uses ComponentType<any>; matching it keeps the wrapped component's props exact.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export type Preloadable<T extends AnyComponent> = LazyExoticComponent<T> & { preload: () => Promise<unknown> };

/**
 * `React.lazy` with a `preload()` handle, so a chunk can be fetched on intent (hover, focus, idle)
 * before it renders. Repeated calls share one request.
 */
export function lazyWithPreload<T extends AnyComponent>(load: () => Promise<{ default: T }>): Preloadable<T> {
  let promise: Promise<{ default: T }> | undefined;
  const once = () => (promise ??= load());
  return Object.assign(lazy(once), { preload: once });
}

/** Runs `fn` when the browser is idle (falls back to a short timeout). */
export function whenIdle(fn: () => void, timeout = 2000) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 200);
}
