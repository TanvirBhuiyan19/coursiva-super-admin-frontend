import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { audit } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { backupTables } from './mock';

const PATH = '/platform/backup';

async function openStageForm(user: ReturnType<typeof renderApp>['user']) {
  const table = await screen.findByRole('table', { name: 'Restore points' });
  const buttons = await within(table).findAllByRole('button', { name: /^Restore from/ });
  await user.click(buttons[1]!);
  return screen.findByRole('form', { name: /^Restore from/ });
}

describe('backup & restore', () => {
  it('lists restore points and backup KPIs', async () => {
    signInAs('Owner');
    renderApp(PATH);
    const table = await screen.findByRole('table', { name: 'Restore points' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(6)); // header + 5 points
    expect(within(table).getByText('Manual — before pricing migration')).toBeInTheDocument();
    expect(await screen.findByText('12 / 12 passed')).toBeInTheDocument();
    expect(screen.getByText('Primary — Cloudflare R2 · eu-west')).toBeInTheDocument();
  });

  it('needs a second staff member to approve a staged restore', async () => {
    const sam = signInAs('Owner');
    const first = renderApp(PATH);
    const form = await openStageForm(first.user);
    await first.user.click(within(form).getByRole('button', { name: 'Stage restore' }));

    const banner = await screen.findByRole('status', { name: 'Staged restore' });
    expect(within(banner).getByText(/you can’t approve a restore you staged/)).toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: 'Approve as second staff' })).not.toBeInTheDocument();
    const staged = backupTables.restores.all()[0]!;
    expect(staged).toMatchObject({ stagedById: sam.id, approvedById: null, dryRun: true, scope: 'platform' });

    // The API refuses a self-approval even if the UI were bypassed.
    const err = await api.post(`/backup/restores/${staged.id}/approve`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect(backupTables.restores.find(staged.id)!.approvedById).toBeNull();
    first.unmount();

    const priya = signInAs('Admin');
    const second = renderApp(PATH);
    const banner2 = await screen.findByRole('status', { name: 'Staged restore' });
    await second.user.click(within(banner2).getByRole('button', { name: 'Approve as second staff' }));
    await second.user.click(within(banner2).getByRole('button', { name: 'Confirm dry run' }));
    expect(await screen.findByText(/Dry run approved/)).toBeInTheDocument();
    expect(backupTables.restores.find(staged.id)).toMatchObject({ approvedById: priya.id, stagedById: sam.id });
    expect(await screen.findByRole('status', { name: 'Restore in progress' })).toBeInTheDocument();
    expect(audit.all().some((a) => a.action.startsWith('Approved dry-run restore of Full platform') && a.actorName === 'Priya Shah')).toBe(
      true,
    );
  });

  it('validates the point-in-time as HH:MM', async () => {
    signInAs('Owner');
    const { user } = renderApp(PATH);
    const form = await openStageForm(user);
    await user.type(within(form).getByLabelText(/Point-in-time \(optional/), '25:70');
    await user.click(within(form).getByRole('button', { name: 'Stage restore' }));
    expect(await within(form).findByText('Enter a time as HH:MM (24-hour), e.g. 13:42.')).toBeInTheDocument();
    expect(backupTables.restores.all()).toHaveLength(0);
  });

  it('stages a point-in-time restore of a single tenant', async () => {
    signInAs('Owner');
    const { user } = renderApp(PATH);
    const form = await openStageForm(user);
    await user.selectOptions(within(form).getByLabelText('Point-in-time day'), within(form).getByRole('option', { name: 'Yesterday' }));
    await user.type(within(form).getByLabelText(/Point-in-time \(optional/), '13:42');
    const scope = within(form).getByLabelText('Scope');
    await within(scope).findByRole('option', { name: 'Tenant: Kodo Design School' });
    await user.selectOptions(scope, 'tn_kodo');
    await user.click(within(form).getByRole('button', { name: 'Stage restore' }));
    expect(await screen.findByRole('status', { name: 'Staged restore' })).toBeInTheDocument();
    const r = backupTables.restores.all()[0]!;
    expect(r).toMatchObject({ scope: 'tenant', tenantId: 'tn_kodo', scopeLabel: 'Kodo Design School' });
    expect(r.pointInTime).toMatch(/T13:42:00/);
  });

  it('turns WORM off only after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp(PATH);
    await user.click(await screen.findByRole('button', { name: 'Turn off WORM' }));
    expect(backupTables.settings.get().worm).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Confirm — remove lock' }));
    await waitFor(() => expect(backupTables.settings.get().worm).toBe(false));
    expect(audit.all().some((a) => a.action === 'Disabled backup immutability lock (WORM)')).toBe(true);
    expect(await screen.findByRole('button', { name: 'Turn on WORM' })).toBeInTheDocument();
  });

  it('saves the retention policy and rejects out-of-range values', async () => {
    signInAs('Owner');
    const { user } = renderApp(PATH);
    const days = await screen.findByLabelText('Keep nightly backups (days)');
    await user.clear(days);
    await user.type(days, '3');
    await user.click(screen.getByRole('button', { name: 'Save policy' }));
    expect(await screen.findByText('Keep nightly backups for 7 to 365 days.')).toBeInTheDocument();
    await user.clear(days);
    await user.type(days, '45');
    await user.click(screen.getByRole('button', { name: 'Save policy' }));
    await waitFor(() => expect(backupTables.settings.get().retentionDays).toBe(45));
  });

  it('queues a per-tenant export', async () => {
    signInAs('Owner');
    const { user } = renderApp(PATH);
    await user.click(await screen.findByRole('button', { name: 'Export data for Amplify Coaching' }));
    await waitFor(() => expect(backupTables.exports.all()).toHaveLength(1));
    expect(backupTables.exports.all()[0]).toMatchObject({ tenantId: 'tn_amplify', format: 'json', includeMedia: true });
  });

  it('is read-only for roles without platform.manage', async () => {
    signInAs('Support');
    renderApp(PATH);
    const table = await screen.findByRole('table', { name: 'Restore points' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(6));
    expect(within(table).queryByRole('button', { name: /^Restore from/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back up now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off WORM' })).not.toBeInTheDocument();
    const err = await api.post('/backup/run').catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(403);
  });
});
