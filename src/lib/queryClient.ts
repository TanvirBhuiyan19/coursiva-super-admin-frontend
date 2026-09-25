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
  return new QueryClient({
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.errorToast === false) return;
        toast(errorMessage(error), 'error');
      },
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
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
