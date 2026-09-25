import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.STORYBOOK_PORT ?? 6007);

/** Axe checks over the static Storybook build (`npm run build-storybook` first). */
export default defineConfig({
  testDir: './e2e/storybook',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 180_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  webServer: {
    command: `npx vite preview --outDir storybook-static --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
