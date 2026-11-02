import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { session } from '@/mocks/collections';
import { renderApp } from '@/test/utils';

const reportError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/reportError', () => ({ reportError, initErrorReporting: vi.fn(), setReportingUser: vi.fn() }));
// The sign-in page crashes while rendering.
vi.mock('@/features/auth/LoginPage', () => ({
  default: () => {
    throw new Error('login render failed');
  },
}));

describe('route error page', () => {
  it('shows the console’s error card (not the router’s developer page) when a sign-in route throws, and reports it', async () => {
    session.patch({ userId: null, pendingTwoFactorUserId: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign-in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'login render failed' }), { source: 'route' });
  });
});
