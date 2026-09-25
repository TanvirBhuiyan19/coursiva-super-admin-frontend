import { expect, test } from '@playwright/test';
import { trackErrors, waitForScreen } from './helpers';

test('command palette finds a tenant and opens its drawer', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await waitForScreen(page, 'Platform overview');
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Search the console' });
  await expect(input).toBeFocused();
  await input.fill('@nordic');
  await expect(page.getByRole('option', { name: /Nordic Yoga School/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Nordic Yoga School' })).toBeVisible();
  await expect(page).toHaveURL(/\/tenants\/tn_nordic$/);
  expect(errors).toEqual([]);
});

test('keyboard focus is trapped in dialogs and restored on close', async ({ page }) => {
  await page.goto('/tenants');
  await waitForScreen(page, 'Tenants');
  const trigger = page.getByRole('button', { name: /new tenant/i });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Provision a new tenant' });
  await expect(dialog.getByLabel('School name')).toBeFocused();
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('tenant filters live in the URL and survive a reload', async ({ page }) => {
  await page.goto('/tenants');
  await waitForScreen(page, 'Tenants');
  await page.getByRole('group', { name: 'Filter by plan' }).getByRole('button', { name: 'Scale' }).click();
  await expect(page).toHaveURL(/plan=Scale/);
  await page.reload();
  await waitForScreen(page, 'Tenants');
  await expect(page.getByRole('group', { name: 'Filter by plan' }).getByRole('button', { name: 'Scale' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('table', { name: 'Tenants' }).getByRole('row')).toHaveCount(4); // header + 3 Scale tenants
});

test('signing out returns to the login page and protects routes', async ({ page }) => {
  await page.goto('/');
  await waitForScreen(page, 'Platform overview');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/tenants');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
