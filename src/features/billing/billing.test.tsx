import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { audit, invoices, overages, platformSettings, pricing, staff, tenants } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { planFeatures, promoCodes } from './mock';

const signInReadOnly = () => {
  staff.update('st_dana', { status: 'Active' });
  return signInAs('Read-only');
};
const audited = (text: string | RegExp) =>
  audit.all().some((a) => a.category === 'Billing' && (typeof text === 'string' ? a.action === text : text.test(a.action)));

describe('revenue', () => {
  it('shows MRR derived from tenants, invoices, dunning and overages', async () => {
    signInAs('Owner');
    renderApp('/revenue');
    expect(await screen.findByText('$4,491')).toBeInTheDocument();
    const inv = await screen.findByRole('table', { name: 'Latest invoices' });
    await waitFor(() => expect(within(inv).getAllByRole('row')).toHaveLength(7)); // header + 6
    const dunning = await screen.findByRole('table', { name: 'Dunning queue' });
    expect(within(dunning).getByText('Bloom Floristry Courses')).toBeInTheDocument();
    expect(within(dunning).getByText('Attempt 2 of 4')).toBeInTheDocument();
    expect(await screen.findByText('$210')).toBeInTheDocument(); // unbilled overages
  });

  it('retries a failed charge: invoice paid, tenant active, audited', async () => {
    signInAs('Owner');
    const { user } = renderApp('/revenue');
    const dunning = await screen.findByRole('table', { name: 'Dunning queue' });
    await user.click(within(dunning).getByRole('button', { name: 'Retry now for Bloom Floristry Courses' }));
    expect(await screen.findByText(/\$99 collected from Bloom Floristry Courses/)).toBeInTheDocument();
    expect(invoices.find('in_20260818')!.status).toBe('Paid');
    expect(tenants.find('tn_bloom')!.status).toBe('Active');
    expect(audited(/^Retried failed charge for Bloom Floristry Courses/)).toBe(true);
    expect(await screen.findByText('No tenants in dunning — all charges healthy.')).toBeInTheDocument();
  });

  it('waives only after confirming', async () => {
    signInAs('Finance');
    const { user } = renderApp('/revenue');
    const dunning = await screen.findByRole('table', { name: 'Dunning queue' });
    await user.click(within(dunning).getByRole('button', { name: 'Waive' }));
    expect(invoices.find('in_20260818')!.status).toBe('Past due');
    await user.click(within(dunning).getByRole('button', { name: 'Confirm waive' }));
    expect(await screen.findByText(/Invoice waived for Bloom Floristry Courses — \$99 written off/)).toBeInTheDocument();
    expect(invoices.find('in_20260818')!.status).toBe('Waived');
    expect(tenants.find('tn_bloom')!.status).toBe('Active');
    expect(audited('Waived $99 invoice CV-20260818 for Bloom Floristry Courses')).toBe(true);
  });

  it('pauses and resumes dunning', async () => {
    signInAs('Owner');
    const { user } = renderApp('/revenue');
    const dunning = await screen.findByRole('table', { name: 'Dunning queue' });
    await user.click(within(dunning).getByRole('button', { name: 'Pause dunning for Bloom Floristry Courses' }));
    expect(await within(dunning).findByText('Paused')).toBeInTheDocument();
    await waitFor(() => expect(invoices.find('in_20260818')!.dunningPaused).toBe(true));
    expect(audited(/^Paused dunning for Bloom Floristry Courses/)).toBe(true);
    await user.click(within(dunning).getByRole('button', { name: 'Resume dunning for Bloom Floristry Courses' }));
    await waitFor(() => expect(invoices.find('in_20260818')!.dunningPaused).toBe(false));
  });

  it('adds an overage to the next invoice', async () => {
    signInAs('Owner');
    const { user } = renderApp('/revenue');
    const table = await screen.findByRole('table', { name: 'Metered overages' });
    await user.click(within(table).getByRole('button', { name: 'Add DevPath Bootcamp video storage overage to invoice' }));
    expect(await screen.findByText('$114 overage added to DevPath Bootcamp’s next invoice')).toBeInTheDocument();
    expect(overages.find('ov_1')!.billedAt).not.toBeNull();
    expect(await within(table).findByText('Queued')).toBeInTheDocument();
    expect(await screen.findByText('$96')).toBeInTheDocument(); // unbilled total drops
    expect(audited('Added $114 video storage overage to DevPath Bootcamp’s next invoice')).toBe(true);
  });

  it('highlights an invoice deep-linked from search', async () => {
    signInAs('Owner');
    renderApp('/revenue?invoice=in_20260815');
    const inv = await screen.findByRole('table', { name: 'Latest invoices' });
    const row = await within(inv).findByRole('row', { current: true });
    expect(within(row).getByText('Peak Fitness Cert Co')).toBeInTheDocument();
  });
});

describe('plans & pricing', () => {
  it('previews MRR impact and saves a price for new signups only', async () => {
    signInAs('Owner');
    const { user } = renderApp('/plans');
    const growth = await screen.findByLabelText('Growth monthly price');
    await user.clear(growth);
    await user.type(growth, '449');
    expect(await screen.findByText('+$200/mo')).toBeInTheDocument(); // 4 Growth tenants × $50
    await user.click(screen.getByRole('button', { name: 'Save pricing' }));
    expect(await screen.findByText('Pricing saved — applies to new signups')).toBeInTheDocument();
    expect(pricing.get().prices.Growth).toBe(449);
    expect(tenants.find('tn_amplify')!.monthlyPrice).toBe(399);
    expect(audited('Changed Growth plan price from $399 to $449 (new signups only)')).toBe(true);
  });

  it('migrates existing tenants when chosen', async () => {
    signInAs('Owner');
    const { user } = renderApp('/plans');
    const launch = await screen.findByLabelText('Launch monthly price');
    await user.clear(launch);
    await user.type(launch, '79');
    await user.click(await screen.findByRole('radio', { name: 'Migrate everyone' }));
    await user.click(screen.getByRole('button', { name: 'Save pricing' }));
    expect(await screen.findByText(/3 tenants move to the new price/)).toBeInTheDocument();
    expect(tenants.where((t) => t.plan === 'Launch').every((t) => t.monthlyPrice === 79)).toBe(true);
  });

  it('saves add-on prices, annual discount and trial length', async () => {
    signInAs('Owner');
    const { user } = renderApp('/plans');
    const seat = await screen.findByLabelText('Additional staff seat price');
    await user.clear(seat);
    await user.type(seat, '9');
    const trial = screen.getByLabelText('Free trial length');
    await user.clear(trial);
    await user.type(trial, '21');
    await user.click(screen.getByRole('button', { name: 'Save pricing' }));
    await waitFor(() => expect(platformSettings.get().trialDays).toBe(21));
    expect(audited('Changed Additional staff seat add-on price from $8 to $9/mo')).toBe(true);
    expect(audited('Changed free trial length from 14 to 21 days')).toBe(true);
  });

  it('validates prices and trial length before saving', async () => {
    signInAs('Owner');
    const { user } = renderApp('/plans');
    const scale = await screen.findByLabelText('Scale monthly price');
    await user.clear(scale);
    await user.type(scale, 'abc');
    const trial = screen.getByLabelText('Free trial length');
    await user.clear(trial);
    await user.type(trial, '200');
    await user.click(screen.getByRole('button', { name: 'Save pricing' }));
    expect(await screen.findByText('Enter a price like 99 or 99.50.')).toBeInTheDocument();
    expect(screen.getByText('Use a whole number of days from 0 to 90.')).toBeInTheDocument();
    expect(pricing.get().prices.Scale).toBe(899);
  });

  it('toggles a plan feature', async () => {
    signInAs('Owner');
    const { user } = renderApp('/plans');
    const cell = await screen.findByRole('button', { name: 'SSO (SAML) on Growth' });
    expect(cell).toHaveAttribute('aria-pressed', 'false');
    await user.click(cell);
    await waitFor(() => expect(planFeatures.find('sso')!.plans).toContain('Growth'));
    expect(cell).toHaveAttribute('aria-pressed', 'true');
  });

  it('creates a promo code with validation', async () => {
    signInAs('Owner');
    const { user } = renderApp('/plans');
    const code = await screen.findByLabelText('Promo code');
    await user.type(code, 'x');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Use 3–20 letters or digits, no spaces.')).toBeInTheDocument();
    expect(screen.getByText('Enter a whole percentage from 1 to 100.')).toBeInTheDocument();

    await user.clear(code);
    await user.type(code, 'launch30');
    await user.type(screen.getByLabelText('Percent off'), '10');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('LAUNCH30 is already an active promo code.')).toBeInTheDocument();

    await user.clear(code);
    await user.type(code, 'fall25');
    await user.clear(screen.getByLabelText('Percent off'));
    await user.type(screen.getByLabelText('Percent off'), '25');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Duration' }), '12 months');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    const table = await screen.findByRole('table', { name: 'Active promo codes' });
    expect(await within(table).findByText('FALL25')).toBeInTheDocument();
    expect(promoCodes.where((p) => p.code === 'FALL25')[0]).toMatchObject({ percentOff: 25, duration: '12 months' });
    expect(audited('Created promo code FALL25 (25% off · 12 months)')).toBe(true);
  });

  it('deactivates a promo code after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp('/plans');
    const table = await screen.findByRole('table', { name: 'Active promo codes' });
    const row = within(table).getByRole('row', { name: /WINBACK50/ });
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }));
    expect(promoCodes.find('pc_winback50')!.deactivatedAt).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'Confirm deactivate' }));
    await waitFor(() => expect(within(table).queryByText('WINBACK50')).not.toBeInTheDocument());
    expect(promoCodes.find('pc_winback50')!.deactivatedAt).not.toBeNull();
    expect(audited('Deactivated promo code WINBACK50')).toBe(true);
  });
});

describe('billing permissions', () => {
  it('blocks roles without billing.view', async () => {
    signInAs('Support');
    renderApp('/revenue');
    expect(await screen.findByText('You don’t have access to this screen')).toBeInTheDocument();
    await expect(api.get('/billing/revenue')).rejects.toMatchObject({ status: 403 });
  });

  it('lets a read-only role view revenue but not act', async () => {
    signInReadOnly();
    renderApp('/revenue');
    const dunning = await screen.findByRole('table', { name: 'Dunning queue' });
    expect(within(dunning).queryByRole('button')).not.toBeInTheDocument();
    const inv = await screen.findByRole('table', { name: 'Latest invoices' });
    await within(inv).findByText('Bloom Floristry Courses');
    expect(within(inv).queryByRole('button', { name: /Retry charge/ })).not.toBeInTheDocument();
    const ov = await screen.findByRole('table', { name: 'Metered overages' });
    expect(within(ov).queryByRole('button')).not.toBeInTheDocument();
    const err = await api.post('/billing/invoices/in_20260818/retry').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect(invoices.find('in_20260818')!.status).toBe('Past due');
  });

  it('lets a read-only role view pricing but not change it', async () => {
    signInReadOnly();
    renderApp('/plans');
    expect(await screen.findByLabelText('Growth monthly price')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save pricing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SSO (SAML) on Growth' })).toBeDisabled();
    await expect(api.put('/billing/pricing', { prices: [{ plan: 'Growth', price: 1 }] })).rejects.toMatchObject({ status: 403 });
    expect(pricing.get().prices.Growth).toBe(399);
  });
});

describe('pricing unsaved changes', () => {
  it('enables Save only after an edit, discards, and asks before leaving with unsaved edits', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/plans');
    const save = await screen.findByRole('button', { name: /save pricing/i });
    expect(save).toBeDisabled();
    const growth = screen.getByLabelText('Growth monthly price');
    await user.clear(growth);
    await user.type(growth, '449');
    expect(save).toBeEnabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Growth monthly price')).toHaveValue('399');
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText('Growth monthly price'));
    await user.type(screen.getByLabelText('Growth monthly price'), '449');
    await user.click(screen.getByRole('link', { name: 'Tenants' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(router.state.location.pathname).toBe('/plans');
    expect(pricing.get().prices.Growth).toBe(399);
  });
});
