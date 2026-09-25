import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
