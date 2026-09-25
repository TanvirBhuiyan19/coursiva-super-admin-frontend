import { expect, test as setup } from '@playwright/test';

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
});
