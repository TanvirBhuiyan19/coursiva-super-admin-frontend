import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mediaStore } from '@/features/media/mock';
import { api } from '@/lib/api/client';
import { audit, session, staff } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { availabilityStore, unavailableCapabilities } from './mock';

const hasAudit = (action: string) => audit.all().some((a) => a.action === action && a.category === 'Flags');
const isOff = (key: string) => availabilityStore.get().off.includes(key);
const group = (name: string) => screen.getByRole('region', { name });
const row = (name: string) => screen.getByRole('heading', { name, level: 3 }).closest('li') as HTMLElement;

describe('feature availability', () => {
  it('lists capabilities by group with their status, reach and "x of y on"', async () => {
    signInAs('Owner');
    renderApp('/platform/availability');
    const video = await screen.findByRole('region', { name: 'Video & live' });
    expect(within(video).getByText('7 of 7 on')).toBeInTheDocument();
    // Daily isn't connected in the seed: switched on, but not available.
    const rooms = row('Built-in live rooms');
    expect(within(rooms).getByText('Not connected')).toBeInTheDocument();
    // The link opens the connection's tab once the connections list is in.
    await waitFor(() =>
      expect(within(rooms).getByRole('link', { name: 'Connect Daily' })).toHaveAttribute('href', '/platform/connections?section=video'),
    );
    expect(within(row('Zoom')).getByText('Available')).toBeInTheDocument();
    expect(within(row('SCORM & xAPI')).getByText('2 paying schools')).toBeInTheDocument();
    expect(within(row('Slack')).getByText('Usage not counted')).toBeInTheDocument();
    // DRM needs any one of its providers: Mux is connected.
    expect(within(row('Video DRM')).getByText('Available')).toBeInTheDocument();
    expect(within(row('AI (Claude)')).getByRole('link', { name: 'Connect Anthropic' })).toHaveAttribute(
      'href',
      '/platform/connections?section=ai',
    );
    expect(group('Integrations')).toBeInTheDocument();
  });

  it('filters by search and status, with an empty state that clears both', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/availability');
    await screen.findByRole('region', { name: 'Video & live' });
    await user.type(screen.getByRole('searchbox', { name: 'Find a capability' }), 'anthropic');
    expect(screen.getByRole('heading', { name: 'AI (Claude)', level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Video & live' })).not.toBeInTheDocument();
    expect(router.state.location.search).toContain('q=anthropic');

    await user.click(screen.getByRole('button', { name: /^Off · / }));
    expect(await screen.findByText('No capability matches “anthropic”.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show everything' }));
    expect(await screen.findByRole('region', { name: 'Video & live' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Find a capability' })).toHaveValue('');
  });

  it('turns a capability off after showing what disappears, then on again without a dialog', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/availability?q=scorm');
    await user.click(await screen.findByRole('switch', { name: 'SCORM & xAPI available to schools' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off SCORM & xAPI for every school?' });
    expect(within(dialog).getByText('SCORM import')).toBeInTheDocument();
    expect(within(dialog).getByText(/2 schools pay for SCORM & xAPI; their billing is unchanged/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Billing if needed.' })).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Turn off for all schools' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'SCORM & xAPI');
    await user.click(confirm);

    await waitFor(() => expect(isOff('scorm')).toBe(true));
    expect(
      await screen.findByText('SCORM & xAPI turned off for every school — hidden from dashboards, sites and the API'),
    ).toBeInTheDocument();
    expect(hasAudit('Turned off SCORM & xAPI for all schools')).toBe(true);
    expect(unavailableCapabilities()).toContain('scorm');
    expect(within(row('SCORM & xAPI')).getByText('Off')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'SCORM & xAPI available to schools' }));
    await waitFor(() => expect(isOff('scorm')).toBe(false));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasAudit('Turned on SCORM & xAPI for all schools')).toBe(true);
  });

  it('asks for the password when switching off and it was not entered recently', async () => {
    signInAs('Owner');
    session.patch({ passwordConfirmedAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    const { user } = renderApp('/platform/availability?q=zoom');
    await user.click(await screen.findByRole('switch', { name: 'Zoom available to schools' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off Zoom for every school?' });
    await user.type(within(dialog).getByRole('textbox'), 'zoom');
    await user.click(within(dialog).getByRole('button', { name: 'Turn off for all schools' }));

    const prompt = await screen.findByRole('dialog', { name: 'Confirm your password' });
    // The step-up prompt is shared by every sensitive action (also exports such as the 1099 worksheet), so it must not
    // claim the action changes credentials (W5 real-browser check).
    expect(within(prompt).queryByText(/credentials/)).not.toBeInTheDocument();
    expect(within(prompt).getByText(/sensitive action/)).toBeInTheDocument();
    expect(isOff('live_zoom')).toBe(false);
    await user.type(within(prompt).getByLabelText('Password'), 'password');
    await user.click(within(prompt).getByRole('button', { name: 'Confirm and continue' }));
    await waitFor(() => expect(isOff('live_zoom')).toBe(true));
    // Switching on never asks.
    session.patch({ passwordConfirmedAt: null });
    await expect(api.put('/platform/availability/live_zoom', { on: true })).resolves.toBeTruthy();
    expect(isOff('live_zoom')).toBe(false);
  });

  it('shows "Available to schools" switches on connection cards (connect Daily, flip built-in rooms)', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=video');
    const daily = await screen.findByRole('region', { name: 'Daily' });
    expect(within(daily).getByText('Available to schools')).toBeInTheDocument();
    await user.click(within(daily).getByRole('switch', { name: 'Built-in live rooms available to schools' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off Built-in live rooms for every school?' });
    expect(await within(dialog).findByText('Built-in room option when scheduling')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'Built-in live rooms');
    await user.click(within(dialog).getByRole('button', { name: 'Turn off for all schools' }));
    await waitFor(() => expect(isOff('live_rooms')).toBe(true));
    await waitFor(() => expect(within(daily).getByRole('switch', { name: 'Built-in live rooms available to schools' })).not.toBeChecked());
  });

  it('validates the body, 404s unknown keys and migrates the old live-room policies', async () => {
    signInAs('Owner');
    await expect(api.put('/platform/availability/live_rooms', { on: 'no' })).rejects.toMatchObject({ status: 422 });
    await expect(api.put('/platform/availability/nope', { on: true })).rejects.toMatchObject({ status: 404 });

    mediaStore.patch({ liveRoomPoliciesOff: ['built_in_rooms', 'byo_providers'] as never });
    expect(availabilityStore.get().off).toEqual(['live_rooms', 'live_zoom', 'live_meet', 'live_teams']);
  });

  it('is read-only without platform.manage', async () => {
    staff.where((x) => x.role === 'Read-only').forEach((x) => staff.update(x.id, { status: 'Active' }));
    signInAs('Read-only');
    renderApp('/platform/availability');
    expect(await screen.findByRole('switch', { name: 'Zoom available to schools' })).toBeDisabled();
    await expect(api.put('/platform/availability/live_zoom', { on: false })).rejects.toMatchObject({ status: 403 });
    expect(isOff('live_zoom')).toBe(false);
  });
});
