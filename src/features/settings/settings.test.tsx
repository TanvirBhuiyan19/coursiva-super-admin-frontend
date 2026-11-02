import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { audit, platformSettings, rolePermissions } from '@/mocks/collections';
import { useUi } from '@/store/ui';
import { renderApp, signInAs } from '@/test/utils';
import { settingsTables } from './mock';

const form = (name: string) => screen.findByRole('form', { name });
const nav = () => screen.findByRole('navigation', { name: 'Settings sections' });

describe('console settings — sections', () => {
  it('lists the sections, marks the active one and keeps it in the URL', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/settings');
    const n = await nav();
    const links = within(n).getAllByRole('link');
    expect(links.map((l) => l.textContent.replace(/\d+.*$/, ''))).toEqual([
      'Platform',
      'Signup & provisioning',
      'Branding',
      'Legal',
      'Email',
      'Security',
      'Billing & dunning',
      'Tax & invoicing',
      'Notifications',
      'Integrations',
      'Maintenance',
      'Appearance',
    ]);
    expect(within(n).getByRole('link', { name: /^Platform/ })).toHaveAttribute('aria-current', 'page');
    await form('Platform');

    await user.click(within(n).getByRole('link', { name: /^Security/ }));
    expect(router.state.location.search).toBe('?section=security');
    expect(await form('Security')).toBeInTheDocument();
    expect(within(n).getByRole('link', { name: /^Security/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('form', { name: 'Platform' })).not.toBeInTheDocument();
  });

  it('opens the section named in the URL, with where each value is read', async () => {
    signInAs('Owner');
    renderApp('/settings?section=maintenance');
    const f = await form('Maintenance');
    expect(within(f).getByRole('switch', { name: 'Maintenance mode' })).toBeInTheDocument();
    const where = (await screen.findByText('Where these values are read')).closest('details')!;
    expect(within(where).getAllByText('Tenant dashboards and school sites (503 while on)')).toHaveLength(3);
  });

  it('warns before switching sections with unsaved changes', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/settings');
    const f = await form('Platform');
    await user.clear(within(f).getByLabelText('Platform name'));
    await user.type(within(f).getByLabelText('Platform name'), 'Coursiva Learning');
    await user.click(within(await nav()).getByRole('link', { name: /^Email/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(within(f).getByLabelText('Platform name')).toHaveValue('Coursiva Learning');
    expect(router.state.location.search).toBe('');

    await user.click(within(await nav()).getByRole('link', { name: /^Email/ }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Discard and switch' }),
    );
    expect(await form('Email')).toBeInTheDocument();
    expect(platformSettings.get().platformName).toBe('Coursiva');
  });

  it('keeps personal appearance on the client', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=appearance');
    const before = { ...platformSettings.get() };
    await user.click(await screen.findByRole('button', { name: 'Emerald' }));
    expect(useUi.getState().brand).toBe('Emerald');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(useUi.getState().uiMode).toBe('Dark');
    expect(platformSettings.get()).toEqual(before);
    expect(screen.getByText('Only you · this device')).toBeInTheDocument();
    useUi.getState().setUiMode('Light');
  });
});

describe('console settings — saving', () => {
  it('saves only the changed fields, audits them and updates the changed-from-default counts', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=signup');
    const f = await form('Signup & provisioning');
    // The seed already reserves two extra subdomains (default: none).
    expect(within(f).getByText('1 changed from default')).toBeInTheDocument();
    const trial = within(f).getByLabelText('Trial length (days)');
    await user.clear(trial);
    await user.type(trial, '21');
    await user.click(within(f).getByRole('switch', { name: 'Public sign-up' }));
    expect(within(f).getByText('2 unsaved changes')).toBeInTheDocument();
    await user.click(within(f).getByRole('button', { name: 'Save signup & provisioning' }));
    await waitFor(() => expect(platformSettings.get()).toMatchObject({ trialDays: 21, publicSignup: false }));
    expect(await within(f).findByText('3 changed from default')).toBeInTheDocument();
    expect(
      within(await nav()).getByRole('link', { name: /Signup & provisioning.*3 settings changed from their defaults/ }),
    ).toBeInTheDocument();
    expect(
      audit.all().some((a) => a.action === 'Updated platform settings: public sign-up, trial length' && a.category === 'Security'),
    ).toBe(true);
    expect(within(f).getByRole('button', { name: 'Save signup & provisioning' })).toBeDisabled();
  });

  it('saves card-first trial settings: 0–90 trial days, the card requirement and the card check in dollars', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=signup');
    const f = await form('Signup & provisioning');
    expect(within(f).getByText(/0 = no free trial, schools pay at sign-up/)).toBeInTheDocument();
    const trial = within(f).getByLabelText('Trial length (days)');
    const check = within(f).getByLabelText('Card check amount');
    expect(check).toHaveValue(0.5);
    // Shown in the read-only platform billing currency.
    expect(within(f).getByText('$0.50–$5.00 (USD)')).toBeInTheDocument();
    expect(within(f).getByRole('switch', { name: 'Require a card to start a trial' })).toBeChecked();

    // Client-side ranges: 0–90 days, $0.50–$5.00.
    await user.clear(trial);
    await user.type(trial, '91');
    await user.clear(check);
    await user.type(check, '0.4');
    await user.click(within(f).getByRole('button', { name: 'Save signup & provisioning' }));
    expect(await within(f).findByText('The trial length must be between 0 and 90 days.')).toBeInTheDocument();
    expect(within(f).getByText('Enter an amount from 0.50 to 5.00.')).toBeInTheDocument();

    await user.clear(trial);
    await user.type(trial, '0');
    await user.clear(check);
    await user.type(check, '1.25');
    await user.click(within(f).getByRole('switch', { name: 'Require a card to start a trial' }));
    await user.click(within(f).getByRole('button', { name: 'Save signup & provisioning' }));
    await waitFor(() => expect(platformSettings.get()).toMatchObject({ trialDays: 0, cardCheckAmount: 125, trialRequiresCard: false }));
    expect(
      audit.all().some((a) => a.action === 'Updated platform settings: trial length, card requirement for trials, card check amount'),
    ).toBe(true);
    // The same trial length is the price book's.
    expect((await api.get<{ data: { trialDays: number } }>('/billing/pricing')).data.trialDays).toBe(0);
  });

  it('formats the card check in the platform billing currency', async () => {
    signInAs('Owner');
    platformSettings.patch({ billingCurrency: 'EUR' });
    renderApp('/settings?section=signup');
    const f = await form('Signup & provisioning');
    expect(within(f).getByText('€0.50–€5.00 (EUR)')).toBeInTheDocument();
  });

  it('validates the card-first trial settings on the server', async () => {
    signInAs('Owner');
    await expect(api.patch('/settings', { trialDays: 91 })).rejects.toMatchObject({
      status: 422,
      fieldErrors: { trialDays: ['The trial length must be between 0 and 90 days.'] },
    });
    await expect(api.patch('/settings', { cardCheckAmount: 49 })).rejects.toMatchObject({ status: 422 });
    await expect(api.patch('/settings', { cardCheckAmount: 501 })).rejects.toMatchObject({ status: 422 });
    await expect(api.patch('/settings', { trialRequiresCard: 'yes' })).rejects.toMatchObject({ status: 422 });
    // billing_currency is read-only: PATCH ignores it.
    await api.patch('/settings', { trialDays: 90, cardCheckAmount: 500, billingCurrency: 'EUR' });
    expect(platformSettings.get()).toMatchObject({ trialDays: 90, cardCheckAmount: 500, billingCurrency: 'USD' });
  });

  it('shows Enforce SSO as unavailable (no staff identity provider) and the API refuses it', async () => {
    signInAs('Owner');
    renderApp('/settings?section=security');
    const f = await form('Security');
    expect(within(f).getByRole('switch', { name: 'Enforce SSO' })).toBeDisabled();
    expect(within(f).getByRole('switch', { name: 'Require 2FA for platform staff' })).toBeEnabled();
    await expect(api.patch('/settings', { enforceSso: true })).rejects.toMatchObject({ status: 422 });
    expect(platformSettings.get().enforceSso).toBe(false);
  });

  it('sends list settings one per line and shows the server’s answer', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=security');
    const f = await form('Security');
    const allow = within(f).getByLabelText('Console IP allowlist');
    await user.type(allow, '10.0.0.300');
    await user.click(within(f).getByRole('button', { name: 'Save security' }));
    expect(await within(f).findByText('“10.0.0.300” isn’t an IP address or CIDR range.')).toBeInTheDocument();
    expect(allow).toHaveAttribute('aria-invalid', 'true');

    // Valid, but it doesn't include the operator's own address: refused by the server.
    await user.clear(allow);
    await user.type(allow, '198.51.100.0/24');
    await user.click(within(f).getByRole('button', { name: 'Save security' }));
    expect(await within(f).findByText(/Your own address \(203\.0\.113\.10\) isn’t on the list/)).toBeInTheDocument();
    expect(platformSettings.get().consoleIpAllowlist).toEqual([]);

    await user.type(allow, '{Enter}203.0.113.10{Enter}198.51.100.0/24');
    await user.click(within(f).getByRole('button', { name: 'Save security' }));
    await waitFor(() => expect(platformSettings.get().consoleIpAllowlist).toEqual(['198.51.100.0/24', '203.0.113.10']));
  });

  it('requires a message to turn maintenance on', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=maintenance');
    const f = await form('Maintenance');
    await user.click(within(f).getByRole('switch', { name: 'Maintenance mode' }));
    await user.click(within(f).getByRole('button', { name: 'Save maintenance' }));
    expect(await within(f).findByText('Tell tenants what’s happening before turning maintenance on.')).toBeInTheDocument();
    expect(platformSettings.get().maintenanceMode).toBe(false);

    await user.type(within(f).getByLabelText('Maintenance message'), 'Upgrading the database — back by 06:00 UTC.');
    await user.click(within(f).getByRole('checkbox', { name: 'Kodo Design School' }));
    await user.click(within(f).getByRole('button', { name: 'Save maintenance' }));
    // Nothing goes offline until the operator types the confirmation; the dialog names the reach and the exemption.
    const dialog = await screen.findByRole('dialog', { name: 'Turn maintenance mode on?' });
    expect(await within(dialog).findByText(/schools? go(es)? offline right away/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent('1 exempt school stays online.');
    expect(platformSettings.get().maintenanceMode).toBe(false);
    await user.type(within(dialog).getByLabelText('Type MAINTENANCE to confirm'), 'maintenance');
    await user.click(within(dialog).getByRole('button', { name: 'Turn maintenance on' }));
    await waitFor(() => expect(platformSettings.get()).toMatchObject({ maintenanceMode: true, maintenanceExemptTenants: ['tn_kodo'] }));
    expect(audit.all().some((a) => a.action === 'Turned maintenance mode on — tenant dashboards and school sites answer 503')).toBe(true);
    expect(await screen.findByText(/Maintenance mode is on/)).toBeInTheDocument();
  });

  it('shows client and server validation inline', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const f = await form('Platform');
    const domain = within(f).getByLabelText('Primary domain');
    await user.clear(domain);
    await user.type(domain, 'coursiva.dev');
    const help = within(f).getByLabelText('Help centre URL');
    await user.clear(help);
    await user.type(help, 'http://help.example.com');
    await user.click(within(f).getByRole('button', { name: 'Save platform' }));
    expect(await within(f).findByText('Enter an https:// URL, or leave it blank.')).toBeInTheDocument();
    await user.clear(help);
    await user.click(within(f).getByRole('button', { name: 'Save platform' }));
    expect(await within(f).findByText(/coursiva\.dev isn’t a verified platform domain/)).toBeInTheDocument();
    expect(platformSettings.get()).toMatchObject({ primaryDomain: 'coursiva.io', helpCentreUrl: 'https://help.coursiva.io' });
  });

  it('discards unsaved edits', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings');
    const f = await form('Platform');
    const email = within(f).getByLabelText('Support email');
    await user.clear(email);
    await user.type(email, 'help@coursiva.com');
    await user.click(within(f).getByRole('button', { name: 'Discard' }));
    expect(email).toHaveValue('support@coursiva.com');
    expect(within(f).getByRole('button', { name: 'Save platform' })).toBeDisabled();
  });

  it('restores a section’s defaults after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=signup');
    const f = await form('Signup & provisioning');
    await user.click(within(f).getByRole('button', { name: 'Restore defaults' }));
    expect(platformSettings.get().reservedSubdomains).toEqual(['careers', 'press']);
    await user.click(within(f).getByRole('button', { name: 'Confirm restore defaults' }));
    await waitFor(() => expect(platformSettings.get().reservedSubdomains).toEqual([]));
    expect(within(f).getByLabelText('Reserved subdomains')).toHaveValue('');
    expect(audit.all().some((a) => a.action === 'Restored the default signup settings (reserved subdomains)')).toBe(true);
    expect(within(f).queryByRole('button', { name: 'Restore defaults' })).not.toBeInTheDocument();
  });

  it('picks the billing provider: connect-first 422 on the field, then saves a connected one', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=billing');
    const f = await form('Billing & dunning');
    const group = within(f).getByRole('radiogroup', { name: 'Billing provider' });
    expect(within(f).getAllByRole('radiogroup')[0]).toBe(group); // first field of the section
    expect(within(group).getByRole('radio', { name: 'Stripe' })).toHaveAttribute('aria-checked', 'true');
    expect(within(f).getByText(/Lemon Squeezy bills plans only/)).toBeInTheDocument();
    // The seed connects Paddle only.
    expect(await within(f).findByText(/Lemon Squeezy isn’t connected yet/)).toBeInTheDocument();
    expect(within(f).getByRole('link', { name: 'Platform → Connections.' })).toHaveAttribute('href', '/platform/connections');

    await user.click(within(group).getByRole('radio', { name: 'Lemon Squeezy' }));
    await user.click(within(f).getByRole('button', { name: 'Save billing & dunning' }));
    expect(await within(f).findByText('Connect Lemon Squeezy in Platform → Connections first.')).toBeInTheDocument();
    expect(platformSettings.get().billingProvider).toBe('stripe');

    await user.click(within(group).getByRole('radio', { name: 'Paddle' }));
    await user.click(within(f).getByRole('button', { name: 'Save billing & dunning' }));
    await waitFor(() => expect(platformSettings.get().billingProvider).toBe('paddle'));
    expect(audit.all().some((a) => a.action === 'Updated platform settings: billing provider' && a.category === 'Security')).toBe(true);
    // Not resettable: it never counts as changed from default.
    expect(within(f).queryByText(/changed from default/)).not.toBeInTheDocument();
  });

  it('leaves the billing provider alone when restoring the billing defaults', async () => {
    platformSettings.patch({ billingProvider: 'paddle', dunningRetries: 5 });
    signInAs('Owner');
    const { user } = renderApp('/settings?section=billing');
    const f = await form('Billing & dunning');
    expect(within(f).getByText('1 changed from default')).toBeInTheDocument();
    await user.click(within(f).getByRole('button', { name: 'Restore defaults' }));
    await user.click(within(f).getByRole('button', { name: 'Confirm restore defaults' }));
    await waitFor(() => expect(platformSettings.get().dunningRetries).toBe(3));
    expect(platformSettings.get().billingProvider).toBe('paddle');
    expect(within(f).getByRole('radio', { name: 'Paddle' })).toHaveAttribute('aria-checked', 'true');
    expect(audit.all().some((a) => a.action === 'Restored the default billing settings (payment retries)')).toBe(true);
    const meta = await api.get<{ data: { fields: { key: string; default: unknown }[] } }>('/settings/meta');
    // Like Laravel, `key` is a snake_case value on the wire (the client only camelises object keys; useSettingsMeta maps it).
    expect(meta.data.fields.find((m) => m.key === 'billing_provider')?.default).toBeNull();
    expect(meta.data.fields.some((m) => m.key === 'billingProvider')).toBe(false);
  });

  it('sends a test email to the signed-in staff member', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=email');
    const f = await form('Email');
    await user.click(within(f).getByRole('button', { name: 'Send a test email' }));
    expect(await screen.findByText('Test email sent to sam@coursiva.io')).toBeInTheDocument();
    expect(audit.all().some((a) => a.action === 'Sent a test platform email to sam@coursiva.io')).toBe(true);
  });
});

describe('console settings — brand assets', () => {
  it('refuses SVG and uploads a PNG with a preview', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=branding');
    const input = await screen.findByLabelText('Upload Platform logo');
    // The input is hidden behind its button, and its `accept` hides SVG; a forced file still reaches the server, which refuses it.
    fireEvent.change(input, {
      target: { files: [new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' })] },
    });
    expect(await screen.findByText('Upload a PNG, JPEG or WebP image. SVG isn’t accepted: it can carry script.')).toBeInTheDocument();
    expect(platformSettings.get().brandAssets.find((a) => a.slot === 'logo')?.url).toBeNull();

    fireEvent.change(input, { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(platformSettings.get().brandAssets.find((a) => a.slot === 'logo')?.url).toBeTruthy());
    expect(await screen.findByRole('img', { name: 'Platform logo preview' })).toHaveAttribute('src', 'data:image/png;base64,iVBORw==');
    expect(platformSettings.get().brandAssets.find((a) => a.slot === 'logo')?.url).toBe('data:image/png;base64,iVBORw==');
    expect(audit.all().some((a) => a.action === 'Uploaded the platform logo')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Remove Platform logo' }));
    await user.click(screen.getByRole('button', { name: 'Confirm remove Platform logo' }));
    await waitFor(() => expect(platformSettings.get().brandAssets.find((a) => a.slot === 'logo')?.url).toBeNull());
  });
});

describe('console settings — other sections', () => {
  it('points integration policies at Feature availability (the old policy switches are gone)', async () => {
    signInAs('Owner');
    renderApp('/settings?section=integrations');
    expect(await screen.findByRole('link', { name: 'Feature availability.' })).toHaveAttribute('href', '/platform/availability');
    expect(screen.queryByRole('switch', { name: 'Let tenants use their own processor' })).not.toBeInTheDocument();
  });

  it('removes tax regions after confirming and rejects numbering that goes backwards', async () => {
    signInAs('Owner');
    const { user } = renderApp('/settings?section=tax');
    const regions = await screen.findByRole('list', { name: 'Registered tax regions' });
    await user.click(within(regions).getByRole('button', { name: 'Remove Canada' }));
    expect(settingsTables.regions.find('ca')).toBeDefined();
    await user.click(within(regions).getByRole('button', { name: 'Confirm remove Canada' }));
    await waitFor(() => expect(settingsTables.regions.find('ca')).toBeUndefined());

    const numbering = await form('Invoice numbering');
    const next = within(numbering).getByLabelText('Next number');
    await user.clear(next);
    await user.type(next, '100');
    await user.click(within(numbering).getByRole('button', { name: 'Save numbering' }));
    expect(await within(numbering).findByText(/must be at least 20261/)).toBeInTheDocument();
    expect(settingsTables.tax.get().nextInvoiceNumber).toBe(20261);
  });
});

describe('console settings — permissions', () => {
  it('is read-only without platform.manage', async () => {
    signInAs('Support');
    const { user } = renderApp('/settings?section=signup');
    const f = await form('Signup & provisioning');
    expect(within(f).getByLabelText('Trial length (days)')).toBeDisabled();
    expect(within(f).getByRole('switch', { name: 'Public sign-up' })).toBeDisabled();
    expect(within(f).queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
    expect(within(f).queryByRole('button', { name: 'Restore defaults' })).not.toBeInTheDocument();
    expect(screen.getByText(/Changing them needs the “Manage platform settings” permission/)).toBeInTheDocument();

    await user.click(within(await nav()).getByRole('link', { name: /^Branding/ }));
    await form('Branding');
    expect(screen.queryByLabelText('Upload Platform logo')).not.toBeInTheDocument();

    // Personal appearance stays available to everyone.
    await user.click(within(await nav()).getByRole('link', { name: /^Appearance/ }));
    expect(await screen.findByRole('button', { name: 'Emerald' })).toBeEnabled();
  });

  it('needs billing.manage to change the billing provider', async () => {
    rolePermissions.patch({ Admin: rolePermissions.get().Admin.filter((p) => p !== 'billing.manage') });
    signInAs('Admin');
    renderApp('/settings?section=billing');
    const f = await form('Billing & dunning');
    expect(within(f).getByRole('radio', { name: 'Paddle' })).toBeDisabled();
    expect(within(f).getByText(/Changing the billing provider needs the “Manage billing & pricing” permission/)).toBeInTheDocument();
    expect(within(f).getByLabelText('Payment retries before suspension')).toBeEnabled();
    await expect(api.patch('/settings', { billingProvider: 'paddle' })).rejects.toMatchObject({
      status: 403,
      message: 'Changing the billing provider needs the billing.manage permission.',
    });
    expect(platformSettings.get().billingProvider).toBe('stripe');
  });
});
