import { useEffect, type ReactNode } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '../src/styles/base.css';
import '../src/styles/ui.css';
import '../src/styles/shell.css';
import { LOCALES, setLocale, type Locale } from '../src/lib/i18n';
import { I18nBoundary } from '../src/lib/i18n/I18nBoundary';
import { applyTokens, DEFAULT_BRAND, THEMES, type UiMode } from '../src/theme/themes';

function ThemeFrame({ mode, brand, children }: { mode: UiMode; brand: string; children: ReactNode }) {
  useEffect(() => applyTokens(brand, mode), [brand, mode]);
  return (
    <div style={{ padding: 24, background: 'var(--pg)', color: 'var(--tx)', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
      {children}
    </div>
  );
}

/** Theme tokens (brand + light/dark) exactly as the console applies them. */
const withTheme: Decorator = (Story, { globals }) => (
  <ThemeFrame mode={(globals.mode as UiMode | undefined) ?? 'Light'} brand={(globals.brand as string | undefined) ?? DEFAULT_BRAND}>
    <Story />
  </ThemeFrame>
);

/** Components may use links, route hooks or query hooks; give every story a router and a fresh query client. */
const withProviders: Decorator = (Story) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '*', element: <Story /> }]);
  return (
    <QueryClientProvider client={client}>
      <I18nBoundary>
        <RouterProvider router={router} />
      </I18nBoundary>
    </QueryClientProvider>
  );
};

const preview: Preview = {
  globalTypes: {
    mode: { description: 'Interface theme', toolbar: { title: 'Theme', icon: 'mirror', items: ['Light', 'Dark'], dynamicTitle: true } },
    brand: {
      description: 'Brand colour',
      toolbar: { title: 'Brand', icon: 'paintbrush', items: THEMES.map((t) => t[0]), dynamicTitle: true },
    },
    locale: {
      description: 'Locale (en-XA = pseudo-locale)',
      toolbar: { title: 'Locale', icon: 'globe', items: LOCALES.map((l) => ({ value: l.id, title: l.label })), dynamicTitle: true },
    },
  },
  initialGlobals: { mode: 'Light', brand: DEFAULT_BRAND, locale: 'en-US' },
  loaders: [
    async ({ globals }) => {
      await setLocale((globals.locale as Locale | undefined) ?? 'en-US');
      return {};
    },
  ],
  decorators: [withProviders, withTheme],
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i } },
    // WCAG 2.2 AA; e2e/storybook.spec.ts fails CI on any violation in any story.
    a11y: { options: { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, test: 'error' },
  },
};

export default preview;
