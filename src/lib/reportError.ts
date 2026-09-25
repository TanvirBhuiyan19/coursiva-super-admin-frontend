import { env } from '@/config/env';

/**
 * Single hook for error reporting. Wire a provider (e.g. Sentry) here when VITE_SENTRY_DSN is set;
 * until then errors go to the console in development.
 */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (env.sentryDsn) {
    // TODO(observability): initialise @sentry/react with env.sentryDsn and call Sentry.captureException(error, { extra: context }).
  }
  if (env.isDev) console.error('[reportError]', error, context);
}
