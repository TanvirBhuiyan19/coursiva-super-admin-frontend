// Helpers for writing mock handlers that behave like the Laravel API:
// snake_case JSON, `{ data }` resources, paginated envelopes, 401/403/404/422 errors, server-side audit.
import { delay, http, HttpResponse, type HttpResponseResolver, type PathParams } from 'msw';
import { env } from '@/config/env';
import { camelizeKeys, snakeizeKeys } from '@/lib/api/case';
import type { AuditCategory } from '@/lib/domain';
import { PERMISSIONS, type Permission } from '@/features/auth/permissions';
import { audit, rolePermissions, session, staff, type StaffRow } from './collections';
import { id, saveDb } from './db';

/** Matches the API path on any origin, e.g. route('/tenants/:id'). */
export const route = (path: string) => `*${env.apiPrefix}${path}`;

const latency = () => (env.isTest ? 0 : 120 + Math.round(Math.random() * 180));

export const json = (body: unknown, status = 200) => HttpResponse.json(snakeizeKeys(body), { status });
export const ok = <T>(data: T, status = 200) => json({ data }, status);
export const noContent = () => new HttpResponse(null, { status: 204 });

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found.`);
export const forbidden = () => new HttpError(403, 'This action is unauthorized.');
export const unauthenticated = () => new HttpError(401, 'Unauthenticated.');
/** 422 with Laravel's validation shape. Field names in camelCase (converted on the wire). */
export const invalid = (errors: Record<string, string>) =>
  new HttpError(
    422,
    Object.values(errors)[0] ?? 'The given data was invalid.',
    Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
  );

export async function readBody<T>(request: Request): Promise<T> {
  const text = await request.text();
  return camelizeKeys<T>(text ? JSON.parse(text) : {});
}

export function query(request: Request) {
  const url = new URL(request.url);
  const get = (k: string) => url.searchParams.get(k) ?? undefined;
  return {
    get,
    page: Math.max(1, Number(get('page') ?? 1)),
    perPage: Math.min(100, Math.max(1, Number(get('per_page') ?? 25))),
    search: (get('search') ?? '').trim().toLowerCase(),
    sort: get('sort'),
  };
}

/** Paginates rows into Laravel's `{ data, meta }` envelope. Extra keys merge into `meta`. */
export function paginate<T>(rows: T[], request: Request, extraMeta: Record<string, unknown> = {}) {
  const { page, perPage } = query(request);
  const total = rows.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(page, lastPage);
  const start = (current - 1) * perPage;
  const data = rows.slice(start, start + perPage);
  return json({
    data,
    meta: {
      currentPage: current,
      lastPage,
      perPage,
      total,
      from: total ? start + 1 : null,
      to: total ? start + data.length : null,
      ...extraMeta,
    },
  });
}

/** Sorts by `sort=field` / `sort=-field` using the given accessors. */
export function sortRows<T>(rows: T[], sort: string | undefined, accessors: Record<string, (r: T) => number | string>) {
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const get = accessors[key];
  if (!get) return rows;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return desc ? -cmp : cmp;
  });
}

export function currentUser(): StaffRow | undefined {
  const uid = session.get().userId;
  return uid ? staff.find(uid) : undefined;
}

export function permissionsOf(user: StaffRow): Permission[] {
  const elevated = !!user.elevatedUntil && new Date(user.elevatedUntil).getTime() > Date.now();
  if (user.role === 'Owner' || elevated) return [...PERMISSIONS];
  return [...rolePermissions.get()[user.role]];
}

/** Throws 401 when signed out and 403 when the user lacks the permission. */
export function authorize(permission?: Permission): StaffRow {
  const user = currentUser();
  if (!user) throw unauthenticated();
  if (permission && !permissionsOf(user).includes(permission)) throw forbidden();
  return user;
}

/** Appends an audit entry attributed to the signed-in user. */
export function recordAudit(action: string, category: AuditCategory, tenantId: string | null = null) {
  const user = currentUser();
  audit.insert({
    id: id('au'),
    createdAt: new Date().toISOString(),
    actorId: user?.id ?? null,
    actorName: user?.name ?? 'System',
    action,
    category,
    tenantId,
    ip: '203.0.113.10',
  });
}

type Resolver<Params extends PathParams> = (info: { request: Request; params: Params }) => Response | Promise<Response>;

/**
 * Wraps a resolver with latency, error mapping (HttpError → JSON) and persistence after writes.
 * Use: `http.get(route('/tenants'), handle(({ request }) => …))`.
 */
export function handle<Params extends PathParams = PathParams>(resolver: Resolver<Params>): HttpResponseResolver<Params> {
  return async ({ request, params }) => {
    await delay(latency());
    try {
      const res = await resolver({ request, params });
      if (request.method !== 'GET') saveDb();
      return res;
    } catch (err) {
      if (err instanceof HttpError) return json({ message: err.message, ...(err.errors ? { errors: err.errors } : {}) }, err.status);
      console.error('[mock api]', err);
      return json({ message: 'Server Error' }, 500);
    }
  };
}

export { http };
