import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { notifications } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';

describe('app shell accessibility', () => {
  it('moves focus to the content and announces the screen after client-side navigation', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants');
    await screen.findByRole('heading', { name: 'Tenants', level: 1 });
    const status = () => screen.getAllByRole('status').find((el) => el.classList.contains('sr-only'));
    expect(status()?.textContent).toBe(''); // nothing announced on first load

    await user.click(screen.getByRole('link', { name: /support/i }));
    await waitFor(() => expect(status()?.textContent).toBe('Support page'));
    expect(document.activeElement).toBe(document.getElementById('main'));
  });

  it('keeps focus in place for routes within the same screen (tenant drawer)', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants');
    await user.click(await screen.findByRole('link', { name: 'Amplify Coaching' }));
    const drawer = await screen.findByRole('dialog', { name: 'Amplify Coaching' });
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
  });
});

describe('notifications panel', () => {
  it('shows the newest 30 and appends older pages with Load older', async () => {
    signInAs('Owner');
    for (let i = 0; i < 70; i++)
      notifications.insert({
        id: `nt_old_${String(i).padStart(2, '0')}`,
        text: `Older notice ${i}`,
        tone: 'warn',
        createdAt: new Date(Date.now() - (i + 5) * 86_400_000).toISOString(),
        readAt: new Date().toISOString(),
        href: null,
      });
    const { user } = renderApp('/tenants');
    await screen.findByRole('heading', { name: 'Tenants', level: 1 });
    // The unread dot still counts the first page's unread rows (4 seeded).
    await user.click(await screen.findByRole('button', { name: 'Notifications, 4 unread' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    // 4 seeded rows + the 26 newest older notices = the first page of 30.
    expect(within(panel).getByText('Older notice 25')).toBeInTheDocument();
    expect(within(panel).queryByText('Older notice 26')).not.toBeInTheDocument();
    await user.click(await within(panel).findByRole('button', { name: 'Load older' }));
    expect(await within(panel).findByText('Older notice 55')).toBeInTheDocument();
    expect(within(panel).queryByText('Older notice 56')).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Load older' }));
    expect(await within(panel).findByText('Older notice 69')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Load older' })).not.toBeInTheDocument();
  });
});
