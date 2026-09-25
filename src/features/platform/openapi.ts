import { arrayOf, defineSpec, paginated, ref, resource, type EndpointDef, type ParamDef } from '@/openapi/dsl';

const idParam = (description: string): Record<string, ParamDef> => ({ id: { type: 'string', description } });
const keyParam = (description: string): Record<string, ParamDef> => ({ key: { type: 'string', description } });
const pageParams: Record<string, ParamDef> = {
  page: { type: 'integer', description: 'Page number (1-based).' },
  per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
};

/** POST /platform/sender-domains/{id}/{action} — returns the updated sender domain. */
const senderAction = (path: string, summary: string, audit: EndpointDef['audit'], extra: Partial<EndpointDef> = {}): EndpointDef => ({
  method: 'POST',
  path: `/platform/sender-domains/{id}/${path}`,
  summary,
  auth: 'platform.manage',
  path_params: idParam('Sender domain id, e.g. `sd_amplify`.'),
  response: resource(ref('SenderDomain')),
  errors: [404],
  audit,
  example: { params: { id: 'sd_amplify' } },
  ...extra,
});

/** POST /platform/certificates/{id}/{action} — returns the updated certificate. */
const certificateAction = (path: string, summary: string, audit: EndpointDef['audit'], extra: Partial<EndpointDef> = {}): EndpointDef => ({
  method: 'POST',
  path: `/platform/certificates/{id}/${path}`,
  summary,
  auth: 'platform.manage',
  path_params: idParam('Public certificate id, e.g. `AC-2026-0341`.'),
  response: resource(ref('Certificate')),
  errors: [404, 422],
  audit,
  example: { params: { id: 'AC-2026-0341' } },
  ...extra,
});

export const spec = defineSpec({
  tag: 'Platform',
  description:
    'Feature flags, system status & incidents, email deliverability, certificate registry, standards imports, API keys and webhooks.',
  endpoints: [
    // ---------- Feature flags ----------
    {
      method: 'GET',
      path: '/platform/flags',
      summary: 'Feature flags',
      auth: 'platform.view',
      response: resource(arrayOf(ref('FeatureFlag'))),
    },
    {
      method: 'PATCH',
      path: '/platform/flags/{key}',
      summary: 'Toggle a flag or change its rollout',
      auth: 'flags.manage',
      path_params: keyParam('Flag key, e.g. `ai_outline`.'),
      body: ref('FlagUpdate'),
      response: resource(ref('FeatureFlag')),
      errors: [404],
      audit: { text: 'Set "{flag}" rollout to {rollout} · Enabled/Disabled "{flag}" for {rollout}', category: 'Flags' },
      example: { params: { key: 'ai_outline' }, body: { enabled: false, rollout: 'Beta list' } },
    },

    // ---------- System status & incidents ----------
    {
      method: 'GET',
      path: '/platform/system',
      summary: 'Service status and the open incident',
      auth: 'platform.view',
      response: resource(ref('SystemStatus')),
    },
    {
      method: 'POST',
      path: '/platform/incident',
      summary: 'Post an incident',
      description: 'Marks the affected services Degraded. Only one incident can be open at a time (422 otherwise).',
      auth: 'flags.manage',
      body: ref('PostIncidentInput'),
      response: resource(ref('SystemStatus'), 201),
      audit: { text: 'Posted incident: {title}', category: 'Flags' },
      example: { body: { title: 'Elevated video processing latency', service_ids: ['video'] } },
    },
    {
      method: 'DELETE',
      path: '/platform/incident',
      summary: 'Resolve the open incident',
      auth: 'flags.manage',
      response: resource(ref('SystemStatus')),
      errors: [422],
      audit: { text: 'Resolved incident: {title}', category: 'Flags' },
      example: { skip: 'The seeded database has no open incident, so resolving returns 422 standalone.' },
    },

    // ---------- Email deliverability ----------
    {
      method: 'GET',
      path: '/platform/deliverability',
      summary: 'Sending volume, bounce/complaint rates, sender domains and suppression lists',
      auth: 'platform.view',
      response: resource(ref('Deliverability')),
    },
    senderAction(
      'pause',
      'Pause email sending for a tenant',
      { text: 'Paused email sending for {tenant}', category: 'Tenants' },
      { errors: [404, 422] },
    ),
    senderAction(
      'resume',
      'Resume email sending for a tenant',
      { text: 'Resumed email sending for {tenant}', category: 'Tenants' },
      { errors: [404, 422], example: { skip: 'Seeded sender domains are not paused, so resuming returns 422 standalone.' } },
    ),
    senderAction('dns-check', 'Re-check SPF/DKIM/DMARC records', { text: 'Re-checked DNS for {domain}', category: 'Tenants' }),

    // ---------- Certificate authority ----------
    {
      method: 'GET',
      path: '/platform/certificates/summary',
      summary: 'Registry totals',
      auth: 'platform.view',
      response: resource(ref('CertificateSummary')),
    },
    {
      method: 'GET',
      path: '/platform/certificates',
      summary: 'Certificates, newest first',
      description: '`search` matches certificate id, learner, course and tenant name.',
      auth: 'platform.view',
      query: { ...pageParams, search: { type: 'string', description: 'Case-insensitive contains search.' } },
      response: paginated(ref('Certificate')),
      example: { query: { per_page: 5 } },
    },
    certificateAction('revoke', 'Revoke a certificate', { text: 'Revoked certificate {id} ({learner})', category: 'Security' }),
    certificateAction(
      'reinstate',
      'Reinstate a revoked certificate',
      { text: 'Reinstated certificate {id} ({learner})', category: 'Security' },
      { example: { skip: 'Seeded certificates are all valid, so reinstating returns 422 standalone.' } },
    ),
    {
      method: 'GET',
      path: '/platform/certificate-policies',
      summary: 'Registry policies',
      auth: 'platform.view',
      response: resource(arrayOf(ref('RegistryPolicy'))),
    },
    {
      method: 'PUT',
      path: '/platform/certificate-policies/{key}',
      summary: 'Enable or disable a registry policy',
      auth: 'platform.manage',
      path_params: keyParam('Policy key, e.g. `ob3`.'),
      body: { type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } },
      response: resource(ref('RegistryPolicy')),
      errors: [404],
      audit: { text: 'Enabled/Disabled registry policy "{policy}"', category: 'Security' },
      example: { params: { key: 'ob3' }, body: { enabled: true } },
    },

    // ---------- Standards & conformance ----------
    {
      method: 'GET',
      path: '/platform/standards',
      summary: 'Standards support, open failed imports and accessibility conformance',
      auth: 'platform.view',
      response: resource(ref('Standards')),
    },
    {
      method: 'POST',
      path: '/platform/imports/{id}/reprocess',
      summary: 'Re-process a failed import',
      description: 'Oversized packages are rejected again; manifest problems are repaired and imported.',
      auth: 'platform.manage',
      path_params: idParam('Failed import id, e.g. `im_chef`.'),
      response: resource(ref('ReprocessResult')),
      errors: [404, 422],
      audit: { text: 'Re-processed {file} for {tenant} — {outcome}', category: 'Tenants' },
      example: { params: { id: 'im_chef' } },
    },

    // ---------- API keys ----------
    {
      method: 'GET',
      path: '/platform/api-keys',
      summary: 'API keys, newest first',
      auth: 'platform.view',
      query: pageParams,
      response: paginated(ref('ApiKey')),
      example: { query: { per_page: 100 } },
    },
    {
      method: 'POST',
      path: '/platform/api-keys',
      summary: 'Create an API key',
      description: 'The response is the only time the full `secret` is returned.',
      auth: 'platform.manage',
      body: ref('ApiKeyInput'),
      response: resource(ref('CreatedApiKey'), 201),
      audit: { text: 'Created API key "{name}" ({prefix}, {scope})', category: 'Security' },
      example: { body: { name: 'Data warehouse sync', scope: 'Read only' } },
    },
    {
      method: 'POST',
      path: '/platform/api-keys/{id}/revoke',
      summary: 'Revoke an API key',
      auth: 'platform.manage',
      path_params: idParam('API key id, e.g. `ak_prod`.'),
      response: resource(ref('ApiKey')),
      errors: [404, 422],
      audit: { text: 'Revoked API key "{name}" ({prefix})', category: 'Security' },
      example: { params: { id: 'ak_zapier' } },
    },

    // ---------- Webhooks ----------
    {
      method: 'GET',
      path: '/platform/webhooks',
      summary: 'Webhook endpoints and failed deliveries',
      auth: 'platform.view',
      response: resource(ref('Webhooks')),
    },
    {
      method: 'POST',
      path: '/platform/webhook-deliveries/{id}/retry',
      summary: 'Retry a failed webhook delivery',
      description: 'On success the delivery is removed (`delivery: null`); a gone endpoint fails again and the delivery is returned.',
      auth: 'platform.manage',
      path_params: idParam('Failed delivery id, e.g. `dl_1`.'),
      response: resource(ref('RetryResult')),
      errors: [404],
      audit: { text: 'Retried webhook {event} to {url} — delivered (HTTP 200) / failed again (HTTP 404)', category: 'Tenants' },
      example: { params: { id: 'dl_1' } },
    },
  ],
});
