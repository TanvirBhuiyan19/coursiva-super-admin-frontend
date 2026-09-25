// Single HTTP client for the Laravel API.
// - Sanctum SPA auth: cookies (credentials: 'include') + X-XSRF-TOKEN from the XSRF-TOKEN cookie.
// - snake_case on the wire, camelCase in the app.
// - Every failure becomes an ApiError (HTTP) or NetworkError (no response).
import { apiUrl, backendUrl } from '@/config/env';
import { camelizeKeys, snakeizeKeys, toSnake } from './case';
import { ApiError, NetworkError, type FieldErrors } from './errors';

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
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

async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  if (method !== 'GET') await ensureCsrf();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...opts.headers,
  };
  const xsrf = readCookie('XSRF-TOKEN');
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
  let body: string | undefined;
  if (opts.body !== undefined) {
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

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const p = (payload ?? {}) as { message?: string; errors?: FieldErrors; code?: string };
    const fieldErrors = camelizeKeys<FieldErrors>(p.errors ?? {});
    const error = new ApiError(res.status, p.message ?? (res.statusText || 'Request failed'), fieldErrors, p.code);
    if (error.isUnauthenticated && !path.startsWith('/auth/login')) unauthenticatedListeners.forEach((fn) => fn());
    throw error;
  }
  return camelizeKeys<T>(payload);
}

/** Downloads a file endpoint (e.g. CSV export) and saves it via the browser. */
async function download(path: string, query?: Query, fallbackName = 'export') {
  let res: Response;
  try {
    res = await fetch(apiUrl(path) + buildQuery(query), { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include' });
  } catch (err) {
    throw new NetworkError(err);
  }
  if (!res.ok) {
    const p = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, p.message ?? 'Download failed');
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
