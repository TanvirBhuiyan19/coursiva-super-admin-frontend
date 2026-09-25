import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ start: vi.fn(), captureException: vi.fn(), setUser: vi.fn() }));
vi.mock('./sentry', () => sentry);
vi.mock('@/config/env', () => ({ env: { sentryDsn: 'https://key@o0.ingest.sentry.io/1', release: 'test-sha', isDev: false } }));

describe('reportError', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(sentry).forEach((fn) => fn.mockClear());
  });

  it('queues errors until Sentry loads, then flushes them in order', async () => {
    const { reportError, initErrorReporting } = await import('./reportError');
    const early = new Error('before init');
    reportError(early, { where: 'boot' });
    expect(sentry.captureException).not.toHaveBeenCalled();

    await initErrorReporting();
    expect(sentry.start).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://key@o0.ingest.sentry.io/1', release: 'test-sha' }));
    expect(sentry.captureException).toHaveBeenCalledWith(early, { extra: { where: 'boot' } });

    const late = new Error('after init');
    reportError(late);
    expect(sentry.captureException).toHaveBeenLastCalledWith(late, { extra: undefined });
  });

  it('identifies the user by id and role only', async () => {
    const { initErrorReporting, setReportingUser } = await import('./reportError');
    await initErrorReporting();
    setReportingUser({ id: 'st_sam', role: 'Owner' });
    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'st_sam', segment: 'Owner' });
    setReportingUser(null);
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
  });
});
