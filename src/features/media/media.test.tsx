import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import { audit, liveRoomAllowance, staff } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import type { TenantDetail } from '@/features/tenants/types';
import { mediaStore } from './mock';
import type { DrmSettings } from './types';

const hasAudit = (action: string, category: string) => audit.all().some((a) => a.action === action && a.category === category);

describe('video & storage', () => {
  it('renders live rooms, DRM and storage without exposing stored secrets', async () => {
    signInAs('Owner');
    renderApp('/platform/media');
    expect(await screen.findByRole('heading', { name: 'Live classes · video providers' })).toBeInTheDocument();
    const mux = await screen.findByRole('region', { name: 'Mux' });
    expect(within(mux).getByText('Connected')).toBeInTheDocument();
    expect(within(mux).getByLabelText('Mux Token secret')).toHaveAttribute('placeholder', 'Token secret · •••• c4d3');
    expect(await screen.findByRole('region', { name: 'Cloudflare R2' })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('mux-sec-f02b7e19c4d3');

    const { data } = await api.get<Resource<DrmSettings>>('/media/drm');
    expect(JSON.stringify(data)).not.toContain('f02b7e19');
    expect(data.providers.find((p) => p.key === 'mux')?.fields.find((f) => f.key === 'token_secret')).toMatchObject({
      configured: true,
      last4: 'c4d3',
      value: null,
    });
  });

  it('changing a plan’s live-room minutes changes tenant limits', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media');
    const growth = await screen.findByRole('textbox', { name: 'Growth built-in room minutes per month' });
    await user.clear(growth);
    await user.type(growth, '2500');
    await user.tab();
    await waitFor(() => expect(liveRoomAllowance.get().Growth).toBe(2500));
    expect(hasAudit('Set Growth built-in room allowance to 2,500 min/mo', 'Billing')).toBe(true);
    const { data: amplify } = await api.get<Resource<TenantDetail>>('/tenants/tn_amplify');
    expect(amplify.limits.find((l) => l.key === 'liveRoomMinutes')).toMatchObject({ value: 2500, planDefault: 2500 });
  });

  it('validates credentials server-side, then connects a DRM provider', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media');
    const card = await screen.findByRole('region', { name: 'EZDRM' });
    await user.type(within(card).getByLabelText('EZDRM Username'), 'coursiva');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('Enter the Password.')).toBeInTheDocument();
    expect(within(card).getByText('Enter the FairPlay cert URL.')).toBeInTheDocument();
    expect(mediaStore.get().credentials.some((c) => c.connection === 'ezdrm')).toBe(false);

    await user.type(within(card).getByLabelText('EZDRM Password'), 'hunter2-long');
    await user.type(within(card).getByLabelText('EZDRM FairPlay cert URL'), 'https://drm.example/fp.cer');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(mediaStore.get().credentials.find((c) => c.connection === 'ezdrm')?.values.password).toBe('hunter2-long'));
    expect(hasAudit('Connected DRM provider EZDRM', 'Security')).toBe(true);
    expect(await within(card).findByText('Connected')).toBeInTheDocument();
    expect(within(card).getByLabelText('EZDRM Password')).toHaveValue('');
  });

  it('rotates license keys only after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media');
    const before = mediaStore.get().keysRotatedAt;
    await user.click(await screen.findByRole('button', { name: 'Rotate keys' }));
    expect(mediaStore.get().keysRotatedAt).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Confirm rotation' }));
    await waitFor(() => expect(mediaStore.get().keysRotatedAt).not.toBe(before));
    expect(hasAudit('Rotated DRM license signing keys', 'Security')).toBe(true);
    expect(await screen.findByText(/Last rotated just now/)).toBeInTheDocument();
  });

  it('toggles a DRM protection but never the locked encryption', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media');
    await user.click(await screen.findByRole('switch', { name: 'Dynamic viewer watermark' }));
    await waitFor(() => expect(mediaStore.get().drmOff).toEqual(['watermark']));
    expect(hasAudit('Dynamic viewer watermark disabled platform-wide', 'Security')).toBe(true);
    expect(screen.queryByRole('switch', { name: 'AES-128 stream encryption' })).not.toBeInTheDocument();
    await expect(api.patch('/media/drm', { protections: [{ key: 'encryption', enabled: false }] })).rejects.toMatchObject({ status: 422 });
  });

  it('is read-only without platform.manage', async () => {
    // The seeded read-only staffer hasn't accepted their invite yet; activate them for this test.
    staff.where((x) => x.role === 'Read-only').forEach((x) => staff.update(x.id, { status: 'Active' }));
    signInAs('Read-only');
    renderApp('/platform/media');
    const mux = await screen.findByRole('region', { name: 'Mux' });
    expect(within(mux).queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Growth built-in room minutes per month' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotate keys' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Offer built-in rooms' })).toBeDisabled();
    await expect(api.patch('/media/live-rooms', { allowances: [{ plan: 'Growth', minutes: 1 }] })).rejects.toMatchObject({ status: 403 });
    await expect(api.post('/media/drm/rotate-keys')).rejects.toMatchObject({ status: 403 });
    expect(liveRoomAllowance.get().Growth).toBe(2000);
  });
});
