import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

/** Starts the mock API in the browser. Unhandled API calls warn so missing mocks are obvious. */
export async function startMockApi() {
  await worker.start({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.includes('/api/')) print.warning();
    },
    quiet: true,
  });
}
