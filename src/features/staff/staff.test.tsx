import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { audit, rolePermissions, staff } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { staffTables } from './mock';

const table = () => screen.findByRole('table', { name: 'Platform staff' });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });

describe('platform staff', () => {
  it('lists staff with KPIs and warns about accounts without 2FA', async () => {
    signInAs('Owner');
    renderApp('/staff');
    const t = await table();
    await waitFor(() => expect(within(t).getAllByRole('row')).toHaveLength(staff.all().length + 1)); // header + every staff member
    expect(await screen.findByText(/Lee Chen can sign in without 2FA/)).toBeInTheDocument();
    expect(screen.getByText('Impersonations · 7d')).toBeInTheDocument();
    // The Owner's own row is not editable.
    const me = await row(/Sam Ortega/);
    expect(within(me).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(me).getByText('Your account')).toBeInTheDocument();
  });

  it('invites a colleague and rejects a duplicate email with the server message', async () => {
    signInAs('Owner');
    const { user } = renderApp('/staff');
    const form = await screen.findByRole('form', { name: 'Invite staff' });
    await user.type(within(form).getByLabelText('Invite email'), 'Priya@coursiva.io');
    await user.click(within(form).getByRole('button', { name: 'Send invite' }));
    expect(await within(form).findByText('priya@coursiva.io is already on the platform team.')).toBeInTheDocument();

    await user.clear(within(form).getByLabelText('Invite email'));
    await user.type(within(form).getByLabelText('Invite email'), 'nina.park@coursiva.io');
    await user.selectOptions(within(form).getByLabelText('Role'), 'Finance');
    await user.click(within(form).getByRole('button', { name: 'Send invite' }));
    await row(/Nina Park/);
    await waitFor(async () => expect(await row(/Nina Park/)).toHaveClass('is-selected'));
    expect(staff.where((s) => s.email === 'nina.park@coursiva.io')[0]).toMatchObject({ role: 'Finance', status: 'Invited' });
  });

  it('validates the invite email client-side', async () => {
    signInAs('Owner');
    const { user } = renderApp('/staff');
    const form = await screen.findByRole('form', { name: 'Invite staff' });
    await user.type(within(form).getByLabelText('Invite email'), 'not-an-email');
    await user.click(within(form).getByRole('button', { name: 'Send invite' }));
    expect(await within(form).findByText('Enter a valid work email address.')).toBeInTheDocument();
  });

  it('changes a role, and suspends only after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp('/staff');
    const lee = await row(/Lee Chen/);
    await user.selectOptions(within(lee).getByRole('combobox', { name: 'Role for Lee Chen' }), 'Admin');
    await waitFor(() => expect(staff.find('st_lee')!.role).toBe('Admin'));
    expect(audit.all().some((a) => a.action === 'Changed Lee Chen’s staff role from Support to Admin')).toBe(true);

    await user.click(within(lee).getByRole('button', { name: 'Suspend Lee Chen' }));
    expect(staff.find('st_lee')!.status).toBe('Active');
    await user.click(within(lee).getByRole('button', { name: 'Confirm suspend' }));
    await waitFor(() => expect(staff.find('st_lee')!.status).toBe('Suspended'));
    expect(await within(await row(/Lee Chen/)).findByRole('button', { name: 'Reinstate Lee Chen' })).toBeInTheDocument();
  });

  it('grants time-limited elevation and records access reviews', async () => {
    signInAs('Owner');
    const { user } = renderApp('/staff');
    const priya = await row(/Priya Shah/);
    await user.click(within(priya).getByRole('button', { name: 'Elevate Priya Shah to Owner for 60 minutes' }));
    await waitFor(() => expect(staffTables.access.find('st_priya')!.elevatedUntil).not.toBeNull());
    const until = new Date(staffTables.access.find('st_priya')!.elevatedUntil!).getTime();
    expect(until - Date.now()).toBeGreaterThan(55 * 60_000);
    expect(await within(await row(/Priya Shah/)).findByRole('button', { name: 'Revoke elevation for Priya Shah' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm Lee Chen’s access' }));
    await waitFor(() => expect(Date.now() - new Date(staffTables.access.find('st_lee')!.lastReviewedAt!).getTime()).toBeLessThan(60_000));
  });

  it('refuses self-service role changes and self-suspension', async () => {
    signInAs('Admin');
    const self = await api.patch('/staff/st_priya', { role: 'Support' }).catch((e: unknown) => e);
    expect((self as ApiError).status).toBe(422);
    expect((self as ApiError).field('role')).toMatch(/your own role/);
    const suspend = await api.post('/staff/st_priya/suspend').catch((e: unknown) => e);
    expect((suspend as ApiError).status).toBe(422);
    expect(staff.find('st_priya')).toMatchObject({ role: 'Admin', status: 'Active' });
  });

  it('highlights the member from a deep link', async () => {
    signInAs('Owner');
    renderApp('/staff?member=st_fin');
    const omar = await row(/Omar Haddad/);
    expect(omar).toHaveClass('is-selected');
    await waitFor(() => expect(omar).toHaveFocus());
  });

  it('lets a Support user view staff but not manage them', async () => {
    signInAs('Support');
    renderApp('/staff');
    const t = await table();
    await waitFor(() => expect(within(t).getAllByRole('row')).toHaveLength(staff.all().length + 1));
    expect(screen.queryByRole('form', { name: 'Invite staff' })).not.toBeInTheDocument();
    expect(within(t).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(t).queryByRole('button', { name: /^Suspend/ })).not.toBeInTheDocument();
    const matrix = await screen.findByRole('table', { name: 'Role permissions' });
    expect(within(matrix).getByRole('button', { name: 'View billing — Support' })).toBeDisabled();
    const err = await api.post('/staff/invitations', { email: 'x@coursiva.io', role: 'Support' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });
});

describe('permission matrix', () => {
  it('keeps Owner locked', async () => {
    signInAs('Owner');
    renderApp('/staff');
    const matrix = await screen.findByRole('table', { name: 'Role permissions' });
    expect(within(matrix).getByRole('button', { name: 'Purge tenant data — Owner (locked)' })).toBeDisabled();
  });

  it('granting billing.view to Support shows Revenue in a Support user’s nav', async () => {
    signInAs('Support');
    const before = renderApp('/');
    const nav = await screen.findByRole('complementary', { name: 'Console navigation' });
    await within(nav).findByText('Tenants');
    expect(within(nav).queryByText('Revenue')).not.toBeInTheDocument();
    before.unmount();

    signInAs('Owner');
    const owner = renderApp('/staff');
    const matrix = await screen.findByRole('table', { name: 'Role permissions' });
    const cell = within(matrix).getByRole('button', { name: 'View billing — Support' });
    expect(cell).toHaveAttribute('aria-pressed', 'false');
    await owner.user.click(cell);
    await waitFor(() => expect(rolePermissions.get().Support).toContain('billing.view'));
    expect(audit.all().some((a) => a.action === 'Granted “View billing” to the Support role')).toBe(true);
    owner.unmount();

    signInAs('Support');
    renderApp('/');
    const nav2 = await screen.findByRole('complementary', { name: 'Console navigation' });
    expect(await within(nav2).findByText('Revenue')).toBeInTheDocument();
  });

  it('won’t let an Admin remove Manage staff from their own role', async () => {
    signInAs('Admin');
    const err = await api
      .put('/staff/roles/Admin', { permissions: rolePermissions.get().Admin.filter((p) => p !== 'staff.manage') })
      .catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(422);
    expect(rolePermissions.get().Admin).toContain('staff.manage');
  });
});
