// Single HTTP client for the Laravel API.
// - Sanctum SPA auth: cookies (credentials: 'include') + X-XSRF-TOKEN from the XSRF-TOKEN cookie.
// - snake_case on the wire, camelCase in the app.
// - Every failure becomes an ApiError (HTTP) or NetworkError (no response).
import { apiUrl, backendUrl } from '@/config/env';
import { intlLocale } from '@/lib/i18n';
import { camelizeKeys, snakeizeKeys, toSnake } from './case';
import { ApiError, NetworkError, type FieldErrors } from './errors';

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Internal: set on the retry after a password confirmation, so a request is retried at most once. */
  confirmed?: boolean;
  /** Internal: set on the retry after a 419 (CSRF token refreshed), so a request is retried at most once. */
  csrfRetried?: boolean;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const unauthenticatedListeners = new Set<() => void>();
/** Subscribe to 401/419 responses (session expired). Returns an unsubscribe function. */
export function onUnauthenticated(fn: () => void) {
  unauthenticatedListeners.add(fn);
  return () => {
    unauthenticatedListeners.delete(fn);
  };
}

/**
 * Bumped on every sign-in and sign-out: a 401 answering a request sent under the previous identity says nothing about
 * the new session, so it never signs the new one out.
 */
let epoch = 0;
export function bumpSessionEpoch() {
  epoch += 1;
}

// Step-up authentication: a sensitive change answers 423 password_confirmation_required when the password was
// not entered recently. The shell registers a handler that asks for the password (one prompt for any number of
// waiting requests) and resolves true once it is confirmed; the request is then retried once.
let confirmHandler: (() => Promise<boolean>) | null = null;
let pendingConfirm: Promise<boolean> | null = null;
/** Registers the password prompt. Returns an unregister function. */
export function onPasswordConfirmationRequired(fn: () => Promise<boolean>) {
  confirmHandler = fn;
  return () => {
    if (confirmHandler === fn) confirmHandler = null;
  };
}
function confirmPassword(): Promise<boolean> {
  if (!confirmHandler) return Promise.resolve(false);
  pendingConfirm ??= confirmHandler().finally(() => {
    pendingConfirm = null;
  });
  return pendingConfirm;
}

function readCookie(name: string) {
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

let csrfReady: Promise<void> | null = null;
/** Fetches Sanctum's CSRF cookie once per page load (before the first state-changing request). */
export function ensureCsrf(force = false) {
  if (!csrfReady || force) {
    csrfReady = fetch(backendUrl('/sanctum/csrf-cookie'), { credentials: 'include' })
      .then(() => undefined)
      .catch(() => {
        csrfReady = null;
      });
  }
  return csrfReady;
}

let csrfRefresh: Promise<void> | null = null;
/** A fresh CSRF cookie after a 419 (one request for any number of requests that failed together). */
function refreshCsrf() {
  csrfRefresh ??= ensureCsrf(true).finally(() => {
    csrfRefresh = null;
  });
  return csrfRefresh;
}

function buildQuery(query?: Query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(toSnake(k), String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Marks a body that is not JSON (an HTML error page from a proxy, a truncated response). */
const INVALID = Symbol('invalid-json');

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return INVALID;
  }
}

/** The message for an error response without a JSON body (it came from a proxy or load balancer, not Laravel). */
function fallbackMessage(res: Response) {
  if (res.status === 413) return 'That is too large to send. Try a smaller file or less content.';
  if (res.status === 502 || res.status === 503 || res.status === 504)
    return 'The server is not responding right now. Try again in a moment.';
  return res.statusText || 'Request failed';
}

async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  if (method !== 'GET') await ensureCsrf();
  const sentAt = epoch;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Laravel localises validation and error messages from this (SetLocale middleware).
    'Accept-Language': intlLocale(),
    'X-Requested-With': 'XMLHttpRequest',
    ...opts.headers,
  };
  const xsrf = readCookie('XSRF-TOKEN');
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
  let body: string | FormData | undefined;
  // Multipart uploads go as-is: the browser sets the boundary, and form field names are already wire names.
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(snakeizeKeys(opts.body));
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path) + buildQuery(opts.query), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: opts.signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NetworkError(err);
  }

  // 419: the CSRF token went stale (rotated by a sign-in in another tab, or expired with the page left open). The session
  // itself may be fine: fetch a fresh token and retry once before treating it as a signed-out session.
  if (res.status === 419 && !opts.csrfRetried) {
    await refreshCsrf();
    return request<T>(method, path, { ...opts, csrfRetried: true });
  }

  if (res.status === 204) return undefined as T;
  const payload = parseJson(await res.text());

  // A 2xx that isn't JSON means something between us and Laravel answered (e.g. the SPA's index.html from a
  // misrouted proxy): fail loudly as an ApiError rather than hand HTML to the app.
  if (res.ok && payload === INVALID) throw new ApiError(res.status, 'The server sent an unexpected response.');

  if (!res.ok) {
    // Proxies answer 413/502/504 with HTML or nothing: keep the status, use a generic message.
    const p = (payload === INVALID ? {} : (payload ?? {})) as { message?: string; errors?: FieldErrors; code?: string };
    const fieldErrors = camelizeKeys<FieldErrors>(p.errors ?? {});
    const error = new ApiError(res.status, p.message ?? fallbackMessage(res), fieldErrors, p.code);
    if (error.isUnauthenticated && !path.startsWith('/auth/login') && sentAt === epoch) unauthenticatedListeners.forEach((fn) => fn());
    if (error.isPasswordConfirmationRequired && !opts.confirmed && (await confirmPassword()))
      return request<T>(method, path, { ...opts, confirmed: true });
    throw error;
  }
  return camelizeKeys<T>(payload);
}

/** Downloads a file endpoint (e.g. CSV export) and saves it via the browser. */
async function download(path: string, query?: Query, fallbackName = 'export', confirmed = false): Promise<string> {
  const sentAt = epoch;
  let res: Response;
  try {
    res = await fetch(apiUrl(path) + buildQuery(query), { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
  } catch (err) {
    throw new NetworkError(err);
  }
  if (!res.ok) {
    const parsed = parseJson(await res.text().catch(() => ''));
    const p = (parsed === INVALID ? {} : (parsed ?? {})) as { message?: string; code?: string };
    const error = new ApiError(
      res.status,
      p.message ?? (res.status >= 500 || res.status === 413 ? fallbackMessage(res) : 'Download failed'),
      {},
      p.code,
    );
    // An expired session ends the client session here too, exactly like any other request.
    if (error.isUnauthenticated && sentAt === epoch) unauthenticatedListeners.forEach((fn) => fn());
    // A re-authenticated export (the partner 1099 worksheet): confirm the password once, then try again.
    if (error.isPasswordConfirmationRequired && !confirmed && (await confirmPassword())) return download(path, query, fallbackName, true);
    throw error;
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export const api = {
  download,
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  delete: <T = void>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
};
