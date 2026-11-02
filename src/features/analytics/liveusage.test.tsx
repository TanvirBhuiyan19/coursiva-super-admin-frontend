import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { Resource } from '@/lib/api/types';
import { renderApp, signInAs } from '@/test/utils';
import type { LiveUsage } from './types';

const get = (period?: string) => api.get<Resource<LiveUsage>>('/analytics/live', { query: period ? { period } : {} }).then((r) => r.data);

describe('live usage', () => {
  it('reports room minutes, sessions and peaks per school for a month', async () => {
    signInAs('Owner');
    const u = await get();
    expect(u.periods).toHaveLength(12);
    expect(u.period).toBe(u.periods[0]);
    expect(u.trend).toHaveLength(6);
    expect(u.trend[5]!.period).toBe(u.period);
    expect(u.totals.schools).toBe(u.tenants.length);
    expect(u.totals.roomMinutes).toBe(u.tenants.reduce((n, r) => n + r.roomMinutes, 0));
    expect(u.totals.peakConcurrency).toBe(Math.max(0, ...u.tenants.map((r) => r.peakConcurrency)));
    const older = await get(u.periods[3]!.slice(0, 7));
    expect(older.period).toBe(u.periods[3]);
    await expect(get('2001-01')).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.status === 422);
  });

  it('renders the screen and switches month in the URL', async () => {
    signInAs('Owner');
    const u = await get();
    const { user, router } = renderApp('/analytics/live');
    expect(await screen.findByText('Peak concurrency')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Room minutes by month' })).toBeInTheDocument();
    if (u.tenants.length) {
      const table = screen.getByRole('table', { name: /^Schools · / });
      expect(within(table).getAllByRole('row')).toHaveLength(u.tenants.length + 1);
    }
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), u.periods[1]!.slice(0, 7));
    await waitFor(() => expect(router.state.location.search).toBe(`?period=${u.periods[1]!.slice(0, 7)}`));
  });
});
