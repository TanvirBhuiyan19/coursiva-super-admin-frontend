// Typed access to build-time environment variables. Import from here, never from import.meta.env directly.
const bool = (v: string | undefined, fallback: boolean) => (v == null || v === '' ? fallback : v === 'true');

export const env = {
  apiUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, ''),
  apiPrefix: import.meta.env.VITE_API_PREFIX ?? '/api/v1/admin',
  enableMocks: bool(import.meta.env.VITE_ENABLE_MOCKS, import.meta.env.DEV),
  sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? '',
  /** Where Web Vitals beacons go (empty disables RUM). */
  vitalsEndpoint: import.meta.env.VITE_VITALS_ENDPOINT ?? '',
  /** Build identifier attached to telemetry (set by CI, e.g. the git SHA). */
  release: import.meta.env.VITE_RELEASE ?? 'dev',
  isDev: import.meta.env.DEV,
  isTest: import.meta.env.MODE === 'test',
} as const;

/** Absolute (or same-origin) URL for an API path like `/tenants`. */
export const apiUrl = (path: string) => `${env.apiUrl}${env.apiPrefix}${path}`;
/** Root of the backend (for Sanctum's `/sanctum/csrf-cookie`). */
export const backendUrl = (path: string) => `${env.apiUrl}${path}`;
