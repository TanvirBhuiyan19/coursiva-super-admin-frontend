import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { env } from '@/config/env';
import { server } from '@/mocks/server';
import { route } from '@/mocks/http';
import { api, onUnauthenticated } from './client';
import { ApiError } from './errors';

const html = (status: number) =>
  new HttpResponse('<html><body><h1>' + String(status) + '</h1>nginx</body></html>', { status, headers: { 'Content-Type': 'text/html' } });

describe('deployment defaults', () => {
  it('talks to the Laravel surface by default (the mock API mounts on the same prefix)', () => {
    expect(env.apiPrefix).toBe('/api/v1/platform');
  });
});

describe('non-JSON responses from proxies', () => {
  it.each([
    [413, 'too large'],
    [502, 'not responding'],
    [504, 'not responding'],
  ])('turns an HTML %i page into an ApiError with the status and a generic message', async (status, text) => {
    server.use(http.post(route('/echo'), () => html(status)));
    const err = await api.post('/echo', { a: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(status);
    expect((err as ApiError).message).toContain(text);
  });

  it('turns an empty error body into an ApiError', async () => {
    server.use(http.get(route('/empty'), () => new HttpResponse(null, { status: 502 })));
    const err = await api.get('/empty').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
  });

  it('rejects a 200 that is not JSON (e.g. index.html from a misrouted proxy)', async () => {
    server.use(http.get(route('/html'), () => html(200)));
    const err = await api.get('/html').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain('unexpected response');
  });
});

describe('downloads', () => {
  it('ends the session on 401, like any other request', async () => {
    const spy = vi.fn();
    const off = onUnauthenticated(spy);
    server.use(http.get(route('/export.csv'), () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })));
    const err = await api.download('/export.csv').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(spy).toHaveBeenCalledOnce();
    off();
  });

  it('reports an HTML 504 from the proxy as an ApiError', async () => {
    server.use(http.get(route('/export.csv'), () => html(504)));
    const err = await api.download('/export.csv').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toContain('not responding');
  });
});
