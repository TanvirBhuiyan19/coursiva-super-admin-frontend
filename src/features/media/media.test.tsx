import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { Resource } from '@/lib/api/types';
import { audit, liveRoomAllowance, staff } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import type { TenantDetail } from '@/features/tenants/types';
import { mediaStore } from './mock';
import type { DrmSettings } from './types';

const hasAudit = (action: string, category: string) => audit.all().some((a) => a.action === action && a.category === category);
const sectionLink = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Video and storage sections' })).getByRole('link', { name });

describe('video & storage', () => {
  it('renders live rooms, DRM and storage without exposing stored secrets', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/media');
    expect(await screen.findByRole('heading', { name: 'Live classes · video providers' })).toBeInTheDocument();
    expect(sectionLink('Live classes')).toHaveAttribute('aria-current', 'page');

    await user.click(sectionLink('Video DRM'));
    expect(router.state.location.search).toBe('?section=drm');
    const mux = await screen.findByRole('region', { name: 'Mux' });
    expect(within(mux).getByText('Connected')).toBeInTheDocument();
    expect(within(mux).getByLabelText('Mux Token secret')).toHaveAttribute('placeholder', 'Token secret · •••• c4d3');
    await user.click(sectionLink('Storage & delivery'));
    expect(await screen.findByRole('region', { name: 'Cloudflare R2' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Mux' })).not.toBeInTheDocument(); // hidden, not shown
    await router.navigate(-1); // back/forward move between sections
    expect(await screen.findByRole('region', { name: 'Mux' })).toBeInTheDocument();
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
    expect(amplify.limits.find((l) => l.key === 'live_room_minutes')).toMatchObject({ value: 2500, planDefault: 2500 });
  });

  it('lists Mux as the only DRM provider and shows the honest posture', async () => {
    signInAs('Owner');
    renderApp('/platform/media?section=drm');
    expect(await screen.findByRole('region', { name: 'Mux' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'EZDRM' })).not.toBeInTheDocument();
    // The seeded Mux connection has no DRM configuration: streams are signed, not encrypted.
    expect(screen.getByText('Partly protected')).toBeInTheDocument();
    expect(screen.getByText(/Add a DRM configuration ID/)).toBeInTheDocument();
    expect(screen.queryByText('Security level')).not.toBeInTheDocument();
    const { data } = await api.get<Resource<DrmSettings>>('/media/drm');
    expect(data.protections.map((p) => p.key)).toEqual(['signed_links', 'watermark', 'geo_restrictions']);
    await expect(api.patch('/media/drm', { watermarkStyle: 'forensic' })).resolves.toMatchObject({ data: { watermarkStyle: 'email' } });
  });

  // W6 e2e: on the real stack (Mux not connected) "Rotate key" was a silent disabled button.
  it('explains why the signing key can’t be rotated without Mux', async () => {
    mediaStore.patch({ credentials: mediaStore.get().credentials.filter((c) => c.connection !== 'mux') });
    signInAs('Owner');
    renderApp('/platform/media?section=drm');
    expect(await screen.findByText('Connect Mux with a signing key to rotate it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate key' })).toBeDisabled();
  });

  it('connects the Public assets bucket with its provider and ACL switches', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media?section=storage');
    const card = await screen.findByRole('region', { name: 'Public assets' });
    expect(within(card).getByText('Public images')).toBeInTheDocument();
    expect(within(card).getByText('Not connected')).toBeInTheDocument();
    const provider = within(card).getByRole('radiogroup', { name: 'Public assets Provider' });
    expect(within(provider).getByRole('radio', { name: 'Cloudflare R2' })).toHaveAttribute('aria-checked', 'true');
    const acl = within(card).getByRole('radiogroup', { name: 'Public assets Object ACL' });
    expect(within(acl).getByRole('radio', { name: 'None (bucket policy)' })).toHaveAttribute('aria-checked', 'true');

    // AWS S3 needs its region; the public base URL must be https.
    await user.click(within(provider).getByRole('radio', { name: 'AWS S3' }));
    await user.type(within(card).getByLabelText('Public assets Access key ID'), 'AKIAPUBLIC0001');
    await user.type(within(card).getByLabelText('Public assets Secret access key'), 'public-secret-0001');
    await user.type(within(card).getByLabelText('Public assets Bucket'), 'coursiva-public');
    await user.type(within(card).getByLabelText('Public assets Public base URL'), 'http://assets.example.com');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('The public base URL is the https:// address that serves the bucket, e.g. https://assets.example.com.'),
    ).toBeInTheDocument();
    await user.clear(within(card).getByLabelText('Public assets Public base URL'));
    await user.type(within(card).getByLabelText('Public assets Public base URL'), 'https://assets.example.com');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('Enter the Region (S3).')).toBeInTheDocument();

    await user.type(within(card).getByLabelText('Public assets Region (S3)'), 'eu-west-1');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() =>
      expect(mediaStore.get().credentials.find((c) => c.connection === 'public_assets')?.values).toMatchObject({
        provider: 's3',
        region: 'eu-west-1',
        public_url: 'https://assets.example.com',
      }),
    );
    expect(hasAudit('Connected storage backend Public assets', 'Security')).toBe(true);
    expect(await within(card).findByText('Connected')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('public-secret-0001');
  });

  it('shows the Mux transcoding fields and rejects a malformed signing private key', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media?section=drm');
    const mux = await screen.findByRole('region', { name: 'Mux' });
    const key = within(mux).getByLabelText('Mux Signing private key (base64, as Mux shows it)');
    expect(key).toHaveAttribute('placeholder', 'Signing private key (base64, as Mux shows it) · •••• LQo=');
    expect(within(mux).getByLabelText('Mux Webhook signing secret')).toHaveAttribute('placeholder', 'Webhook signing secret');
    expect(within(mux).getByLabelText('Mux DRM configuration ID')).toHaveAttribute('placeholder', 'DRM configuration ID');

    const before = mediaStore.get().credentials.find((c) => c.connection === 'mux')?.values;
    await user.type(key, 'not-a-private-key');
    await user.type(within(mux).getByLabelText('Mux DRM configuration ID'), 'drm-cfg');
    await user.click(within(mux).getByRole('button', { name: 'Save & re-verify' }));
    expect(await within(mux).findByText('Paste the base64 private key Mux showed when the signing key was created.')).toBeInTheDocument();
    expect(
      within(mux).getByText('The DRM configuration ID is letters and digits only (Mux → Settings → Digital Rights Management).'),
    ).toBeInTheDocument();
    expect(mediaStore.get().credentials.find((c) => c.connection === 'mux')?.values).toEqual(before);

    // The signing key may be up to 8,192 characters on one line; every other field keeps the 500 default.
    const tooLong = await api
      .put('/media/drm/providers/mux', {
        credentials: [
          { field: 'signing_private_key', value: 'A'.repeat(8193) },
          { field: 'webhook_secret', value: 'w'.repeat(501) },
        ],
      })
      .catch((e: unknown) => e);
    expect(tooLong).toBeInstanceOf(ApiError);
    const err = tooLong as ApiError;
    expect(err.status).toBe(422);
    expect(err.field('credentials.signingPrivateKey')).toBe(
      'The Signing private key (base64, as Mux shows it) must be a single line of at most 8192 characters.',
    );
    expect(err.field('credentials.webhookSecret')).toBe('The Webhook signing secret must be a single line of at most 500 characters.');

    // The optional fields may stay blank; a real-sized key (Mux's base64 of a PEM, ~2,200 characters) is accepted.
    const pem = `-----BEGIN RSA PRIVATE KEY-----\n${'MIIEowIBAAKCAQEA'.repeat(100)}\n-----END RSA PRIVATE KEY-----\n`;
    expect(btoa(pem).length).toBeGreaterThan(2000);
    await user.clear(key);
    await user.click(key);
    await user.paste(btoa(pem));
    await user.clear(within(mux).getByLabelText('Mux DRM configuration ID'));
    await user.click(within(mux).getByRole('button', { name: 'Save & re-verify' }));
    await waitFor(() =>
      expect(mediaStore.get().credentials.find((c) => c.connection === 'mux')?.values.signing_private_key).toBe(btoa(pem)),
    );
    expect(mediaStore.get().credentials.find((c) => c.connection === 'mux')?.values.webhook_secret).toBeUndefined();
    expect(hasAudit('Updated credentials for DRM provider Mux', 'Security')).toBe(true);
  });

  it('rotates the signing key only after confirming, then shows when the old key retires', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media?section=drm');
    const before = mediaStore.get().keysRotatedAt;
    await user.click(await screen.findByRole('button', { name: 'Rotate key' }));
    expect(mediaStore.get().keysRotatedAt).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Confirm rotation' }));
    await waitFor(() => expect(mediaStore.get().keysRotatedAt).not.toBe(before));
    expect(audit.all().some((a) => a.action.startsWith('Rotated the Mux signing key') && a.category === 'Security')).toBe(true);
    expect(await screen.findByText(/Links signed with the old key stop working when it retires at/)).toBeInTheDocument();
    // While the old key retires, rotating again needs `immediate` (Owners only).
    await expect(api.post('/media/drm/rotate-keys')).rejects.toMatchObject({ status: 409 });
    await user.click(screen.getByRole('button', { name: 'Revoke old key now' }));
    await user.click(screen.getByRole('button', { name: 'Break playing videos?' }));
    await waitFor(() => expect(mediaStore.get().previousKeyRetiresAt).toBeNull());
  });

  it('warns while an old signing key Mux refused to delete is still live', async () => {
    signInAs('Owner');
    mediaStore.patch({ previousKeyOverdue: true });
    renderApp('/platform/media?section=drm');
    expect(await screen.findByText(/Mux hasn’t deleted the old signing key yet/)).toBeInTheDocument();
    mediaStore.patch({ previousKeyOverdue: false });
  });

  it('keeps immediate revocation to Owners', async () => {
    signInAs('Admin');
    await expect(api.post('/media/drm/rotate-keys', { immediate: true })).rejects.toMatchObject({ status: 403 });
  });

  it('toggles a DRM protection but never the locked signed links', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/media?section=drm');
    await user.click(await screen.findByRole('switch', { name: 'Dynamic viewer watermark' }));
    await waitFor(() => expect(mediaStore.get().drmOff).toEqual(['watermark']));
    expect(hasAudit('Dynamic viewer watermark disabled platform-wide', 'Security')).toBe(true);
    expect(screen.queryByRole('switch', { name: 'Signed, expiring stream links' })).not.toBeInTheDocument();
    await expect(api.patch('/media/drm', { protections: [{ key: 'signed_links', enabled: false }] })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('is read-only without platform.manage', async () => {
    // The seeded read-only staffer hasn't accepted their invite yet; activate them for this test.
    staff.where((x) => x.role === 'Read-only').forEach((x) => staff.update(x.id, { status: 'Active' }));
    signInAs('Read-only');
    const { user } = renderApp('/platform/media?section=drm');
    const mux = await screen.findByRole('region', { name: 'Mux' });
    expect(within(mux).queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotate key' })).not.toBeInTheDocument();
    await user.click(sectionLink('Live classes'));
    expect(await screen.findByRole('switch', { name: 'Fall back to built-in rooms on provider failure' })).toBeDisabled();
    expect(screen.queryByRole('textbox', { name: 'Growth built-in room minutes per month' })).not.toBeInTheDocument();
    await expect(api.patch('/media/live-rooms', { allowances: [{ plan: 'Growth', minutes: 1 }] })).rejects.toMatchObject({ status: 403 });
    await expect(api.post('/media/drm/rotate-keys')).rejects.toMatchObject({ status: 403 });
    expect(liveRoomAllowance.get().Growth).toBe(2000);
  });
});
