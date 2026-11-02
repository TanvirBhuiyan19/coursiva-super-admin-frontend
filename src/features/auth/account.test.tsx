import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { env } from '@/config/env';
import { audit, issuePasswordReset, passwordResets, platformSettings, session, staff } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { MOCK_TOTP } from './mock';

describe('password reset and invitations', () => {
  it('links to forgot password from sign-in and answers the same for unknown emails', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('link', { name: 'Forgot your password?' }));
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Work email'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(passwordResets.all()).toHaveLength(0);
  });

  it('emails a link for a real account and resets the password with it', async () => {
    const { user } = renderApp('/forgot-password');
    await user.type(await screen.findByLabelText('Work email'), 'lee@coursiva.io');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    await screen.findByRole('heading', { name: 'Check your email' });
    const token = passwordResets.find('lee@coursiva.io')?.token;
    expect(token).toBeTruthy();

    const reset = renderApp(`/reset-password?token=${token ?? ''}&email=lee%40coursiva.io`);
    const r = reset.user;
    await r.type(await screen.findByLabelText('New password'), 'new-password-1');
    await r.type(screen.getByLabelText('Confirm new password'), 'mismatch');
    await r.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('The passwords don’t match.')).toBeInTheDocument();
    await r.clear(screen.getByLabelText('Confirm new password'));
    await r.type(screen.getByLabelText('Confirm new password'), 'new-password-1');
    await r.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('heading', { name: 'Password saved' })).toBeInTheDocument();
    expect(staff.where((s) => s.email === 'lee@coursiva.io')[0]?.password).toBe('new-password-1');
    expect(passwordResets.find('lee@coursiva.io')).toBeUndefined();
  });

  it('shows the API error for an expired or reused link', async () => {
    const { user } = renderApp('/reset-password?token=bogus&email=lee%40coursiva.io');
    await user.type(await screen.findByLabelText('New password'), 'new-password-1');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-1');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('This password reset link is invalid or has expired.')).toBeInTheDocument();
  });

  it('asks for a new link when the URL is incomplete', async () => {
    renderApp('/reset-password?email=lee%40coursiva.io');
    expect(await screen.findByText(/This link is incomplete/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('accepts a staff invitation: setting the password activates the account', async () => {
    const dana = staff.where((s) => s.email === 'dana@coursiva.io')[0]!;
    expect(dana.status).toBe('Invited');
    const token = issuePasswordReset(dana.email);
    const { user } = renderApp(`/reset-password?token=${token}&email=${encodeURIComponent(dana.email)}&invite=1`);
    expect(await screen.findByRole('heading', { name: 'Accept your invitation' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), 'welcome-aboard');
    await user.type(screen.getByLabelText('Confirm new password'), 'welcome-aboard');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(await screen.findByRole('heading', { name: 'Password saved' })).toBeInTheDocument();
    expect(staff.find(dana.id)).toMatchObject({ status: 'Active', password: 'welcome-aboard' });
  });
});

describe('account security', () => {
  it('enrols two-factor with a QR code and shows the recovery codes once', async () => {
    const lee = signInAs('Support');
    const { user } = renderApp('/account');
    const card = await screen.findByRole('region', { name: 'Two-factor authentication' });
    expect(within(card).getByText('Off')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Set up two-factor authentication' }));
    expect(await within(card).findByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument();
    await user.type(within(card).getByLabelText('Code from the app'), '000000');
    await user.click(within(card).getByRole('button', { name: 'Turn on' }));
    expect(await within(card).findByText('The provided two factor authentication code was invalid.')).toBeInTheDocument();
    await user.clear(within(card).getByLabelText('Code from the app'));
    await user.type(within(card).getByLabelText('Code from the app'), MOCK_TOTP);
    await user.click(within(card).getByRole('button', { name: 'Turn on' }));
    const codes = await within(card).findByRole('list', { name: 'Your recovery codes' });
    expect(within(codes).getAllByRole('listitem')).toHaveLength(10);
    expect(staff.find(lee.id)?.twoFactorEnabled).toBe(true);
    expect(audit.all().some((a) => a.action === 'Enabled two-factor authentication' && a.actorId === lee.id)).toBe(true);
    await user.click(within(card).getByRole('button', { name: 'I’ve saved them' }));
    expect(await within(card).findByText('On')).toBeInTheDocument();
  });

  it('changes the password and shows the server error for a wrong current password', async () => {
    const lee = signInAs('Support');
    const { user } = renderApp('/account');
    const card = await screen.findByRole('region', { name: 'Password' });
    await user.type(within(card).getByLabelText('Current password'), 'nope');
    await user.type(within(card).getByLabelText('New password'), 'brand-new-pass');
    await user.type(within(card).getByLabelText('Confirm new password'), 'brand-new-pass');
    await user.click(within(card).getByRole('button', { name: 'Change password' }));
    expect(await within(card).findByText('The current password is incorrect.')).toBeInTheDocument();
    await user.clear(within(card).getByLabelText('Current password'));
    await user.type(within(card).getByLabelText('Current password'), 'password');
    await user.click(within(card).getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(staff.find(lee.id)?.password).toBe('brand-new-pass'));
  });

  it('sends a member without 2FA to Account → Security while the platform requires it', async () => {
    platformSettings.patch({ requireStaffTwoFactor: true });
    signInAs('Support');
    renderApp('/tenants');
    expect(await screen.findByText(/The platform requires two-factor authentication for every staff account/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Two-factor authentication' })).toBeInTheDocument();
  });

  it('refuses to require staff 2FA when the operator has none (no self-lockout)', async () => {
    const lee = staff.where((s) => s.email === 'lee@coursiva.io')[0]!;
    // An Owner without 2FA (signInAs would pick Sam, who has it).
    staff.update(lee.id, { role: 'Owner' });
    session.patch({ userId: lee.id, pendingTwoFactorUserId: null, passwordConfirmedAt: new Date().toISOString() });
    const res = await fetch(`http://localhost${env.apiPrefix}/settings`, {
      method: 'PATCH',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ require_staff_two_factor: true }),
    });
    expect(res.status, await res.clone().text()).toBe(422);
    expect(((await res.json()) as { errors: Record<string, string[]> }).errors.require_staff_two_factor?.[0]).toMatch(/would lock you out/);
    expect(platformSettings.get().requireStaffTwoFactor).toBe(false);
  });

  it('accepts a recovery code at the 2FA sign-in step (single use)', async () => {
    const sam = staff.where((s) => s.email === 'sam@coursiva.io')[0]!;
    staff.update(sam.id, { recoveryCodes: ['abcde-12345'] });
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Work email'), 'sam@coursiva.io');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await user.type(await screen.findByLabelText('Authentication code'), 'abcde-12345');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Platform overview' })).toBeInTheDocument();
    expect(staff.find(sam.id)?.recoveryCodes).toEqual([]);
  });
});
