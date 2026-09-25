import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/server';

// Async queries (findBy*, waitFor) get 4 s: the default 1 s is flaky when many test files run in parallel.
configure({ asyncUtilTimeout: 4000 });

// jsdom has no layout: give elements an offsetParent so focus-trap logic treats them as visible.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  get() {
    return (this as HTMLElement).parentNode;
  },
});
window.scrollTo = () => undefined;
HTMLElement.prototype.scrollTo = () => undefined;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetDb());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
