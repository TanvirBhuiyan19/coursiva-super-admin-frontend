import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { audit } from '@/mocks/collections';
import { connectionStore, REGISTRAR_REFUSED_TOKEN } from '@/features/platform/mock';
import { renderApp, signInAs } from '@/test/utils';
import { domainSettings, ICANN_BENEFITS_URL, orders, registrations, tasks } from './mock';
import { resalePrice } from './pricing';

const hasAudit = (action: string, category?: string) =>
  audit.all().some((a) => a.action === action && (!category || a.category === category));
const table = (name: string) => screen.findByRole('table', { name });
const dataRows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);
const taskCard = (name: string) => screen.findByRole('article', { name });

describe('domain pricing rule', () => {
  it('matches the contract examples', () => {
    // Defaults 20 % / 3.00 / x99.
    expect(resalePrice(8.57, 20, 3, 'x99')).toBe(11.99); // max(10.29, 11.57) = 11.57 → 11.99
    expect(resalePrice(10, 20, 3, 'x99')).toBe(13.99); // max(12.00, 13.00) → 13.99
    expect(resalePrice(40, 20, 3, 'x99')).toBe(48.99); // max(48.00, 43.00) → 48.99
    // x99 rounds up to the next .99, never down.
    expect(resalePrice(10, 0, 0, 'x99')).toBe(10.99);
    expect(resalePrice(10.99, 0, 0, 'x99')).toBe(10.99);
    expect(resalePrice(11, 0, 0, 'x99')).toBe(11.99);
    // By percent rounds up to the cent; 2-decimal markups; `none` keeps step 2.
    expect(resalePrice(8.57, 20, 0, 'none')).toBe(10.29);
    expect(resalePrice(10, 12.5, 0, 'none')).toBe(11.25);
    expect(resalePrice(10.44, 20, 3, 'none')).toBe(13.44);
  });
});

describe('domain registrations', () => {
  it('lists registrations with status counts, filters by status, search and tenant', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/domains');
    const list = await table('Registrations');
    await waitFor(() => expect(dataRows(list)).toHaveLength(registrations.all().length));
    expect(screen.getByRole('button', { name: 'Grace period · 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expiring · 1' }));
    await waitFor(() => expect(router.state.location.search).toContain('status=expiring'));
    await waitFor(() => expect(dataRows(list)).toHaveLength(1));
    expect(within(list).getByText('silvaculinary.online')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^All · / }));
    await user.type(screen.getByRole('searchbox', { name: 'Search domains' }), 'amplify');
    await waitFor(() => expect(router.state.location.search).toContain('q=amplify'));
    await waitFor(() => expect(dataRows(list)).toHaveLength(2));

    await user.click(within(list).getAllByRole('button', { name: 'Amplify Coaching' })[0]!);
    await waitFor(() => expect(router.state.location.search).toContain('tenant=tn_amplify'));
    expect(screen.getByText('Tenant: Amplify Coaching')).toBeInTheDocument();
  });

  it('shows registrations expiring soon, soonest first', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains');
    const list = await table('Registrations');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Expiring soon' }), 'Within 30 days');
    await waitFor(() => expect(dataRows(list)).toHaveLength(2));
    expect(dataRows(list)[0]).toHaveTextContent('silvaculinary.online');
    expect(dataRows(list)[1]).toHaveTextContent('nordicyoga.school');
  });

  it('opens a registration with its tenant, registrant (audited), orders and tasks', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains');
    const list = await table('Registrations');
    await user.click(await within(list).findByRole('link', { name: 'devpath.dev' }));
    const drawer = await screen.findByRole('dialog', { name: 'Registration devpath.dev' });
    expect(await within(drawer).findByRole('link', { name: 'Open DevPath Bootcamp' })).toHaveAttribute('href', '/tenants/tn_devpath');
    expect(within(drawer).getByText('rahul.mehta@devpath.io')).toBeInTheDocument();
    expect(within(drawer).getByRole('article', { name: 'Transfer code · devpath.dev' })).toBeInTheDocument();
    expect(within(drawer).getByRole('region', { name: 'Orders' })).toHaveTextContent('$15.99');
    expect(hasAudit('Viewed the registrant contact of devpath.dev', 'Security')).toBe(true);
  });

  it('says when the registrant was erased, and flags an auto-renew mismatch', async () => {
    signInAs('Owner');
    const first = renderApp('/domains/dreg_peak');
    const peak = await screen.findByRole('dialog', { name: 'Registration peakfitcert.com' });
    expect(await within(peak).findByText(/Erased by a privacy request/)).toBeInTheDocument();
    first.unmount();

    renderApp('/domains/dreg_silva');
    const silva = await screen.findByRole('dialog', { name: 'Registration silvaculinary.online' });
    expect(await within(silva).findByText('The school wants auto-renew Off, but the registrar is set On.')).toBeInTheDocument();
  });
});

describe('registrar tasks', () => {
  it('lists open tasks oldest first with per-kind counts and a nav badge', async () => {
    signInAs('Owner');
    renderApp('/domains/tasks');
    const queue = await screen.findByRole('region', { name: 'Registrar tasks' });
    const items = await within(queue).findAllByRole('article');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveAccessibleName('Transfer code · devpath.dev');
    expect(items[4]).toHaveAccessibleName('Contact update · amplifycoaching.academy');
    expect(screen.getByRole('button', { name: 'Registration review · 1' })).toBeInTheDocument();
    const details = within(items[0]!).getByRole('definition');
    expect(within(items[0]!).getByRole('term')).toHaveTextContent('Requested');
    expect(details.textContent).not.toBe('');
    const renew = within(items[2]!);
    expect(items[2]).toHaveAccessibleName('Renew · northstarsales.co');
    expect(renew.getByText('Renewal in the grace period (paid)')).toBeInTheDocument();
    expect(renew.getByText('dord_nst2')).toBeInTheDocument();
    expect(await screen.findByLabelText('5 open registrar tasks')).toBeInTheDocument();
  });

  it('completes a transfer: the code is masked, required, emailed and never kept', async () => {
    signInAs('Owner');
    const { user, client } = renderApp('/domains/tasks');
    const card = await taskCard('Transfer code · devpath.dev');
    await user.click(within(card).getByRole('button', { name: 'Complete the Transfer code task for devpath.dev' }));
    const dialog = await screen.findByRole('dialog', { name: 'Complete Transfer code — devpath.dev' });
    expect(within(dialog).getByText(/emailed to DevPath Bootcamp’s owners straight away and is never stored/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Email the code and complete' }));
    expect(await within(dialog).findByText('Paste the transfer code from the registrar (6–64 characters, no spaces).')).toBeInTheDocument();
    expect(tasks.find('rgt_transfer')!.status).toBe('open');

    const code = 'Xq7#pL2!vR9z';
    const field = within(dialog).getByLabelText('Transfer (auth) code');
    expect(field).toHaveAttribute('type', 'password');
    // "new-password", not "off": browsers ignore "off" on password inputs and fill in the saved login.
    expect(field).toHaveAttribute('autocomplete', 'new-password');
    await user.type(field, code);
    await user.click(within(dialog).getByRole('button', { name: 'Email the code and complete' }));

    expect(
      await screen.findByText('Transfer code emailed to DevPath Bootcamp’s owners for devpath.dev — it isn’t stored'),
    ).toBeInTheDocument();
    await waitFor(() => expect(tasks.find('rgt_transfer')!.status).toBe('done'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasAudit('Completed transfer_out task for devpath.dev', 'Tenants')).toBe(true);
    // Stays transfer_requested until the daily sync no longer finds it at the registrar.
    expect(registrations.find('dreg_devpath')!.status).toBe('transfer_requested');
    // Not stored or logged anywhere: task row, audit, page, or the mutation cache.
    expect(JSON.stringify(tasks.all())).not.toContain(code);
    expect(JSON.stringify(audit.all())).not.toContain(code);
    expect(document.body.innerHTML).not.toContain(code);
    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((m) => m.state.variables),
      ),
    ).not.toContain(code);
  });

  it('completes a renewal with a new expiry, and turning off auto-renew updates the registration', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains/tasks');
    const renew = await taskCard('Renew · northstarsales.co');
    await user.click(within(renew).getByRole('button', { name: /^Complete/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Complete Renew — northstarsales.co' });
    const next = new Date(Date.now() + 360 * 86_400_000).toISOString().slice(0, 10);
    await user.type(within(dialog).getByLabelText('New expiry date (optional)'), next);
    await user.click(within(dialog).getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(registrations.find('dreg_northstar')!.status).toBe('active'));
    expect(registrations.find('dreg_northstar')!.expiresAt!.slice(0, 10)).toBe(next);
    expect(orders.find('dord_nst2')!.status).toBe('completed');

    const off = await taskCard('Turn off auto-renew · silvaculinary.online');
    await user.click(within(off).getByRole('button', { name: /^Complete/ }));
    const d2 = await screen.findByRole('dialog', { name: /^Complete Turn off auto-renew/ });
    await user.type(within(d2).getByLabelText('Note (optional)'), 'Done in the dashboard.');
    await user.click(within(d2).getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(registrations.find('dreg_silva')!.providerAutoRenew).toBe(false));
    expect(tasks.find('rgt_autorenew')).toMatchObject({ status: 'done', resolutionNote: 'Done in the dashboard.' });
  });

  it('cancels a registration review after explaining the refund', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains/tasks');
    const card = await taskCard('Registration review · atlaslang.io');
    await user.click(within(card).getByRole('button', { name: /^Cancel the/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancel Registration review — atlaslang.io' });
    expect(within(dialog).getByText(/fails this order and refunds the school/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel and refund the school' }));
    expect(await screen.findByText('Cancelled the registration of atlaslang.io — the school is refunded')).toBeInTheDocument();
    await waitFor(() => expect(tasks.find('rgt_review')!.status).toBe('cancelled'));
    expect(orders.find('dord_atl1')!.status).toBe('refunded');
    expect(registrations.find('dreg_atlas')!.status).toBe('failed');
    expect(hasAudit('Cancelled registration_review task for atlaslang.io', 'Tenants')).toBe(true);
  });

  it('shows settled tasks under All, and refuses settling twice', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains/tasks');
    await user.click(await screen.findByRole('button', { name: 'All' }));
    const done = await taskCard('Transfer code · bloomfloristry.net');
    expect(within(done).getByText(/Done by Priya Nair/)).toBeInTheDocument();
    expect(within(done).queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument();
    const err = await api.post('/domains/tasks/rgt_done/complete', {}).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe('conflict');
    expect((err as ApiError).message).toBe('This task is already closed.');
  });

  it('lets staff without tenants.manage see tasks but not settle them', async () => {
    signInAs('Support');
    renderApp('/domains/tasks');
    const card = await taskCard('Transfer code · devpath.dev');
    expect(within(card).queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /^Cancel/ })).not.toBeInTheDocument();
    const err = await api.post('/domains/tasks/rgt_contact/complete', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect(tasks.find('rgt_contact')!.status).toBe('open');
  });
});

describe('task effects and filters', () => {
  it('applies a contact update, rejects bad dates, codes with spaces and unknown filters', async () => {
    signInAs('Owner');
    expect(registrations.find('dreg_amplify')!.contactPending).toBe(true);
    await api.post('/domains/tasks/rgt_contact/complete', {});
    expect(registrations.find('dreg_amplify')!.contactPending).toBe(false);

    const bad = await api.post('/domains/tasks/rgt_renew/complete', { expires_at: '2030-02-30' }).catch((e: unknown) => e);
    expect((bad as ApiError).field('expiresAt')).toBe('Enter the new expiry date (YYYY-MM-DD).');
    const early = await api.post('/domains/tasks/rgt_renew/complete', { expires_at: '2001-01-01' }).catch((e: unknown) => e);
    expect((early as ApiError).field('expiresAt')).toBe('Enter the new expiry date.');
    const spaced = await api.post('/domains/tasks/rgt_transfer/complete', { auth_code: 'abc 123456' }).catch((e: unknown) => e);
    expect((spaced as ApiError).field('authCode')).toBe('Paste the transfer code from the registrar.');

    const filter = await api.get('/domains/tasks', { query: { kind: 'nope' } }).catch((e: unknown) => e);
    expect((filter as ApiError).field('kind')).toBe('Unknown kind filter.');
    const within0 = await api.get('/domains/registrations', { query: { expiringWithinDays: 0 } }).catch((e: unknown) => e);
    expect((within0 as ApiError).field('expiringWithinDays')).toBe('Expiring within is 1–365 days.');
  });

  it('counts tasks per kind for a tenant while open_total stays platform-wide', async () => {
    signInAs('Owner');
    const page = await api.get<{ meta: { counts: { kind: string; count: number }[]; openTotal: number } }>('/domains/tasks', {
      query: { tenantId: 'tn_devpath', perPage: 1 },
    });
    expect(page.meta.openTotal).toBe(5);
    expect(page.meta.counts.find((c) => c.kind === 'transfer_out')!.count).toBe(1);
    expect(page.meta.counts.reduce((s, c) => s + c.count, 0)).toBe(1);
  });
});

describe('domain orders', () => {
  it('filters to problem orders (failed, refunded, credited)', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/domains/orders');
    const list = await table('Domain orders');
    await waitFor(() => expect(dataRows(list)).toHaveLength(orders.where((o) => o.status !== 'quoted').length));
    await user.click(screen.getByRole('button', { name: 'Problems' }));
    await waitFor(() => expect(router.state.location.search).toContain('status=problem'));
    await waitFor(() => expect(dataRows(list)).toHaveLength(3));
    expect(within(list).getByText(/card refund failed, so the account was credited/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refunded' }));
    await waitFor(() => expect(dataRows(list)).toHaveLength(1));
    expect(dataRows(list)[0]).toHaveTextContent('kodo-design.courses');
  });
});

describe('domain settings', () => {
  it('previews prices live and saves only the changed fields', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains/settings');
    const form = await screen.findByRole('form', { name: 'Domain settings' });
    const preview = within(form).getByRole('region', { name: 'Price preview' });
    expect(preview).toHaveTextContent('A $10.00 domain sells for $13.99 — $3.99 margin');
    expect(within(form).getByRole('button', { name: 'Save changes' })).toBeDisabled();

    const markup = within(form).getByLabelText('Markup (%)');
    await user.clear(markup);
    await user.type(markup, '50');
    expect(preview).toHaveTextContent('A $10.00 domain sells for $15.99 — $5.99 margin');
    expect(preview).toHaveTextContent('Saved settings: a $10.00 cost sells for $13.99.');

    await user.click(within(form).getByRole('button', { name: '.dev' }));
    await user.type(within(form).getByLabelText('Add an extension'), '.CO.UK{Enter}');
    expect(within(form).getByRole('button', { name: '.co.uk' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Domain settings saved — new purchases use them now')).toBeInTheDocument();
    expect(domainSettings.get().markupPercent).toBe(50);
    expect(domainSettings.get().enabledTlds).toContain('co.uk');
    expect(domainSettings.get().enabledTlds).not.toContain('dev');
    expect(hasAudit('Changed domain settings (markup_percent, enabled_tlds)', 'Billing')).toBe(true);
  });

  it('edits the checkout terms links, resetting an emptied one to its default', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains/settings');
    const form = await screen.findByRole('form', { name: 'Domain settings' });
    expect(within(form).getByRole('link', { name: 'Registration agreement' })).toHaveAttribute(
      'href',
      'https://www.cloudflare.com/domain-registration-agreement/',
    );
    const agreement = within(form).getByLabelText('Registration agreement URL');
    await user.type(agreement, 'http://insecure.example');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(
      await within(form).findByText('Enter an https:// link, or leave it empty for the registrar’s own agreement.'),
    ).toBeInTheDocument();
    await user.clear(agreement);
    await user.type(agreement, 'https://coursiva.example/domain-terms');
    const benefits = within(form).getByLabelText('Registrant benefits and responsibilities URL');
    await user.clear(benefits);
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(domainSettings.get().registrationAgreementUrl).toBe('https://coursiva.example/domain-terms'));
    expect(domainSettings.get().registrantBenefitsUrl).toBe(ICANN_BENEFITS_URL);
    expect(hasAudit('Changed domain settings (registration_agreement_url)', 'Billing')).toBe(true);
  });

  it('validates the ranges before saving', async () => {
    signInAs('Owner');
    const { user } = renderApp('/domains/settings');
    const form = await screen.findByRole('form', { name: 'Domain settings' });
    const lead = within(form).getByLabelText('Charge renewals (days before expiry)');
    await user.clear(lead);
    await user.type(lead, '90');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByText('Renewals are charged 7–60 days before expiry.')).toBeInTheDocument();
    expect(domainSettings.get().renewalLeadDays).toBe(30);
  });

  it('only offers connected registrars and warns when the active one is not connected', async () => {
    signInAs('Owner');
    connectionStore.patch({ credentials: connectionStore.get().credentials.filter((c) => c.connection !== 'cloudflare_registrar') });
    renderApp('/domains/settings');
    expect(await screen.findByText(/Cloudflare Registrar isn’t connected, so schools can’t buy domains/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connections → Custom domains' })).toHaveAttribute('href', '/platform/connections?section=cdn');
    expect(screen.getByRole('option', { name: 'Cloudflare Registrar (not connected)' })).toBeInTheDocument();

    domainSettings.patch({ registrar: 'fake' });
    const err = await api.put('/domains/settings', { registrar: 'cloudflare' }).catch((e: unknown) => e);
    expect((err as ApiError).field('registrar')).toBe('Connect this registrar first.');
  });

  it('is read-only without platform.manage', async () => {
    signInAs('Read-only');
    renderApp('/domains/settings');
    const form = await screen.findByRole('form', { name: 'Domain settings' });
    expect(within(form).getByLabelText('Markup (%)')).toBeDisabled();
    expect(within(form).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    const err = await api.put('/domains/settings', { markup_percent: 10 }).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(403);
  });
});

describe('Cloudflare Registrar connection', () => {
  it('appears under Custom domains with its format checks and the registrar’s refusal', async () => {
    signInAs('Owner');
    connectionStore.patch({ credentials: connectionStore.get().credentials.filter((c) => c.connection !== 'cloudflare_registrar') });
    const { user } = renderApp('/platform/connections?section=cdn');
    const card = await screen.findByRole('region', { name: 'Cloudflare Registrar' });
    expect(within(card).getByText(/Domain sales to schools/)).toBeInTheDocument();
    await user.type(within(card).getByLabelText('Cloudflare Registrar Account ID'), 'nope');
    await user.type(within(card).getByLabelText('Cloudflare Registrar API token'), 'short');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('The account ID is 32 hexadecimal characters (Cloudflare dashboard → Account home → Account ID).'),
    ).toBeInTheDocument();
    expect(within(card).getByText('The API token is at least 20 characters.')).toBeInTheDocument();

    const account = within(card).getByLabelText('Cloudflare Registrar Account ID');
    await user.clear(account);
    await user.type(account, '0123456789abcdef0123456789abcdef');
    const token = within(card).getByLabelText('Cloudflare Registrar API token');
    await user.clear(token);
    await user.type(token, REGISTRAR_REFUSED_TOKEN);
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    // Mode is a switch, Sandbox by default: the check runs against the Registrar Sandbox.
    const mode = within(card).getByRole('radiogroup', { name: 'Cloudflare Registrar Mode' });
    expect(within(mode).getByRole('radio', { name: 'Sandbox (test)' })).toHaveAttribute('aria-checked', 'true');
    expect(within(card).queryByRole('textbox', { name: 'Cloudflare Registrar Mode' })).not.toBeInTheDocument();
    expect(
      await within(card).findByText(
        'Cloudflare Registrar rejected these credentials: Authentication error (the token needs Registrar Sandbox Domains Admin on this account)',
      ),
    ).toBeInTheDocument();

    await user.click(within(mode).getByRole('radio', { name: 'Live' }));
    expect(within(mode).getByRole('radio', { name: 'Live' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText(
        'Cloudflare Registrar rejected these credentials: Authentication error (the token needs Registrar: Edit on this account)',
      ),
    ).toBeInTheDocument();
  });
});
