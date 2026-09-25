import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { audit, platformSettings } from '@/mocks/collections';
import { useUi } from '@/store/ui';
import { renderApp, signInAs } from '@/test/utils';
import { settingsTables } from './mock';

const form = () => screen.findByRole('form', { name: 'Platform settings' });

describe('console settings', () => {
  it('keeps personal appearance on the client and separate from platform settings', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const before = { ...platformSettings.get() };
    await user.click(await screen.findByRole('button', { name: 'Emerald' }));
    expect(useUi.getState().brand).toBe('Emerald');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(useUi.getState().uiMode).toBe('Dark');
    expect(platformSettings.get()).toEqual(before);
    // Appearance changes don't dirty the shared form.
    expect(within(await form()).getByText('All changes saved')).toBeInTheDocument();
    useUi.getState().setUiMode('Light');
  });

  it('shows an inline error when the trial length is out of range', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const f = await form();
    const trial = within(f).getByLabelText('Trial length (days)');
    await user.clear(trial);
    await user.type(trial, '90');
    await user.click(within(f).getByRole('button', { name: 'Save changes' }));
    expect(await within(f).findByText('The trial length must be between 7 and 60 days.')).toBeInTheDocument();
    expect(trial).toHaveAttribute('aria-invalid', 'true');
    expect(platformSettings.get().trialDays).toBe(14);
  });

  it('saves only the changed fields and audits them', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const f = await form();
    const trial = within(f).getByLabelText('Trial length (days)');
    await user.clear(trial);
    await user.type(trial, '21');
    await user.click(within(f).getByRole('switch', { name: 'Enforce SSO' }));
    expect(within(f).getByText('2 unsaved changes')).toBeInTheDocument();
    await user.click(within(f).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(platformSettings.get()).toMatchObject({ trialDays: 21, enforceSso: true }));
    expect(await within(f).findByText('All changes saved')).toBeInTheDocument();
    expect(
      audit.all().some((a) => a.action === 'Updated platform settings: trial length, SSO enforcement' && a.category === 'Security'),
    ).toBe(true);
  });

  it('discards unsaved edits', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const f = await form();
    const email = within(f).getByLabelText('Support email');
    await user.clear(email);
    await user.type(email, 'help@coursiva.com');
    await user.click(within(f).getByRole('button', { name: 'Discard' }));
    expect(email).toHaveValue('support@coursiva.com');
    expect(within(f).getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('shows server validation inline', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const f = await form();
    const domain = within(f).getByLabelText('Primary domain');
    await user.clear(domain);
    await user.type(domain, 'coursiva.dev');
    await user.click(within(f).getByRole('button', { name: 'Save changes' }));
    expect(await within(f).findByText(/coursiva\.dev isn’t a verified platform domain/)).toBeInTheDocument();
    expect(platformSettings.get().primaryDomain).toBe('coursiva.io');
  });

  it('persists integration policies and removes tax regions after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    await user.click(await screen.findByRole('switch', { name: 'Let tenants use their own processor' }));
    await waitFor(() => expect(settingsTables.policies.find('byo_processor')!.enabled).toBe(true));

    const regions = await screen.findByRole('list', { name: 'Registered tax regions' });
    await user.click(within(regions).getByRole('button', { name: 'Remove Canada' }));
    expect(settingsTables.regions.find('ca')).toBeDefined();
    await user.click(within(regions).getByRole('button', { name: 'Confirm remove Canada' }));
    await waitFor(() => expect(settingsTables.regions.find('ca')).toBeUndefined());
  });

  it('rejects invoice numbering that goes backwards', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const numbering = await screen.findByRole('form', { name: 'Invoice numbering' });
    const next = within(numbering).getByLabelText('Next number');
    await user.clear(next);
    await user.type(next, '100');
    await user.click(within(numbering).getByRole('button', { name: 'Save numbering' }));
    expect(await within(numbering).findByText(/must be at least 20261/)).toBeInTheDocument();
    expect(settingsTables.tax.get().nextInvoiceNumber).toBe(20261);
  });

  it('is read-only without platform.manage', async () => {
    signInAs('Support');
    renderApp('/settings');
    const f = await form();
    expect(within(f).getByLabelText('Trial length (days)')).toBeDisabled();
    expect(within(f).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    // Personal appearance stays available to everyone.
    expect(screen.getByRole('button', { name: 'Emerald' })).toBeEnabled();
  });
});
