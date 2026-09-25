import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { preloadScreen } from '@/app/pages';
import { rememberPermissions, permissionHint } from '@/features/auth/permissionHint';
import { validateCode, validateCredentials } from '@/features/auth/validation';
import type { User } from '@/features/auth/types';
import { lazyWithPreload } from './lazy';
import { setActiveQueryClient } from './queryClient';

const user = (permissions: User['permissions']): User => ({
  id: 'st_x',
  name: 'X',
  email: 'x@coursiva.io',
  role: 'Support',
  twoFactorEnabled: true,
  permissions,
  idleLockMinutes: 15,
});

describe('lazyWithPreload', () => {
  it('shares one request between preload() and render', async () => {
    const load = vi.fn(() => Promise.resolve({ default: () => null }));
    const C = lazyWithPreload(load);
    await Promise.all([C.preload(), C.preload()]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('login validation (no zod on the critical path)', () => {
  it('validates credentials and codes', () => {
    expect(validateCredentials('nope', '')).toEqual({ email: 'Enter a valid email address.', password: 'Enter your password.' });
    expect(validateCredentials(' sam@coursiva.io ', 'x')).toEqual({});
    expect(validateCode('12 34 56')).toEqual({});
    expect(validateCode('12345')).toHaveProperty('code');
  });
});

describe('permission hint', () => {
  it('round-trips and clears', () => {
    rememberPermissions(user(['tenants.view']));
    expect(permissionHint()).toEqual(['tenants.view']);
    rememberPermissions(null);
    expect(permissionHint()).toBeNull();
  });
});

describe('preloadScreen', () => {
  it('prefetches a screen’s data only when the session allows it', async () => {
    const qc = new QueryClient();
    setActiveQueryClient(qc);
    const query = vi.spyOn(qc, 'query').mockResolvedValue(undefined);

    qc.setQueryData(['auth', 'me'], user(['support.view']));
    preloadScreen('tenants'); // no tenants.view → no data prefetch
    await vi.waitFor(() => expect(query).not.toHaveBeenCalled());

    qc.setQueryData(['auth', 'me'], user(['tenants.view']));
    preloadScreen('audit'); // no audit.view
    preloadScreen('staff'); // no staff.view
    await new Promise((r) => setTimeout(r, 20));
    expect(query).not.toHaveBeenCalled();

    qc.setQueryData(['auth', 'me'], user(['tenants.view', 'analytics.view']));
    preloadScreen('growth'); // allowed → its primary query is warmed
    await vi.waitFor(() => expect(query).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['analytics', 'growth'] })));
  });
});
