import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, signInAs } from '@/test/utils';

describe('authentication', () => {
  it('redirects signed-out users to the login page', async () => {
    renderApp('/tenants');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('validates the form before calling the API', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  });

  it('shows the server message for wrong credentials', async () => {
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Work email'), 'sam@coursiva.io');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('These credentials do not match our records.')).toBeInTheDocument();
  });

  it('signs in with two-factor and returns to the requested page', async () => {
    const { user } = renderApp('/tenants');
    await user.type(await screen.findByLabelText('Work email'), 'sam@coursiva.io');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.type(await screen.findByLabelText('Authentication code'), '000000');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByText(/two factor authentication code was invalid/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Authentication code'));
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tenants' })).toBeInTheDocument();
  });

  it('hides screens the role cannot access', async () => {
    signInAs('Finance');
    renderApp('/');
    const nav = await screen.findByRole('navigation');
    expect(await within(nav).findByRole('link', { name: 'Tenants' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Support' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Platform staff' })).not.toBeInTheDocument();
  });

  it('blocks direct navigation to a screen without permission', async () => {
    signInAs('Finance');
    renderApp('/staff');
    expect(await screen.findByText('You don’t have access to this screen')).toBeInTheDocument();
  });
});
