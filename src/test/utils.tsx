import type { ReactElement } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import Toasts from '@/components/shell/Toasts';
import { routes } from '@/app/router';
import { createQueryClient, setActiveQueryClient } from '@/lib/queryClient';
import { session, staff } from '@/mocks/collections';
import type { Role } from '@/features/auth/permissions';

/** Signs the mock API in as the first staff member with `role` (bypassing the login form). */
export function signInAs(role: Role = 'Owner') {
  const user = staff.where((s) => s.role === role && s.status === 'Active')[0];
  if (!user) throw new Error(`No active ${role} in the mock staff table`);
  session.patch({ userId: user.id, pendingTwoFactorUserId: null });
  return user;
}

function newClient() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } });
  setActiveQueryClient(client);
  return client;
}

/** Renders the real app routes at `path` with fresh query cache. */
export function renderApp(path = '/') {
  const client = newClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, user, router, client };
}

/** Renders a single component inside providers and a memory router. */
export function renderWithProviders(ui: ReactElement, { path = '/', routePath = '*' }: { path?: string; routePath?: string } = {}) {
  const client = newClient();
  const routeList: RouteObject[] = [{ path: routePath, element: ui }];
  const router = createMemoryRouter(routeList, { initialEntries: [path] });
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
      <Toasts />
    </QueryClientProvider>,
  );
  return { ...utils, user, router, client };
}
