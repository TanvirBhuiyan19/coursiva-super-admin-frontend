import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';
import { audit, platformSettings } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';

const MIN = 60_000;

describe('idle lock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    platformSettings.patch({ idleLockMinutes: 5 });
    signInAs('Owner');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = async () => {
    const utils = renderApp('/audit');
    await screen.findByRole('heading', { level: 1, name: 'Audit log' });
    return { ...utils, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) };
  };

  it('warns a minute before the limit, and staying signed in resets the clock', async () => {
    const { user } = await setup();
    await act(() => vi.advanceTimersByTimeAsync(4 * MIN + 5_000));
    const warning = await screen.findByRole('dialog', { name: 'Session about to lock' });
    expect(within(warning).getByText(/locks in/)).toBeInTheDocument();
    await user.click(within(warning).getByRole('button', { name: 'Stay signed in' }));
    expect(screen.queryByRole('dialog', { name: 'Session about to lock' })).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3 * MIN));
    expect(screen.queryByRole('dialog', { name: /Console locked|Session about to lock/ })).not.toBeInTheDocument();
  });

  it('locks after the limit, makes the app inert, and unlocks with the password', async () => {
    const { user, container } = await setup();
    await act(() => vi.advanceTimersByTimeAsync(5 * MIN + 2_000));
    const lock = await screen.findByRole('dialog', { name: 'Console locked' });
    expect(container.querySelector('.shell')).toHaveAttribute('inert');
    expect(localStorage.getItem('sac-locked')).not.toBeNull();

    await user.type(within(lock).getByLabelText('Password'), 'wrong');
    await user.click(within(lock).getByRole('button', { name: 'Unlock' }));
    expect(await within(lock).findByText('The provided password was incorrect.')).toBeInTheDocument();

    await user.type(within(lock).getByLabelText('Password'), 'password');
    await user.click(within(lock).getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Console locked' })).not.toBeInTheDocument());
    expect(container.querySelector('.shell')).not.toHaveAttribute('inert');
    expect(localStorage.getItem('sac-locked')).toBeNull();
    expect(audit.all().some((a) => a.action === 'Unlocked the console after an idle lock')).toBe(true);
  });

  it('stays locked across a reload and follows other tabs', async () => {
    localStorage.setItem('sac-locked', String(Date.now()));
    localStorage.setItem('sac-last-activity', String(Date.now() - 10 * MIN));
    await setup();
    expect(await screen.findByRole('dialog', { name: 'Console locked' })).toBeInTheDocument();
    // Another tab unlocks → this one follows.
    act(() => {
      localStorage.removeItem('sac-locked');
      window.dispatchEvent(new StorageEvent('storage', { key: 'sac-locked', newValue: null }));
      localStorage.setItem('sac-last-activity', String(Date.now()));
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Console locked' })).not.toBeInTheDocument());
  });

  it('the idle lock length is a validated platform setting that /auth/me reports', async () => {
    await expect(api.patch('/settings', { idleLockMinutes: 7 })).rejects.toMatchObject({ status: 422 });
    await api.patch('/settings', { idleLockMinutes: 30 });
    const me = await api.get<{ data: { idleLockMinutes: number } }>('/auth/me');
    expect(me.data.idleLockMinutes).toBe(30);
  });
});
