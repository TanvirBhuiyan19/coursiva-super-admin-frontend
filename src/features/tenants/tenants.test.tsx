import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '@/config/env';
import { api } from '@/lib/api/client';
import { audit, invoices, platformSettings, tenants } from '@/mocks/collections';
import { route } from '@/mocks/http';
import { server } from '@/mocks/server';
import { fillRichText, renderApp, signInAs } from '@/test/utils';

const table = () => screen.findByRole('table', { name: 'Tenants' });

describe('tenant directory', () => {
  it('lists tenants with derived health and MRR', async () => {
    signInAs('Owner');
    renderApp('/tenants');
    const t = await table();
    const bloom = await within(t).findByRole('row', { name: /Bloom Floristry Courses/ });
    expect(within(bloom).getByText('At risk')).toBeInTheDocument();
    expect(within(bloom).getByText('Past due')).toBeInTheDocument();
    expect(within(t).getAllByRole('row')).toHaveLength(11); // header + 10 tenants
  });

  it('filters by segment and keeps the filter in the URL', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/tenants');
    await user.click(await screen.findByRole('button', { name: /^Past due · 1/ }));
    await waitFor(() => expect(router.state.location.search).toContain('segment=past_due'));
    const t = await table();
    await waitFor(() => expect(within(t).getAllByRole('row')).toHaveLength(2));
  });

  it('exports a CSV of just the selected tenants, and full data exports need tenants.manage', async () => {
    signInAs('Owner');
    const res = await fetch(`http://localhost${env.apiPrefix}/tenants/export?ids=tn_kodo,tn_bloom`);
    const lines = (await res.text()).trim().split('\n');
    expect(lines[0]).toBe(
      'id,name,domain,owner_name,owner_email,plan,status,students,mrr,health,health_reason,utilization,stage,created_at,last_active_at',
    );
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['"tn_bloom"', '"tn_kodo"']);

    signInAs('Read-only');
    const bulk = await fetch(`http://localhost${env.apiPrefix}/tenants/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'export', ids: ['tn_kodo'] }),
    });
    expect(bulk.status).toBe(403);
  });

  it('searches by owner name', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants');
    await user.type(await screen.findByRole('searchbox', { name: 'Search tenants' }), 'freja');
    const t = await table();
    await waitFor(() => expect(within(t).getAllByRole('row')).toHaveLength(2));
    expect(within(t).getByText('Nordic Yoga School')).toBeInTheDocument();
  });
});

describe('tenant drawer', () => {
  it('opens from the directory and deep-links by id', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/tenants');
    await user.click(await screen.findByRole('link', { name: 'Amplify Coaching' }));
    const drawer = await screen.findByRole('dialog', { name: 'Amplify Coaching' });
    expect(router.state.location.pathname).toBe('/tenants/tn_amplify');
    expect(within(drawer).getByText('Health score')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/tenants');
  });

  it('suspends only after confirming, and records it in the audit log', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants/tn_silva');
    const drawer = await screen.findByRole('dialog', { name: 'Silva Culinary Arts' });
    await user.click(within(drawer).getByRole('button', { name: 'Suspend' }));
    expect(tenants.find('tn_silva')!.status).toBe('Active');
    await user.click(within(drawer).getByRole('button', { name: 'Confirm suspend' }));
    expect(await screen.findByText(/Silva Culinary Arts suspended/)).toBeInTheDocument();
    expect(tenants.find('tn_silva')!.status).toBe('Suspended');
    expect(audit.all().some((a) => a.action === 'Suspended Silva Culinary Arts' && a.actorName === 'Sam Ortega')).toBe(true);
    expect(await within(drawer).findByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  });

  it('validates limits client-side and saves overrides', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants/tn_kodo');
    const drawer = await screen.findByRole('dialog', { name: 'Kodo Design School' });
    const seats = within(drawer).getByLabelText(/Staff seats/);
    await user.clear(seats);
    await user.type(seats, '-2');
    await user.click(within(drawer).getByRole('button', { name: 'Apply limits' }));
    expect(await within(drawer).findByText('0 or more (0 = unlimited)')).toBeInTheDocument();
    await user.clear(seats);
    await user.type(seats, '8');
    await user.click(within(drawer).getByRole('button', { name: 'Apply limits' }));
    await waitFor(() => expect(tenants.find('tn_kodo')!.limitOverrides.staffSeats).toBe(8));
  });

  it('reads Laravel’s snake_case limit keys (values, not object keys) and shows every limit', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants/tn_kodo');
    const drawer = await screen.findByRole('dialog', { name: 'Kodo Design School' });
    // `limits[].key` arrives as `storage_gb`, `ai_credits`… — labelled and prefilled, not blank.
    // Kodo is on Launch (config/coursiva.php plans.Launch).
    expect(within(drawer).getByLabelText(/Storage \(GB\)/)).toHaveValue(50);
    expect(within(drawer).getByLabelText(/AI credits/)).toHaveValue(50000);
    expect(within(drawer).getByLabelText(/SMS credits/)).toHaveValue(0);
    const ai = within(drawer).getByLabelText(/AI credits/);
    await user.clear(ai);
    await user.type(ai, '700000');
    await user.click(within(drawer).getByRole('button', { name: 'Apply limits' }));
    await waitFor(() => expect(tenants.find('tn_kodo')!.limitOverrides.aiCredits).toBe(700000));
  });

  it('never fails Apply limits silently: an error for a limit without an input becomes the form error', async () => {
    signInAs('Owner');
    server.use(
      http.put(route('/tenants/:id/limits'), () =>
        HttpResponse.json(
          {
            message: 'The given data was invalid.',
            errors: { 'limits.staff_seats': ['Too many seats.'], 'limits.bogus_credits': ['Unknown limit.'] },
          },
          { status: 422 },
        ),
      ),
    );
    const { user } = renderApp('/tenants/tn_kodo');
    const drawer = await screen.findByRole('dialog', { name: 'Kodo Design School' });
    const seats = within(drawer).getByLabelText(/Staff seats/);
    await user.clear(seats);
    await user.type(seats, '9');
    await user.click(within(drawer).getByRole('button', { name: 'Apply limits' }));
    expect(await within(drawer).findByText('Too many seats.')).toBeInTheDocument();
    expect(within(drawer).getByRole('alert', { name: '' })).toHaveTextContent('Unknown limit.');
  });

  it('shows a checkout freeze in the drawer and lifts it', async () => {
    tenants.update('tn_kodo', { checkoutFrozenAt: new Date().toISOString() });
    signInAs('Owner');
    const { user } = renderApp('/tenants/tn_kodo');
    const drawer = await screen.findByRole('dialog', { name: 'Kodo Design School' });
    const notice = within(drawer).getByText('Checkout frozen').parentElement!;
    expect(notice).toHaveTextContent('New card payments for this school are blocked');
    await user.click(within(notice).getByRole('button', { name: 'Unfreeze checkout' }));
    await waitFor(() => expect(tenants.find('tn_kodo')!.checkoutFrozenAt).toBeNull());
    await waitFor(() => expect(within(drawer).queryByText('Checkout frozen')).not.toBeInTheDocument());
    expect(audit.all().some((a) => a.action === 'Unfroze checkout for Kodo Design School — new card payments allowed again')).toBe(true);
  });

  it('asks for the count typed back before suspending schools in bulk', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants');
    await user.click(await screen.findByRole('checkbox', { name: 'Select Kodo Design School' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Amplify Coaching' }));
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suspend 2 schools?' });
    expect(dialog).toHaveTextContent('2 schools go offline now');
    expect(tenants.find('tn_kodo')!.status).not.toBe('Suspended');
    await user.type(within(dialog).getByLabelText('Type SUSPEND 2 to confirm'), 'suspend 2');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend 2 schools' }));
    await waitFor(() => expect(tenants.find('tn_kodo')!.status).toBe('Suspended'));
    expect(tenants.find('tn_amplify')!.status).toBe('Suspended');
  });

  it('hides actions the role is not allowed to take', async () => {
    signInAs('Support');
    renderApp('/tenants/tn_amplify');
    const drawer = await screen.findByRole('dialog', { name: 'Amplify Coaching' });
    expect(within(drawer).getByRole('button', { name: 'Sign in as owner' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Purge data' })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('combobox', { name: 'Plan' })).toBeDisabled();
  });
});

describe('trials', () => {
  const DAY = 86_400_000;

  it('extends a running trial by the days the operator enters', async () => {
    signInAs('Owner');
    const before = new Date(tenants.find('tn_ledger')!.trialEndsAt!).getTime();
    const { user } = renderApp('/tenants/tn_ledger');
    const drawer = await screen.findByRole('dialog', { name: 'Ledger Finance Academy' });
    await user.click(within(drawer).getByRole('button', { name: 'Extend trial' }));
    const days = within(drawer).getByLabelText('Extend the trial by');
    expect(days).toHaveValue(14);

    await user.clear(days);
    await user.type(days, '120');
    await user.click(within(drawer).getByRole('button', { name: 'Extend trial' }));
    expect(await within(drawer).findByText('Enter a whole number of days from 1 to 90.')).toBeInTheDocument();
    expect(tenants.find('tn_ledger')!.trialEndsAt).toBe(new Date(before).toISOString());

    await user.clear(days);
    await user.type(days, '30');
    await user.click(within(drawer).getByRole('button', { name: 'Extend trial' }));
    expect(await screen.findByText('Trial extended 30 days for Ledger Finance Academy')).toBeInTheDocument();
    expect(new Date(tenants.find('tn_ledger')!.trialEndsAt!).getTime()).toBe(before + 30 * DAY);
    expect(audit.all().some((a) => a.action === "Extended Ledger Finance Academy's trial by 30 days" && a.category === 'Billing')).toBe(
      true,
    );
    expect(within(drawer).getByText(/^Trial ends /)).toBeInTheDocument();
  });

  it('validates days on the server and refuses tenants that aren’t on a trial', async () => {
    signInAs('Owner');
    await expect(api.post('/tenants/tn_ledger/extend-trial', { days: 91 })).rejects.toMatchObject({
      status: 422,
      fieldErrors: { days: ['Extend the trial by 1 to 90 days.'] },
    });
    await expect(api.post('/tenants/tn_kodo/extend-trial', { days: 7 })).rejects.toMatchObject({
      status: 422,
      fieldErrors: { trial: ['Kodo Design School is not on a trial.'] },
    });
    // No body: the default 14 days.
    const before = new Date(tenants.find('tn_ledger')!.trialEndsAt!).getTime();
    await api.post('/tenants/tn_ledger/extend-trial');
    expect(new Date(tenants.find('tn_ledger')!.trialEndsAt!).getTime()).toBe(before + 14 * DAY);
  });

  it('shows a school paused for a missing card and reopens it with a new trial', async () => {
    signInAs('Owner');
    tenants.update('tn_kodo', {
      status: 'Suspended',
      suspensionReason: 'payment_method_required',
      trialEndsAt: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    const { user } = renderApp('/tenants');
    const row = await within(await table()).findByRole('row', { name: /Kodo Design School/ });
    expect(within(row).getByText('Paused — no card')).toBeInTheDocument();
    expect(within(row).getByText('At risk')).toBeInTheDocument();

    await user.click(within(row).getByRole('link', { name: 'Kodo Design School' }));
    const drawer = await screen.findByRole('dialog', { name: 'Kodo Design School' });
    expect(within(drawer).getByText(/the trial ended without a card/)).toBeInTheDocument();
    expect(within(drawer).getByText('No card on file')).toBeInTheDocument();
    expect(within(drawer).getByText(/^Trial ended /)).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: 'Reopen with a new trial' }));
    const days = within(drawer).getByLabelText('New trial length');
    await user.clear(days);
    await user.type(days, '7');
    await user.click(within(drawer).getByRole('button', { name: 'Start new trial' }));
    expect(await screen.findByText(/Kodo Design School reopened — new trial until/)).toBeInTheDocument();
    const kodo = tenants.find('tn_kodo')!;
    expect(kodo).toMatchObject({ status: 'Trial', suspensionReason: null });
    expect(Math.abs(new Date(kodo.trialEndsAt!).getTime() - (Date.now() + 7 * DAY))).toBeLessThan(60_000);
    expect(await within(drawer).findByText('Trial')).toBeInTheDocument();
  });

  it('hides the trial action without tenants.manage, and staff suspensions aren’t shown as paused', async () => {
    tenants.update('tn_kodo', { status: 'Suspended', suspensionReason: null });
    signInAs('Support');
    renderApp('/tenants/tn_ledger');
    const drawer = await screen.findByRole('dialog', { name: 'Ledger Finance Academy' });
    expect(within(drawer).queryByRole('button', { name: 'Extend trial' })).not.toBeInTheDocument();
    expect(within(drawer).getByText('No card on file')).toBeInTheDocument();
    const row = await within(await table()).findByRole('row', { name: /Kodo Design School/ });
    expect(within(row).getAllByText('Suspended').length).toBeGreaterThan(0);
    expect(within(row).queryByText('Paused — no card')).not.toBeInTheDocument();
  });

  it('invoices the first period at once when the platform trial is 0 days (no card yet → Past due)', async () => {
    signInAs('Owner');
    platformSettings.patch({ trialDays: 0 });
    const tn = await api.post<{ data: { id: string; status: string; trialEndsAt: string | null } }>('/tenants', {
      name: 'Zero Trial School',
      ownerEmail: 'owner@zerotrial.test',
      plan: 'launch',
    });
    expect(tn.data).toMatchObject({ status: 'Past due', trialEndsAt: null });
    expect(invoices.where((v) => v.tenantId === tn.data.id)).toMatchObject([{ status: 'Past due', plan: 'Launch' }]);
  });

  it('reports the suspension reason only while suspended, and a card-verified trial', async () => {
    signInAs('Owner');
    tenants.update('tn_ledger', { cardVerified: true });
    const ledger = await api.get<{ data: { suspensionReason: string | null; trial: unknown } }>('/tenants/tn_ledger');
    expect(ledger.data).toMatchObject({ suspensionReason: null, trial: { cardVerified: true, requiresCard: false, paused: false } });
    await api.post('/tenants/tn_kodo/suspend');
    const kodo = await api.get<{ data: { suspensionReason: string | null } }>('/tenants/tn_kodo');
    expect(kodo.data.suspensionReason).toBe('staff');
    await api.post('/tenants/tn_kodo/reactivate');
    expect((await api.get<{ data: { suspensionReason: string | null } }>('/tenants/tn_kodo')).data.suspensionReason).toBeNull();
  });
});

describe('impersonation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for a reason, required while the platform setting is on, and audits it', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    signInAs('Owner');
    const { user } = renderApp('/tenants/tn_kodo');
    const drawer = await screen.findByRole('dialog', { name: 'Kodo Design School' });
    await user.click(within(drawer).getByRole('button', { name: 'Sign in as owner' }));
    const reason = within(drawer).getByLabelText('Reason for signing in');
    expect(reason).toHaveFocus();
    await user.click(within(drawer).getByRole('button', { name: 'Start read-only session' }));
    expect(await within(drawer).findByText('Give a reason for signing in as this tenant (5–300 characters).')).toBeInTheDocument();
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(open).not.toHaveBeenCalled();

    await user.type(reason, 'Checkout error on ticket #4812');
    await user.click(within(drawer).getByRole('button', { name: 'Start read-only session' }));
    // The real tenant dashboard opens in a new tab on the signed handoff link (no in-console mirror).
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(expect.stringContaining('/auth/handoff?token='), '_blank', 'noopener,noreferrer'),
    );
    expect(within(drawer).queryByRole('dialog', { name: /Impersonating/ })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Open the dashboard' })).toHaveAttribute('target', '_blank');
    expect(
      audit.all().some((a) => a.action === 'Signed in as owner of Kodo Design School (read-only) — reason: Checkout error on ticket #4812'),
    ).toBe(true);
  });

  it('starts without a reason when the platform doesn’t require one', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    platformSettings.patch({ impersonationRequiresReason: false, impersonationMaxMinutes: 60 });
    signInAs('Owner');
    const { user } = renderApp('/tenants/tn_kodo');
    const drawer = await screen.findByRole('dialog', { name: 'Kodo Design School' });
    await user.click(within(drawer).getByRole('button', { name: 'Sign in as owner' }));
    await user.click(within(drawer).getByRole('button', { name: 'Start read-only session' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(audit.all().some((a) => a.action === 'Signed in as owner of Kodo Design School (read-only)')).toBe(true);
  });
});

describe('provisioning', () => {
  it('shows server validation for a duplicate name', async () => {
    signInAs('Owner');
    const { user } = renderApp('/tenants');
    await user.click(await screen.findByRole('button', { name: /new tenant/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Provision a new tenant' });
    await user.type(within(dialog).getByLabelText('School name'), 'Amplify Coaching');
    await user.type(within(dialog).getByLabelText('Owner email'), 'x@y.com');
    await user.click(within(dialog).getByRole('button', { name: /create tenant/i }));
    expect(await within(dialog).findByText('A tenant with this name already exists.')).toBeInTheDocument();
  });

  it('creates a tenant and opens it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    signInAs('Owner');
    const { user, router } = renderApp('/tenants');
    await user.click(await screen.findByRole('button', { name: /new tenant/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Provision a new tenant' });
    await user.type(within(dialog).getByLabelText('School name'), 'Harbor Music School');
    await user.type(within(dialog).getByLabelText('Owner email'), 'ana.lopez@harbor.com');
    await user.click(within(dialog).getByRole('radio', { name: 'Growth' }));
    await user.click(within(dialog).getByRole('button', { name: /create tenant/i }));
    expect(await screen.findByRole('dialog', { name: 'Harbor Music School' })).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(/^\/tenants\/tn_/);
    const row = tenants.where((t) => t.name === 'Harbor Music School')[0]!;
    expect(row).toMatchObject({ plan: 'Growth', status: 'Trial', ownerName: 'Ana Lopez' });
    // Laravel's TenantRules take the lowercase plan key: the console sends `growth`, not the display name.
    const bodies = fetchSpy.mock.calls
      .filter(([input, init]) => String(input instanceof Request ? input.url : input).endsWith('/tenants') && init?.method === 'POST')
      .map(([, init]) => JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { plan: string });
    expect(bodies).toEqual([expect.objectContaining({ plan: 'growth' })]);
    fetchSpy.mockRestore();
  });

  it('previews the subdomain on the configured platform domain (no hard-coded host)', async () => {
    platformSettings.patch({ primaryDomain: 'schools.example.com' });
    signInAs('Owner');
    const { user } = renderApp('/tenants');
    await user.click(await screen.findByRole('button', { name: /new tenant/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Provision a new tenant' });
    await user.type(within(dialog).getByLabelText('School name'), 'Harbor Music School');
    expect(await within(dialog).findByText('harbor-music-school.schools.example.com')).toBeInTheDocument();
  });

  it('accepts the plan case-insensitively, like Laravel', async () => {
    signInAs('Owner');
    const res = await fetch(`http://localhost${env.apiPrefix}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Case Test School', owner_email: 'case@test.com', plan: 'SCALE' }),
    });
    expect(res.status).toBe(201);
    expect(tenants.where((t) => t.name === 'Case Test School')[0]?.plan).toBe('Scale');
    const bad = await fetch(`http://localhost${env.apiPrefix}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Plan School', owner_email: 'bad@test.com', plan: 'enterprise' }),
    });
    expect(bad.status).toBe(422);
  });
});

describe('email owners composer', () => {
  const openComposer = async () => {
    signInAs('Owner');
    const app = renderApp('/tenants');
    const t = await table();
    await app.user.click(await within(t).findByRole('checkbox', { name: 'Select Amplify Coaching' }));
    await app.user.click(screen.getByRole('button', { name: 'Email owners' }));
    const dialog = await screen.findByRole('dialog', { name: 'Email 1 tenant owner' });
    return { ...app, dialog };
  };

  it('writes the message in the rich text editor (Markdown, no preview pane) with merge tags at the caret', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { user, dialog } = await openComposer();
    // The message is the rich text editor, not a plain textarea, and there is no separate preview.
    const box = await within(dialog).findByRole('textbox', { name: 'Message' });
    expect(box).toHaveAttribute('contenteditable', 'true');
    expect(within(dialog).queryByRole('textbox', { name: /preview/i })).not.toBeInTheDocument();
    expect(dialog.querySelector('textarea')).toBeNull();
    expect(within(dialog).getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    // Images aren't offered: email bodies never carry them.
    expect(within(dialog).queryByRole('button', { name: 'Image' })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Subject'), 'Hello {{owner_name}');
    await fillRichText(user, box, 'Hi ');
    await user.click(within(dialog).getByRole('button', { name: '{owner_name}' }));
    await waitFor(() => expect(box).toHaveTextContent('Hi {owner_name}'));
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(within(dialog).getByRole('button', { name: 'Bold' }));
    await user.click(within(dialog).getByRole('button', { name: 'Send email' }));

    expect(await screen.findByText('Email sent to 1 owner')).toBeInTheDocument();
    const sent = fetchSpy.mock.calls
      .filter(([input, init]) => String(input instanceof Request ? input.url : input).endsWith('/tenants/email') && init?.method === 'POST')
      .map(([, init]) => JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { subject: string; body: string });
    // Stored as Markdown; the merge tag stays unescaped so the server can fill it in.
    expect(sent).toEqual([expect.objectContaining({ subject: 'Hello {owner_name}', body: '**Hi {owner_name}**' })]);
    expect(audit.all().some((a) => a.action === 'Emailed 1 tenant owner: "Hello {owner_name}"')).toBe(true);
    fetchSpy.mockRestore();
  });

  it('requires a subject and a message', async () => {
    const { user, dialog } = await openComposer();
    await within(dialog).findByRole('textbox', { name: 'Message' });
    await user.click(within(dialog).getByRole('button', { name: 'Send email' }));
    expect(await within(dialog).findByText('Add a subject line.')).toBeInTheDocument();
    expect(within(dialog).getByText('Write a message.')).toBeInTheDocument();
  });
});
