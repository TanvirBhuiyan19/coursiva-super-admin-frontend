import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { audit, entitlementOverrides, tenants, staff } from '@/mocks/collections';
import { tenantModules } from '@/mocks/derive';
import { renderApp, signInAs } from '@/test/utils';

const cell = (name: string) => screen.findByRole('switch', { name });

describe('plan entitlements', () => {
  it('renders the module grid, locked core modules and plan limits', async () => {
    signInAs('Owner');
    renderApp('/platform/entitlements');
    expect(await cell('Video analytics on Launch')).toHaveAttribute('aria-checked', 'false');
    expect(await cell('Video analytics on Growth')).toHaveAttribute('aria-checked', 'true');
    expect(await cell('Dashboard on Launch (core)')).toBeDisabled();
    const limits = await screen.findByRole('table', { name: 'Limits by plan' });
    const lr = within(limits).getByRole('row', { name: /Live room minutes/ });
    expect(within(lr).getByText('BYO only')).toBeInTheDocument();
    expect(within(lr).getByText('2,000/mo')).toBeInTheDocument();
  });

  it('overrides a cell, reaches tenants, and resets to defaults after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/entitlements');
    await user.click(await cell('Video analytics on Launch'));
    await waitFor(() => expect(entitlementOverrides.get()).toEqual({ 'vidanalytics:Launch': true }));
    expect(audit.all().some((a) => a.action === 'Video analytics added to the Launch plan' && a.category === 'Flags')).toBe(true);
    // Kodo is on Launch: its drawer now shows the module on by plan default.
    expect(tenantModules(tenants.find('tn_kodo')!).find((m) => m.id === 'vidanalytics')?.enabled).toBe(true);
    expect(await screen.findByText('1 override from plan defaults')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Overridden from the plan default' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(entitlementOverrides.get()).not.toEqual({});
    await user.click(screen.getByRole('button', { name: 'Confirm reset' }));
    await waitFor(() => expect(entitlementOverrides.get()).toEqual({}));
    expect(await cell('Video analytics on Launch')).toHaveAttribute('aria-checked', 'false');
    expect(audit.all().some((a) => a.action === 'Reset 1 entitlement override to plan defaults')).toBe(true);
  });

  it('filters modules with the search box and keeps it in the URL', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/entitlements');
    await user.type(await screen.findByRole('searchbox', { name: 'Find a module' }), 'zzz');
    expect(await screen.findByText('No module matches “zzz”')).toBeInTheDocument();
    expect(router.state.location.search).toContain('q=zzz');
  });

  it('rejects core modules and sends cells as an array', async () => {
    signInAs('Owner');
    await expect(api.put('/entitlements', { cells: [{ moduleId: 'dashboard', plan: 'Launch', enabled: false }] })).rejects.toMatchObject({
      status: 422,
    });
    expect(entitlementOverrides.get()).toEqual({});
  });

  it('is read-only without platform.manage', async () => {
    // The seeded read-only staffer hasn't accepted their invite yet; activate them for this test.
    staff.where((x) => x.role === 'Read-only').forEach((x) => staff.update(x.id, { status: 'Active' }));
    signInAs('Read-only');
    renderApp('/platform/entitlements');
    expect(await cell('Video analytics on Launch')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).not.toBeInTheDocument();
    await expect(api.put('/entitlements', { cells: [{ moduleId: 'inbox', plan: 'Launch', enabled: false }] })).rejects.toMatchObject({
      status: 403,
    });
    expect(entitlementOverrides.get()).toEqual({});
  });
});
