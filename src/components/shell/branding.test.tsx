import { render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { createQueryClient } from '@/lib/queryClient';
import { platformSettings } from '@/mocks/collections';
import { route } from '@/mocks/http';
import { server } from '@/mocks/server';
import { useUi } from '@/store/ui';
import { renderApp, signInAs } from '@/test/utils';

const LOGO = 'https://cdn.test/logo.png';
const LOGO_DARK = 'https://cdn.test/logo-dark.png';
const FAVICON = 'https://cdn.test/favicon.png';

function uploadBrand(urls: Partial<Record<'logo' | 'logo_dark' | 'favicon', string>>, platformName = 'Acme Learn') {
  platformSettings.patch({
    platformName,
    brandAssets: platformSettings.get().brandAssets.map((a) => ({ ...a, url: urls[a.slot as keyof typeof urls] ?? null })),
  });
}

afterEach(() => useUi.getState().setUiMode('Light'));

describe('platform branding', () => {
  it('shows the built-in "C" mark and name when no logo is uploaded', async () => {
    signInAs('Owner');
    renderApp('/');
    const home = await screen.findByRole('link', { name: 'Coursiva platform console — home' });
    expect(within(home).getByText('C')).toBeInTheDocument();
    expect(within(home).queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the uploaded logo in the sidebar, preferring the dark-background logo', async () => {
    uploadBrand({ logo: LOGO, logo_dark: LOGO_DARK });
    signInAs('Owner');
    renderApp('/');
    const home = await screen.findByRole('link', { name: 'Acme Learn platform console — home' });
    const logo = within(home).getByRole('img', { name: 'Acme Learn' });
    expect(logo).toHaveAttribute('src', LOGO_DARK);
    expect(within(home).queryByText('C')).not.toBeInTheDocument();
  });

  it('shows the logo on the sign-in screen, the dark one in dark theme', async () => {
    uploadBrand({ logo: LOGO, logo_dark: LOGO_DARK });
    renderApp('/login');
    expect(await screen.findByRole('img', { name: 'Acme Learn' })).toHaveAttribute('src', LOGO);
    useUi.getState().setUiMode('Dark');
    await waitFor(() => expect(screen.getByRole('img', { name: 'Acme Learn' })).toHaveAttribute('src', LOGO_DARK));
  });

  it('falls back to the built-in mark silently when branding fails to load', async () => {
    uploadBrand({ logo: LOGO });
    server.use(http.get(route('/platform/branding'), () => HttpResponse.json({ message: 'Server Error' }, { status: 500 })));
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Coursiva')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('points the tab icon at the uploaded favicon', async () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = '/favicon.svg';
    document.head.append(link);
    uploadBrand({ favicon: FAVICON });
    const { unmount } = render(
      <AppProviders client={createQueryClient()}>
        <div />
      </AppProviders>,
    );
    await waitFor(() => expect(document.head.querySelector('link[rel="icon"]')).toHaveAttribute('href', FAVICON));
    expect(link).not.toHaveAttribute('type');
    unmount(); // restores the built-in icon
    expect(link.getAttribute('href')).toBe('/favicon.svg');
    link.remove();
  });
});
