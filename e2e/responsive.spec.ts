import { expect, test } from '@playwright/test';
import { SCREENS, trackErrors, waitForScreen } from './helpers';

// Phone-width pass: nothing overflows horizontally and the off-canvas nav opens and closes.
test('mobile navigation drawer', async ({ page }) => {
  await page.goto('/');
  await waitForScreen(page, 'Platform overview');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('complementary', { name: 'Console navigation' });
  await nav.getByRole('link', { name: 'Tenants' }).click();
  await waitForScreen(page, 'Tenants');
  await expect(page.locator('.shell')).not.toHaveClass(/nav-open/);
});

for (const [url, title] of SCREENS) {
  test(`no horizontal overflow: ${title}`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(url);
    await waitForScreen(page, title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
