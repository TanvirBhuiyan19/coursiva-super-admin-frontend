// Loaded only via dynamic import from reportError.ts. Static *named* imports let the bundler tree-shake the
// SDK down to error reporting (no tracing, session replay or feedback widget).
import {
  breadcrumbsIntegration,
  captureException,
  dedupeIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
  setUser,
} from '@sentry/browser';

/** Headers that must never leave the browser. */
const SENSITIVE = /authorization|cookie|x-xsrf-token|password|token|secret/i;

export function start(options: { dsn: string; release: string; environment: string }) {
  init({
    ...options,
    defaultIntegrations: false,
    integrations: [
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      breadcrumbsIntegration({ dom: true, fetch: true, history: true, xhr: false }),
      httpContextIntegration(),
    ],
    // Errors only; performance is measured by our own Web Vitals RUM (src/lib/vitals.ts).
    tracesSampleRate: 0,
    // Collect no personal data: no user info, cookies, headers, bodies or query strings.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    // Not actionable (network blips already surface as handled NetworkError toasts).
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications', /^NetworkError/],
    beforeSend(event) {
      const headers = event.request?.headers;
      if (headers) for (const k of Object.keys(headers)) if (SENSITIVE.test(k)) headers[k] = '[redacted]';
      if (event.request?.data) event.request.data = '[redacted]';
      if (event.request?.cookies) event.request.cookies = {};
      return event;
    },
    beforeBreadcrumb(crumb) {
      // Keep API breadcrumbs but drop query strings (search terms may contain personal data).
      if (crumb.category === 'fetch' && typeof crumb.data?.url === 'string') crumb.data.url = crumb.data.url.split('?')[0];
      return crumb;
    },
  });
}

export { captureException, setUser };
