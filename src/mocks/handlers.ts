// Aggregates every feature's mock handlers. Each feature exports `handlers` from `features/<name>/mock.ts`
// (auto-discovered, so adding a feature never touches this file).
import { http, HttpResponse, type RequestHandler } from 'msw';

const modules = import.meta.glob<{ handlers: RequestHandler[] }>('../features/**/mock.ts', { eager: true });

export const handlers: RequestHandler[] = [
  // Sanctum: sets the XSRF-TOKEN cookie in a real backend.
  http.get('*/sanctum/csrf-cookie', () => new HttpResponse(null, { status: 204 })),
  ...Object.values(modules).flatMap((m) => m.handlers),
];
