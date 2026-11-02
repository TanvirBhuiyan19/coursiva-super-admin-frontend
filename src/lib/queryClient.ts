import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { toast } from '@/store/ui';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** Set false when the UI shows the error itself (e.g. inline form validation). Default: toast. */
      errorToast?: boolean;
    };
  }
}

/** Don't retry client errors (4xx) — they won't fix themselves. Retry network/5xx twice. */
const retry = (count: number, error: unknown) => !(error instanceof ApiError && error.status < 500) && count < 2;

export function createQueryClient() {
  // 403 two_factor_setup_required: the platform began requiring staff 2FA mid-session. Refreshing the session
  // (`twoFactorSetupRequired`) lets the auth guard send the member to Account → Security.
  const onSetupRequired = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'two_factor_setup_required')
      void client.invalidateQueries({ queryKey: ['auth', 'me'] });
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: onSetupRequired }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        onSetupRequired(error);
        if (mutation.meta?.errorToast === false) return;
        toast(errorMessage(error), 'error');
      },
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
  return client;
}

/** 401/419 (session expired) or 403 (access withdrawn): retrying or polling can't fix it. */
export const isAuthFailure = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 419);

/** How often a self-refreshing ("live") screen refetches. Only the overview and the system status use it. */
export const LIVE_REFRESH_MS = 60_000;

/**
 * Query options for a live screen: refetch every minute while the tab is visible (TanStack pauses hidden tabs), stop
 * for good after an auth failure, and retry network/5xx failures at most 3 times with exponential backoff (1 s, 2 s,
 * 4 s, capped at 30 s). The query only runs while its screen is mounted, i.e. signed in, inside the shell.
 */
/** A `refetchInterval` that polls every `ms` until the query fails with an auth error, then stops. */
export const pollUnlessAuthFailed =
  (ms: number) =>
  (query: { state: { error: unknown } }): number | false =>
    isAuthFailure(query.state.error) ? false : ms;

export const live = {
  refetchInterval: pollUnlessAuthFailed(LIVE_REFRESH_MS),
  refetchIntervalInBackground: false,
  retry: (count: number, error: Error) => !(error instanceof ApiError && error.status < 500) && count < 3,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
} as const;

export type LiveState = 'live' | 'updating' | 'offline' | 'paused';

/** The live state of a self-refreshing query: paused after an auth failure (polling stopped), offline while failing. */
export function liveState(q: { error: unknown; isError: boolean; failureCount: number; isFetching: boolean }): LiveState {
  if (isAuthFailure(q.error)) return 'paused';
  if (q.isError || q.failureCount > 0) return 'offline';
  return q.isFetching ? 'updating' : 'live';
}

// The app's live QueryClient, for code outside React (route preloading, prefetch-on-intent).
let activeClient: QueryClient | null = null;
export const setActiveQueryClient = (client: QueryClient) => {
  activeClient = client;
};
export const getActiveQueryClient = () => activeClient;

/**
 * Warms a query in the background: `warm(qc.query(options))`. `query()` returns cached data while it's fresh
 * (staleTime) and fetches otherwise; failures are swallowed — the real query retries when the screen mounts.
 */
export function warm(pending: Promise<unknown>) {
  void pending.catch(() => undefined);
}
