import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Every screen in the console: [url, h1 title]. Keep in sync with src/app/screens.ts. */
export const SCREENS: [string, string][] = [
  ['/', 'Platform overview'],
  ['/tenants', 'Tenants'],
  ['/support', 'Support'],
  ['/revenue', 'Revenue'],
  ['/plans', 'Plans & pricing'],
  ['/extensions', 'Extensions & add-ons'],
  ['/analytics/growth', 'Growth analytics'],
  ['/analytics/usage', 'Usage & infrastructure'],
  ['/analytics/health', 'System health'],
  ['/analytics/ai', 'AI usage & cost'],
  ['/analytics/experiments', 'Experiments'],
  ['/governance/compliance', 'Compliance & privacy'],
  ['/governance/moderation', 'Trust & moderation'],
  ['/governance/policies', 'Policies & terms'],
  ['/governance/regions', 'Data residency'],
  ['/governance/abuse', 'Abuse & limits'],
  ['/audit', 'Audit log'],
  ['/platform/flags', 'Flags & system status'],
  ['/platform/media', 'Video & storage'],
  ['/platform/deliverability', 'Email deliverability'],
  ['/platform/certificates', 'Certificate authority'],
  ['/platform/standards', 'Standards & conformance'],
  ['/platform/api', 'API & webhooks'],
  ['/platform/entitlements', 'Plan entitlements'],
  ['/platform/backup', 'Backup & restore'],
  ['/settings', 'Console settings'],
  ['/announcements', 'Announcements'],
  ['/staff', 'Platform staff'],
];

/** Collects page errors and console errors (ignoring the expected 401 from a signed-out session probe). */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Waits until the screen has rendered real content (no skeletons left). */
export async function waitForScreen(page: Page, title: string) {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.locator('#main .skeleton')).toHaveCount(0, { timeout: 10_000 });
}

/** Fails on serious or critical WCAG 2.2 A/AA violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

export async function setDarkMode(page: Page) {
  await page.addInitScript(() => localStorage.setItem('sac-ui', 'Dark'));
}
