import { expect, test } from '@playwright/test';
import { trackErrors, waitForScreen } from './helpers';

// These run against the compiled app (React Compiler on), so they also guard compiler-sensitive screens.

test('hovering a nav link prefetches the screen’s code and data before the click', async ({ page }) => {
  await page.goto('/');
  await waitForScreen(page, 'Platform overview');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.getByRole('navigation').getByRole('link', { name: 'Tenants' }).hover();
  await expect
    .poll(() => requests.some((u) => /tenants\.page-.*\.js|\/src\/features\/tenants\/pages\/tenants\.page\.tsx/.test(u)))
    .toBe(true);
  // Data is warmed too: the list request goes out on hover.
  await expect.poll(() => requests.some((u) => u.includes('/api/v1/admin/tenants?page=1&per_page=25'))).toBe(true);
});

test('hovering a tenant row warms its drawer', async ({ page }) => {
  await page.goto('/tenants');
  await waitForScreen(page, 'Tenants');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.getByRole('row', { name: /Nordic Yoga School/ }).hover();
  await expect.poll(() => requests.some((u) => u.endsWith('/api/v1/admin/tenants/tn_nordic'))).toBe(true);
});

test('compiled form screens keep live validation and unsaved-change tracking', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/plans');
  await waitForScreen(page, 'Plans & pricing');
  const save = page.getByRole('button', { name: /save pricing/i });
  await expect(save).toBeDisabled();
  await page.getByLabel('Growth monthly price').fill('449');
  await expect(save).toBeEnabled();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByLabel('Growth monthly price')).toHaveValue('399');

  await page.goto('/settings');
  await waitForScreen(page, 'Console settings');
  await page.getByLabel('Trial length (days)').fill('90');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('The trial length must be between 7 and 60 days.')).toBeVisible();
  expect(errors).toEqual([]);
});
