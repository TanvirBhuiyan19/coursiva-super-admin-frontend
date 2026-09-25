import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { audit, extensionInclusions, tenants, staff } from '@/mocks/collections';
import { moduleOnForPlan, tenantModules } from '@/mocks/derive';
import { MODULES } from '@/mocks/reference';
import { renderApp, signInAs } from '@/test/utils';
import { extensionStore } from './mock';

const table = () => screen.findByRole('table', { name: 'Extension catalogue' });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });

describe('extension catalogue', () => {
  it('lists extensions with server-computed installs and MRR', async () => {
    signInAs('Owner');
    renderApp('/extensions');
    const rooms = await row(/Built-in live rooms/);
    // 7 installs; Growth + Scale are free, so only the 3 Launch tenants can pay → 3 × $29.
    expect(within(rooms).getByText('3 paying · 4 free')).toBeInTheDocument();
    expect(within(rooms).getByText('$87')).toBeInTheDocument();
    expect(within(rooms).getByText('Free on Growth, Scale')).toBeInTheDocument();
    expect(within(await table()).getAllByRole('row')).toHaveLength(13); // header + 12
    expect(await screen.findByText('Extension MRR')).toBeInTheDocument();
  });

  it('saves a price change on blur and audits it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/extensions');
    const price = within(await row(/AI studio/)).getByRole('textbox', { name: 'AI studio price per month' });
    await user.clear(price);
    await user.type(price, '35');
    await user.tab();
    await waitFor(() => expect(extensionStore.get().prices.ai).toBe(35));
    expect(audit.all().some((a) => a.action === 'Changed AI studio price from $29 to $35/mo' && a.category === 'Billing')).toBe(true);
    expect(await screen.findByText(/AI studio is now \$35\/mo/)).toBeInTheDocument();
  });

  it('rejects an invalid price inline', async () => {
    signInAs('Owner');
    const { user } = renderApp('/extensions');
    const price = within(await row(/AI studio/)).getByRole('textbox', { name: 'AI studio price per month' });
    await user.clear(price);
    await user.type(price, '0{Enter}');
    expect(await screen.findByText('Whole dollars, $1–$999')).toBeInTheDocument();
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(extensionStore.get().prices.ai).toBeUndefined();
  });

  it('un-including an extension from a plan flips the module entitlement for that plan', async () => {
    signInAs('Owner');
    const { user, unmount } = renderApp('/extensions');
    const liveadmin = MODULES.find((m) => m.id === 'liveadmin')!;
    expect(moduleOnForPlan(liveadmin, 'Growth')).toBe(true);
    const growth = within(await row(/Built-in live rooms/)).getByRole('button', { name: 'Free on Growth: Built-in live rooms' });
    expect(growth).toHaveAttribute('aria-pressed', 'true');
    await user.click(growth);
    await waitFor(() => expect(extensionInclusions.get().rooms).toEqual(['Scale']));
    expect(moduleOnForPlan(liveadmin, 'Growth')).toBe(false);
    expect(tenantModules(tenants.find('tn_amplify')!).find((m) => m.id === 'liveadmin')?.enabled).toBe(false);
    expect(audit.all().some((a) => a.action === 'Built-in live rooms: now charged on Growth')).toBe(true);
    unmount();

    renderApp('/platform/entitlements');
    expect(await screen.findByRole('switch', { name: 'Live classes on Growth' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Live classes on Scale' })).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles a selling rule and hides an extension', async () => {
    signInAs('Owner');
    const { user } = renderApp('/extensions');
    await user.click(await screen.findByRole('switch', { name: 'Prorate mid-cycle adds' }));
    await waitFor(() => expect(extensionStore.get().rulesOff).toEqual(['prorate']));
    await user.click(within(await row(/Proctored exams/)).getByRole('button', { name: 'Hide Proctored exams' }));
    await waitFor(() => expect(extensionStore.get().hidden).toEqual(['exam']));
    expect(await within(await row(/Proctored exams/)).findByText('Hidden')).toBeInTheDocument();
  });

  it('is read-only without billing.manage, in the UI and the API', async () => {
    // The seeded read-only staffer hasn't accepted their invite yet; activate them for this test.
    staff.where((x) => x.role === 'Read-only').forEach((x) => staff.update(x.id, { status: 'Active' }));
    signInAs('Read-only');
    renderApp('/extensions');
    const ai = await row(/AI studio/);
    expect(within(ai).getByRole('button', { name: 'Free on Scale: AI studio' })).toBeDisabled();
    expect(within(ai).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(ai).queryByRole('button', { name: /Hide/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Let tenants self-serve' })).toBeDisabled();
    await expect(api.put('/extensions/ai/plans', { plans: [] })).rejects.toMatchObject({ status: 403 });
    await expect(api.patch('/extensions/ai', { price: 5 })).rejects.toMatchObject({ status: 403 });
    expect(extensionInclusions.get().ai).toBeUndefined();
  });
});
