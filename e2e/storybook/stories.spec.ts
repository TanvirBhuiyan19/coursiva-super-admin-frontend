// Accessibility gate for the component catalogue: every story, in light and dark themes, must have
// zero axe violations (WCAG 2.2 AA). Runs against the static Storybook build — see playwright.storybook.config.ts.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

interface IndexEntry {
  id: string;
  title: string;
  name: string;
  type: 'story' | 'docs';
}

test('every story renders without axe violations (light + dark)', async ({ page, request }) => {
  const index = (await (await request.get('/index.json')).json()) as { entries: Record<string, IndexEntry> };
  const stories = Object.values(index.entries).filter((e) => e.type === 'story');
  expect(stories.length).toBeGreaterThan(20);

  const failures: string[] = [];
  for (const story of stories) {
    for (const mode of ['Light', 'Dark']) {
      await page.goto(`/iframe.html?id=${story.id}&viewMode=story&globals=mode:${mode}`);
      await page.locator('#storybook-root > *').first().waitFor();
      await page.waitForTimeout(150); // theme tokens are applied in an effect
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      for (const v of violations) failures.push(`${story.title} › ${story.name} [${mode}]: ${v.id} — ${v.help} (${v.nodes.length})`);
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
