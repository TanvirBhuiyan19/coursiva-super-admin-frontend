// Page registry + intent preloading.
//
// Pages are discovered by file name: `src/features/<feature>/pages/<screenId>.page.tsx` (default export).
// An optional sibling `<screenId>.prefetch.ts` exports `prefetch(queryClient)` that warms the page's
// primary queries. `preloadScreen()` fetches the page chunk and its data together — on hover/focus of a
// nav link, and at navigation time (route loader) — so code and data never load one after the other.
import type { ComponentType } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { sessionQuery } from '@/features/auth/api';
import { permissionHint } from '@/features/auth/permissionHint';
import { lazyWithPreload, type Preloadable } from '@/lib/lazy';
import { getActiveQueryClient } from '@/lib/queryClient';
import { screenById, type ScreenId } from './screens';

type PrefetchModule = { prefetch: (qc: QueryClient) => void };

const pageModules = import.meta.glob<{ default: ComponentType }>('../features/*/pages/*.page.tsx');
const prefetchModules = import.meta.glob<PrefetchModule>('../features/*/pages/*.prefetch.ts');

const idOf = (file: string, suffix: string) => new RegExp(`/([^/]+)\\.${suffix}$`).exec(file)?.[1];

export const pages: Record<string, Preloadable<ComponentType>> = {};
for (const [file, load] of Object.entries(pageModules)) {
  const id = idOf(file, 'page\\.tsx');
  if (id) pages[id] = lazyWithPreload(load);
}

const prefetchers: Record<string, () => Promise<PrefetchModule>> = {};
for (const [file, load] of Object.entries(prefetchModules)) {
  const id = idOf(file, 'prefetch\\.ts');
  if (id) prefetchers[id] = load;
}

const warmed = new Map<string, number>();
const REWARM_MS = 10_000;

/**
 * Starts loading a screen's code and data. Safe to call repeatedly (deduplicated for 10 s) and a no-op
 * for screens the signed-in user can't open, so it never triggers 403s.
 */
export function preloadScreen(id: ScreenId) {
  const now = Date.now();
  if (now - (warmed.get(id) ?? 0) < REWARM_MS) return;
  warmed.set(id, now);

  void pages[id]?.preload().catch(() => warmed.delete(id));
  const qc = getActiveQueryClient();
  const prefetcher = prefetchers[id];
  if (!qc || !prefetcher) return;
  const permission = screenById[id].permission;
  const allowed = (perms: readonly string[]) => !permission || perms.includes(permission);
  const run = () =>
    void prefetcher().then(
      (m) => m.prefetch(qc),
      () => warmed.delete(id),
    );

  const cached = qc.getQueryData(sessionQuery.queryKey);
  if (cached !== undefined) {
    if (cached && allowed(cached.permissions)) run();
    return;
  }
  // Cold load: the session isn't known yet. If the last session's permission hint allows this screen,
  // prefetch now — in parallel with the session check. Otherwise wait for the session, then prefetch.
  const hint = permissionHint();
  if (hint && allowed(hint)) {
    run();
    return;
  }
  void qc.query(sessionQuery).then(
    (user) => {
      if (user && allowed(user.permissions)) run();
    },
    () => warmed.delete(id),
  );
}
