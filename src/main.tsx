import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
// Self-hosted variable fonts (weight axis, Latin subsets fetched on demand via unicode-range).
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/bricolage-grotesque/wght.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import { AppProviders } from '@/app/providers';
import { createRouter } from '@/app/router';
import { useUi } from '@/store/ui';
import { whenIdle } from '@/lib/lazy';
import { initErrorReporting, reportError } from '@/lib/reportError';
import { createQueryClient, setActiveQueryClient } from '@/lib/queryClient';
import { applyTokens } from '@/theme/themes';
import { applyDocumentLocale } from '@/lib/i18n';
import { I18nBoundary } from '@/lib/i18n/I18nBoundary';

// Paint the saved theme before the first render so there's no flash of the wrong mode.
const { brand, uiMode } = useUi.getState();
applyTokens(brand, uiMode);
applyDocumentLocale();

async function bootstrap() {
  // Compared directly (not via env.ts) so production builds without mocks drop the mock API chunk entirely.
  if (import.meta.env.VITE_ENABLE_MOCKS === 'true' || (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS !== 'false')) {
    const { startMockApi } = await import('@/mocks/browser');
    await startMockApi();
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('#root element missing');
  // Query client first, then the router: the initial navigation's loader can already prefetch page data.
  const queryClient = createQueryClient();
  setActiveQueryClient(queryClient);
  const router = createRouter();
  createRoot(root).render(
    <StrictMode>
      <AppProviders client={queryClient}>
        <I18nBoundary>
          <RouterProvider router={router} />
        </I18nBoundary>
      </AppProviders>
    </StrictMode>,
  );

  // Error reporting (Sentry, only when a DSN is configured) — loaded right after first paint.
  void initErrorReporting();
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'unhandledrejection' }));

  // Real-user Web Vitals, loaded once the app is idle (separate chunk, off the critical path).
  whenIdle(() => void import('@/lib/vitals').then((m) => m.startVitals()));
}

void bootstrap();
