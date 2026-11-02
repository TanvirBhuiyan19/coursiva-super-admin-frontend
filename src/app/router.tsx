import { lazy } from 'react';
import { createBrowserRouter, type RouteObject, type ShouldRevalidateFunction } from 'react-router-dom';
import AppShell from '@/components/shell/AppShell';
import { RouteErrorPage } from '@/components/shell/RouteErrorPage';
import { pages, preloadScreen } from './pages';
import { SCREENS, type ScreenDef, type ScreenId } from './screens';
import { NotFound, RedirectIfAuthed, RequireAuth, RequirePermission } from './guards';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'));
// Public even when signed in: an emailed reset or invitation link is for the address in the link.
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'));

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

// Each top-level route has the console's error page, so an error on the sign-in path (or in the auth guard) never falls
// through to React Router's developer error screen.
const errorElement = <RouteErrorPage />;

export const routes: RouteObject[] = [
  {
    path: '/login',
    errorElement,
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/forgot-password',
    errorElement,
    element: (
      <RedirectIfAuthed>
        <ForgotPasswordPage />
      </RedirectIfAuthed>
    ),
  },
  { path: '/reset-password', element: <ResetPasswordPage />, errorElement },
  {
    path: '/',
    errorElement,
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [...(SCREENS as readonly ScreenDef[]).map(screenRoute), { path: '*', element: <NotFound /> }],
  },
];

export const createRouter = () => createBrowserRouter(routes);
