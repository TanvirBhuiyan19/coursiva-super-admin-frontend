import { defineSpec, ref, resource, type ParamDef } from '@/openapi/dsl';

const providerKey: Record<string, ParamDef> = {
  key: { type: 'string', enum: ['mux', 'ezdrm', 'keyos'], description: 'DRM provider connection.' },
};
const backendKey: Record<string, ParamDef> = {
  key: { type: 'string', enum: ['r2', 's3'], description: 'Storage backend connection.' },
};
const credentialsDescription =
  'Send new values for any fields; omitted or blank fields keep their stored value. Every field must end up set (422 `credentials.{field}`). Credentials are stored server-side and never returned — responses carry `configured` + `last4`.';

export const spec = defineSpec({
  tag: 'Media',
  description: 'Platform media settings: live-room policies and allowances, video DRM and providers, storage & delivery backends.',
  endpoints: [
    // ----- Live rooms -----
    {
      method: 'GET',
      path: '/media/live-rooms',
      summary: 'Live-room policies, plan allowances and usage',
      auth: 'platform.view',
      response: resource(ref('LiveRoomSettings')),
    },
    {
      method: 'PATCH',
      path: '/media/live-rooms',
      summary: 'Toggle live-room policies / set plan allowances',
      description:
        'Allowances feed the tenant `live_room_minutes` limit (0 = BYO provider only). Allowance changes are audited under Billing.',
      auth: 'platform.manage',
      body: ref('LiveRoomUpdate'),
      response: resource(ref('LiveRoomSettings')),
      audit: {
        text: 'Turned on/off live-room policy "{policy}" · Set {plan} built-in room allowance to {n} min/mo / Turned off built-in rooms for {plan} (BYO provider only) (Billing)',
        category: 'Flags',
      },
      example: { body: { policies: [{ key: 'pull_recordings', enabled: false }], allowances: [{ plan: 'Growth', minutes: 5000 }] } },
    },

    // ----- DRM -----
    {
      method: 'GET',
      path: '/media/drm',
      summary: 'Video DRM settings and providers',
      auth: 'platform.view',
      response: resource(ref('DrmSettings')),
    },
    {
      method: 'PATCH',
      path: '/media/drm',
      summary: 'Update DRM protections and playback policy',
      description: 'Locked protections (stream encryption) cannot be turned off (422).',
      auth: 'platform.manage',
      body: ref('DrmUpdate'),
      response: resource(ref('DrmSettings')),
      audit: {
        text: '{protection} enabled/disabled platform-wide · DRM security level set to {level} · Watermark style set to {style} · Concurrent device leases set to {n} · DRM made available on {plans}',
        category: 'Security',
      },
      example: { body: { protections: [{ key: 'geo_restrictions', enabled: false }], watermark_style: 'email_ip', device_leases: 4 } },
    },
    {
      method: 'POST',
      path: '/media/drm/rotate-keys',
      summary: 'Rotate DRM license signing keys',
      auth: 'platform.manage',
      response: resource(ref('DrmSettings')),
      audit: { text: 'Rotated DRM license signing keys', category: 'Security' },
      example: {},
    },
    {
      method: 'PUT',
      path: '/media/drm/providers/{key}',
      summary: 'Connect a DRM provider or update its credentials',
      description: credentialsDescription,
      auth: 'platform.manage',
      path_params: providerKey,
      body: ref('CredentialsInput'),
      response: resource(ref('Connection')),
      errors: [404, 422],
      audit: { text: 'Connected DRM provider {name} / Updated credentials for DRM provider {name}', category: 'Security' },
      example: {
        params: { key: 'keyos' },
        body: {
          credentials: [
            { field: 'api_key', value: 'keyos-api-7d21c0' },
            { field: 'server_key', value: 'keyos-srv-9e4b' },
          ],
        },
      },
    },
    {
      method: 'DELETE',
      path: '/media/drm/providers/{key}',
      summary: 'Disconnect a DRM provider (deletes stored credentials)',
      auth: 'platform.manage',
      path_params: providerKey,
      response: resource(ref('Connection')),
      errors: [404],
      audit: { text: 'Disconnected DRM provider {name}', category: 'Security' },
      example: { params: { key: 'mux' } },
    },

    // ----- Storage -----
    {
      method: 'GET',
      path: '/media/storage',
      summary: 'Storage & delivery backends, pipeline and footprint',
      auth: 'platform.view',
      response: resource(ref('StorageSettings')),
    },
    {
      method: 'PATCH',
      path: '/media/storage',
      summary: 'Update archive lifecycle, rendition ladder and direct uploads',
      auth: 'platform.manage',
      body: ref('StorageUpdate'),
      response: resource(ref('StorageSettings')),
      audit: {
        text: 'Masters now archive to Glacier Deep Archive after {n} days · Rendition ladder set to {ladder} · Enabled/Disabled direct-to-bucket uploads',
        category: 'Security',
      },
      example: { body: { archive_after_days: 120, rendition_ladder: 'uhd' } },
    },
    {
      method: 'PUT',
      path: '/media/storage/backends/{key}',
      summary: 'Connect a storage backend or update its credentials',
      description: credentialsDescription,
      auth: 'platform.manage',
      path_params: backendKey,
      body: ref('CredentialsInput'),
      response: resource(ref('Connection')),
      errors: [404, 422],
      audit: { text: 'Connected storage backend {name} / Updated credentials for storage backend {name}', category: 'Security' },
      example: { params: { key: 's3' }, body: { credentials: [{ field: 'region', value: 'eu-central-1' }] } },
    },
    {
      method: 'DELETE',
      path: '/media/storage/backends/{key}',
      summary: 'Disconnect a storage backend (deletes stored credentials)',
      auth: 'platform.manage',
      path_params: backendKey,
      response: resource(ref('Connection')),
      errors: [404],
      audit: { text: 'Disconnected storage backend {name}', category: 'Security' },
      example: { params: { key: 'r2' } },
    },
  ],
});
