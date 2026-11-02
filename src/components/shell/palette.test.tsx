import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/store/ui';
import { renderApp, signInAs } from '@/test/utils';

const searchCalls = (spy: { mock: { calls: Parameters<typeof fetch>[] } }) =>
  spy.mock.calls.filter(([input]) => (input instanceof Request ? input.url : String(input)).includes('/search')).length;

describe('command palette search', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useUi.getState().set({ cmdOpen: false });
  });

  it('waits for 2 characters (Laravel 422s shorter queries) and finds tickets', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    signInAs('Owner');
    const { user } = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Platform overview' });
    act(() => useUi.getState().set({ cmdOpen: true }));
    const input = await screen.findByRole('combobox', { name: 'Search the console' });

    await user.type(input, 'w');
    await new Promise((r) => setTimeout(r, 300));
    expect(searchCalls(fetchSpy)).toBe(0);

    await user.type(input, 'ebhook');
    const list = await screen.findByRole('listbox');
    expect(await within(list).findByText('Webhook deliveries delayed ~10 min')).toBeInTheDocument();
    await waitFor(() => expect(searchCalls(fetchSpy)).toBeGreaterThan(0));
  });
});
