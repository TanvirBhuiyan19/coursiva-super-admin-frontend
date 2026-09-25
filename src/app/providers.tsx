import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { env } from '@/config/env';
import { authKeys } from '@/features/auth/api';
import { onUnauthenticated } from '@/lib/api/client';
import { setReportingUser } from '@/lib/reportError';
import { useSession } from '@/features/auth/api';
import { useUi } from '@/store/ui';
import { applyTokens } from '@/theme/themes';

const Devtools = env.isDev ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools }))) : null;

function ThemeSync() {
  const brand = useUi((s) => s.brand);
  const uiMode = useUi((s) => s.uiMode);
  useEffect(() => applyTokens(brand, uiMode), [brand, uiMode]);
  return null;
}

/** A 401/419 anywhere means the session expired: drop cached data and show the login screen. */
function SessionExpiry() {
  const qc = useQueryClient();
  useEffect(
    () =>
      onUnauthenticated(() => {
        if (qc.getQueryData(authKeys.me)) useUi.getState().toast('Your session expired. Sign in again to continue.', 'error');
        qc.setQueryData(authKeys.me, null);
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
