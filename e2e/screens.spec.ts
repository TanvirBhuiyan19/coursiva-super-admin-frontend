import { expect, test } from '@playwright/test';
import { expectAccessible, SCREENS, setDarkMode, trackErrors, waitForScreen } from './helpers';

// Every screen loads without errors, has no horizontal overflow, and passes an axe scan — in both themes.
for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    for (const [url, title] of SCREENS) {
      test(`${title} (${url})`, async ({ page }) => {
        if (theme === 'dark') await setDarkMode(page);
        const errors = trackErrors(page);
        await page.goto(url);
        await waitForScreen(page, title);
        const text = await page.locator('#main').innerText();
        expect(text).not.toMatch(/\bNaN\b|undefined|\[object Object\]/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expectAccessible(page);
        expect(errors).toEqual([]);
      });
    }
  });
}
