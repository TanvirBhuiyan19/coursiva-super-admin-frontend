import { lazy } from 'react';
import { createBrowserRouter, type RouteObject, type ShouldRevalidateFunction } from 'react-router-dom';
import AppShell from '@/components/shell/AppShell';
import { pages, preloadScreen } from './pages';
import { SCREENS, type ScreenDef, type ScreenId } from './screens';
import { NotFound, RedirectIfAuthed, RequireAuth, RequirePermission } from './guards';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));

function screenRoute(s: ScreenDef): RouteObject {
  const Page = pages[s.id] ?? NotFound;
  const element = (
    <RequirePermission permission={s.permission}>
      <Page />
    </RequirePermission>
  );
  // Start the page chunk and its data in parallel as soon as navigation begins (never blocks the transition).
  const loader = () => {
    preloadScreen(s.id as ScreenId);
    return null;
  };
  // Only entering a screen preloads; filter/search/page changes (query string only) don't re-run the loader.
  const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl }) => currentUrl.pathname !== nextUrl.pathname;
  const route = { element, loader, shouldRevalidate };
  // `/*` lets a page own nested routes (e.g. /tenants/:tenantId opens the tenant drawer).
  return s.path === '/' ? { index: true, ...route } : { path: s.path.slice(1) + '/*', ...route };
}

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [...(SCREENS as readonly ScreenDef[]).map(screenRoute), { path: '*', element: <NotFound /> }],
  },
];

export const createRouter = () => createBrowserRouter(routes);
