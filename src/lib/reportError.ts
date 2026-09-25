// Error reporting. Sentry is loaded lazily and only when VITE_SENTRY_DSN is set, so it costs nothing on the
// critical path (or at all, when disabled). Errors raised before it has loaded are queued and flushed.
import { env } from '@/config/env';
import type * as SentryNs from './sentry';

type SentryModule = typeof SentryNs;
type Queued = { error: unknown; context: Record<string, unknown> | undefined };

let sentry: SentryModule | null = null;
const queue: Queued[] = [];

export async function initErrorReporting() {
  if (!env.sentryDsn || sentry) return;
  const S = await import('./sentry');
  S.start({ dsn: env.sentryDsn, release: env.release, environment: import.meta.env.MODE });
  sentry = S;
  for (const { error, context } of queue.splice(0)) S.captureException(error, { extra: context });
}

/** Associates reports with the signed-in staff member (id + role only — no email or name). */
export function setReportingUser(user: { id: string; role: string } | null) {
  sentry?.setUser(user ? { id: user.id, segment: user.role } : null);
}

/** Single entry point for reporting an error from anywhere in the app. */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (env.isDev) console.error('[reportError]', error, context);
  if (!env.sentryDsn) return;
  if (sentry) sentry.captureException(error, { extra: context });
  else if (queue.length < 20) queue.push({ error, context });
}
