import { expect, test as setup } from '@playwright/test';
import { SCREENS } from './helpers';

// Signs in once through the real login + 2FA flow and saves the session (the mock API keeps it in localStorage).
setup('sign in as platform owner', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('sam@coursiva.io');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByLabel('Authentication code').fill('123456');
  await page.getByRole('button', { name: /verify/i }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/owner.json' });

  // The dev server compiles each lazy page on its first request. Opening every screen once here, before the parallel
  // workers start, keeps a cold server (slow on a 2-core CI runner) from showing a page's loading state past a test's wait.
  setup.setTimeout(240_000);
  for (const [url, title] of SCREENS) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#main .skeleton')).toHaveCount(0, { timeout: 30_000 });
  }
});
