import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { authKeys, resetSessionState } from '@/features/auth/api';
import type { User } from '@/features/auth/types';
import { api, bumpSessionEpoch, onUnauthenticated } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { createQueryClient } from '@/lib/queryClient';
import { route } from '@/mocks/http';
import { server } from '@/mocks/server';
import { renderApp } from '@/test/utils';
import { AppProviders } from './providers';

const PREVIOUS = ['tenants', 'list', 'previous-user'] as const;
const sam = { id: 'st_sam', name: 'Sam', email: 'sam@coursiva.io', role: 'Owner', permissions: [] } as unknown as User;

function renderProviders(me: User | null) {
  bumpSessionEpoch();
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity } });
  client.setQueryData(authKeys.me, me);
  client.setQueryData(PREVIOUS, { secret: 'previous staff data' });
  render(
    <AppProviders client={client}>
      <main>console</main>
    </AppProviders>,
  );
  return client;
}

/** Another tab's announcement, as a `storage` event (the fallback transport). */
function fromOtherTab(userId: string | null) {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'console-session-signal',
      newValue: JSON.stringify({ tab: 'other-tab', at: Date.now(), userId }),
    }),
  );
}

describe('session safety', () => {
  it('drops every cached screen on sign-in, so the next person never sees the previous one’s data', async () => {
    const { user, client } = renderApp('/login');
    client.setQueryData(PREVIOUS, { secret: 'previous staff data' });
    await user.type(await screen.findByLabelText('Work email'), 'lee@coursiva.io');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(client.getQueryData<User>(authKeys.me)?.email).toBe('lee@coursiva.io'));
    expect(client.getQueryData(PREVIOUS)).toBeUndefined();
  });

  it('resetSessionState keeps only the session and public branding', () => {
    const client = createQueryClient();
    client.setQueryData(PREVIOUS, { secret: 'x' });
    client.setQueryData(authKeys.branding, { name: 'Coursiva' });
    resetSessionState(client, null, { announce: false });
    expect(client.getQueryData(PREVIOUS)).toBeUndefined();
    expect(client.getQueryData(authKeys.branding)).toEqual({ name: 'Coursiva' });
    expect(client.getQueryData(authKeys.me)).toBeNull();
  });

  it('a 401 ends the session and drops the cache', async () => {
    const client = renderProviders(sam);
    server.use(http.get(route('/secret'), () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })));
    await expect(api.get('/secret')).rejects.toBeInstanceOf(ApiError);
    await waitFor(() => expect(client.getQueryData(authKeys.me)).toBeNull());
    expect(client.getQueryData(PREVIOUS)).toBeUndefined();
  });

  it('signs this tab out when another tab signs out', async () => {
    const client = renderProviders(sam);
    fromOtherTab(null);
    await waitFor(() => expect(client.getQueryData(authKeys.me)).toBeNull());
    expect(client.getQueryData(PREVIOUS)).toBeUndefined();
  });

  it('drops the previous person’s data when someone else signs in in another tab', async () => {
    const client = renderProviders(sam);
    fromOtherTab('st_lee');
    await waitFor(() => expect(client.getQueryData(PREVIOUS)).toBeUndefined());
  });

  it('ignores an announcement of the identity it already has', async () => {
    const client = renderProviders(sam);
    fromOtherTab('st_sam');
    await new Promise((r) => setTimeout(r, 20));
    expect(client.getQueryData(PREVIOUS)).toEqual({ secret: 'previous staff data' });
  });
});

describe('419 CSRF mismatch', () => {
  it('refreshes the CSRF cookie and retries once instead of signing out', async () => {
    const ended = vi.fn();
    const off = onUnauthenticated(ended);
    let csrfCalls = 0;
    let attempts = 0;
    server.use(
      http.get('*/sanctum/csrf-cookie', () => {
        csrfCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(route('/echo'), () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ message: 'CSRF token mismatch.', code: 'csrf_token_mismatch' }, { status: 419 })
          : HttpResponse.json({ data: { ok: true } });
      }),
    );
    const res = await api.post<{ data: { ok: boolean } }>('/echo', {});
    expect(res.data.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(csrfCalls).toBeGreaterThanOrEqual(1);
    expect(ended).not.toHaveBeenCalled();
    off();
  });

  it('a second 419 is a lost session', async () => {
    bumpSessionEpoch();
    const ended = vi.fn();
    const off = onUnauthenticated(ended);
    let attempts = 0;
    server.use(
      http.post(route('/echo'), () => {
        attempts += 1;
        return HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 });
      }),
    );
    await expect(api.post('/echo', {})).rejects.toMatchObject({ status: 419 });
    expect(attempts).toBe(2);
    expect(ended).toHaveBeenCalledOnce();
    off();
  });
});
