import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { env } from '@/config/env';
import { authKeys, resetSessionState } from '@/features/auth/api';
import { listenSession } from '@/features/auth/tabSync';
import type { User } from '@/features/auth/types';
import { onUnauthenticated } from '@/lib/api/client';
import { setReportingUser } from '@/lib/reportError';
import { useBranding, useSession } from '@/features/auth/api';
import { useUi } from '@/store/ui';
import { t } from './i18n';
import { applyTokens } from '@/theme/themes';

const Devtools = env.isDev ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools }))) : null;

function ThemeSync() {
  const brand = useUi((s) => s.brand);
  const uiMode = useUi((s) => s.uiMode);
  useEffect(() => applyTokens(brand, uiMode), [brand, uiMode]);
  return null;
}

/** Points the tab icon at the uploaded platform favicon once branding loads (signed in or not). */
function FaviconSync() {
  const url = useBranding()?.faviconUrl;
  useEffect(() => {
    if (!url) return undefined;
    setFavicon(url);
    return () => setFavicon(null);
  }, [url]);
  return null;
}

/** Sets the `<link rel="icon">` href (creating the link if missing); `null` restores the built-in icon. */
function setFavicon(href: string | null) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  link.dataset.default ??= link.getAttribute('href') ?? '';
  // The built-in icon is SVG and uploads are PNG/JPEG/WebP: let the browser sniff the type.
  link.removeAttribute('type');
  const next = href ?? link.dataset.default;
  if (next) link.href = next;
  else link.remove();
}

/**
 * A 401 anywhere (or a 419 that a fresh CSRF token didn't fix) means the session expired: drop every cached screen and
 * show the login screen. The other tabs share the session cookie: a sign-out there signs this tab out, and another
 * person signing in there replaces this tab's session (its cache is dropped before the new person's data loads).
 */
function SessionExpiry() {
  const qc = useQueryClient();
  useEffect(
    () =>
      onUnauthenticated(() => {
        if (!qc.getQueryData(authKeys.me)) {
          qc.setQueryData(authKeys.me, null);
          return;
        }
        useUi.getState().toast(t('sessionExpired'), 'error');
        resetSessionState(qc, null);
      }),
    [qc],
  );
  useEffect(
    () =>
      listenSession(({ userId }) => {
        const me = qc.getQueryData<User | null>(authKeys.me);
        if (me && me.id === userId) return;
        if (me) resetSessionState(qc, null, { announce: false });
        if (userId) void qc.invalidateQueries({ queryKey: authKeys.me });
      }),
    [qc],
  );
  return null;
}

/** `client` is created in main.tsx before the router, so route loaders can prefetch on the very first navigation. */
/** Tags error reports with the signed-in staff member (id + role). */
function ReportingUser() {
  const { data: user } = useSession();
  useEffect(() => setReportingUser(user ? { id: user.id, role: user.role } : null), [user]);
  return null;
}

export function AppProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ThemeSync />
      <FaviconSync />
      <SessionExpiry />
      <ReportingUser />
      {children}
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools buttonPosition="bottom-right" />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
