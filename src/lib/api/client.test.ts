import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/mocks/server';
import { route } from '@/mocks/http';
import { camelizeKeys, snakeizeKeys } from './case';
import { api, onUnauthenticated } from './client';
import { ApiError, NetworkError } from './errors';

describe('case conversion', () => {
  it('round-trips nested keys', () => {
    const snake = { owner_email: 'a@b.c', health_score: { churn_risk: 'Low' }, rows: [{ trial_ends_at: null }] };
    const camel = camelizeKeys<Record<string, unknown>>(snake);
    expect(camel).toEqual({ ownerEmail: 'a@b.c', healthScore: { churnRisk: 'Low' }, rows: [{ trialEndsAt: null }] });
    expect(snakeizeKeys(camel)).toEqual(snake);
  });
});

describe('api client', () => {
  it('sends snake_case and returns camelCase', async () => {
    let received: unknown;
    server.use(
      http.post(route('/echo'), async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ data: { created_at: 'x' } });
      }),
    );
    const res = await api.post<{ data: { createdAt: string } }>('/echo', { ownerEmail: 'a@b.c' });
    expect(received).toEqual({ owner_email: 'a@b.c' });
    expect(res.data.createdAt).toBe('x');
  });

  it('maps Laravel 422 errors to camelCase field errors', async () => {
    server.use(
      http.post(route('/echo'), () => HttpResponse.json({ message: 'Invalid', errors: { owner_email: ['Bad email'] } }, { status: 422 })),
    );
    const err = await api.post('/echo', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isValidation).toBe(true);
    expect((err as ApiError).field('ownerEmail')).toBe('Bad email');
  });

  it('notifies listeners on 401 so the session can end', async () => {
    const spy = vi.fn();
    const off = onUnauthenticated(spy);
    server.use(http.get(route('/secret'), () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })));
    await expect(api.get('/secret')).rejects.toBeInstanceOf(ApiError);
    expect(spy).toHaveBeenCalledOnce();
    off();
  });

  it('wraps network failures', async () => {
    server.use(http.get(route('/down'), () => HttpResponse.error()));
    await expect(api.get('/down')).rejects.toBeInstanceOf(NetworkError);
  });
});
