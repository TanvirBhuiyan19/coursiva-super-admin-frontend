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
// jsdom lacks DragEvent and ClipboardEvent, which the rich text editor (Lexical) checks for when handling paste, and
// has no layout for text ranges (Lexical scrolls the caret into view after edits).
const g = globalThis as Partial<typeof globalThis>;
g.DragEvent ??= class DragEvent extends MouseEvent {} as unknown as typeof DragEvent;
g.ClipboardEvent ??= class ClipboardEvent extends Event {
  clipboardData: DataTransfer | null;
  constructor(type: string, init?: ClipboardEventInit) {
    super(type, init);
    this.clipboardData = init?.clipboardData ?? null;
  }
} as unknown as typeof ClipboardEvent;
const range = Range.prototype as Partial<Range>;
range.getBoundingClientRect ??= () => new DOMRect();
range.getClientRects ??= () => [] as unknown as DOMRectList;
window.scrollTo = () => undefined;
HTMLElement.prototype.scrollTo = () => undefined;

// jsdom's FormData/File aren't the ones Node's fetch understands, so multipart uploads would fail as a network error.
// Rebuild them as Node's own classes (taken from Node's Response) before the request reaches MSW.
const NodeFormData = (await new Response(new URLSearchParams('a=1')).formData()).constructor as typeof FormData;
const NodeBlob = (await new Response('x').blob()).constructor as typeof Blob;
async function toNodeFormData(form: FormData) {
  const out = new NodeFormData();
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out.append(key, value);
    else out.append(key, new NodeBlob([await value.arrayBuffer()], { type: value.type }), value.name);
  }
  return out;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  const mswFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    init?.body instanceof FormData && !(init.body instanceof NodeFormData)
      ? mswFetch(input, { ...init, body: await toNodeFormData(init.body) })
      : mswFetch(input, init);
});
beforeEach(() => resetDb());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());
