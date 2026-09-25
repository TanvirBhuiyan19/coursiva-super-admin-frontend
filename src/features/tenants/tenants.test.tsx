import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { audit, tenants } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';

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
  });
});
