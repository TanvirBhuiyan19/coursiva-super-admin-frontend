// Cross-feature contract tests: one value, one owner. When a screen changes a shared rule,
// every other endpoint that reports it must agree.
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import type { TenantDetail } from '@/features/tenants/types';
import type { User } from '@/features/auth/types';
import { signInAs } from './utils';

const tenant = (id: string) => api.get<Resource<TenantDetail>>(`/tenants/${id}`).then((r) => r.data);
const limit = (t: TenantDetail, key: string) => t.limits.find((l) => l.key === key)!;

describe('shared business rules', () => {
  it('per-plan API rate limits (Abuse & limits) drive every tenant’s default limit', async () => {
    signInAs('Owner');
    expect(limit(await tenant('tn_kodo'), 'apiPerMinute')).toMatchObject({ value: 60, planDefault: 60 });
    const { data: current } = await api.get<Resource<{ plan: string; perMinute: number }[]>>('/governance/rate-limits');
    await api.put('/governance/rate-limits', {
      limits: current.map((r) => ({ plan: r.plan, perMinute: r.plan === 'Launch' ? 90 : r.perMinute })),
    });
    expect(limit(await tenant('tn_kodo'), 'apiPerMinute')).toMatchObject({ value: 90, planDefault: 90, overridden: false });
  });

  it('live-room allowances (Video & storage) drive tenant live-room limits', async () => {
    signInAs('Owner');
    await api.patch('/media/live-rooms', { allowances: [{ plan: 'Growth', minutes: 3500 }] });
    expect(limit(await tenant('tn_amplify'), 'liveRoomMinutes')).toMatchObject({ value: 3500, planDefault: 3500 });
  });

  it('extension price edits (Extensions) show in the tenant drawer', async () => {
    signInAs('Owner');
    await api.patch('/extensions/drm', { price: 45 });
    const drm = (await tenant('tn_amplify')).extensions.find((x) => x.key === 'drm');
    expect(drm).toMatchObject({ price: 45, state: 'paying' });
  });

  it('the tenant drawer and Growth analytics report the same health score', async () => {
    signInAs('Owner');
    const detail = await tenant('tn_bloom');
    const { data: growth } = await api.get<Resource<{ healthScores: { tenantId: string; score: number }[] }>>('/analytics/growth');
    expect(growth.healthScores.find((h) => h.tenantId === 'tn_bloom')?.score).toBe(detail.healthScore.score);
  });

  it('just-in-time elevation grants Owner permissions until it expires', async () => {
    signInAs('Owner');
    await api.post('/staff/st_lee/elevate', { minutes: 30 });
    signInAs('Support'); // Lee Chen
    const me = await api.get<Resource<User>>('/auth/me').then((r) => r.data);
    expect(me.permissions).toContain('tenants.purge');
    signInAs('Owner');
    await api.delete('/staff/st_lee/elevation');
    signInAs('Support');
    const after = await api.get<Resource<User>>('/auth/me').then((r) => r.data);
    expect(after.permissions).not.toContain('tenants.purge');
  });

  it('banners from Flags & status land in the single Announcements history', async () => {
    signInAs('Owner');
    await api.post('/announcements', { message: 'Maintenance tonight', audience: 'All tenants', channel: 'Banner' });
    const { data } = await api.get<{ data: { message: string; channel: string }[] }>('/announcements');
    expect(data[0]).toMatchObject({ message: 'Maintenance tonight', channel: 'Banner' });
  });
});
