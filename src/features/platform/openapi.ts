import { arrayOf, defineSpec, noContent, pagedResource, paginated, ref, resource, type EndpointDef, type ParamDef } from '@/openapi/dsl';

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
    // ---------- Connections ----------
    {
      method: 'GET',
      path: '/platform/connections',
      summary: 'Services connected with pasted credentials',
      description:
        'Payment providers (Stripe, Paddle, Lemon Squeezy), Cloudflare, Expo push, platform email, the ad networks’ developer tokens (`kind: ads`: Google Ads, Microsoft Advertising), the Chrome UX Report API key (`kind: insights`), the AI studio keys (`kind: ai`: Anthropic for Claude, AssemblyAI for speech-to-text), ClamAV virus scanning of uploads (`kind: security`), the Prometheus scrape token (`kind: monitoring`), Daily for the schools’ built-in live rooms (`kind: video`) and the OAuth apps schools sign in to (the backend also lists storage and DRM, shown on the Media screen). Secrets are never returned: `configured`, non-secret `value`s and `last4` (values of 12+ characters).',
      auth: 'platform.view',
      response: resource(arrayOf(ref('PlatformConnection'))),
    },
    {
      method: 'PUT',
      path: '/platform/connections/{key}',
      summary: 'Connect & verify, or replace credentials',
      description:
        'Blank or omitted fields keep their stored value; after merging every required field must be set (422 `credentials.{field}`). The server verifies the credentials with the provider before saving (422 `credentials` with its message, e.g. "Stripe rejected these credentials: …"). Needs a password confirmed in the last 15 minutes (423). Payment providers (`kind: payments`: Stripe, Paddle, Lemon Squeezy) also need `billing.manage`. Paddle checks the key and client-side token are one environment and reads the product; Lemon Squeezy checks the store and that each plan/cycle variant is a monthly/yearly subscription of it priced like the price book. Anthropic and AssemblyAI (`kind: ai`) check the key format, then call the provider with it. ClamAV (`kind: security`) checks the host and port, then sends clamd a PING (no PONG → 422 `credentials`: "ClamAV rejected these credentials: no clamd answered PING at {host}:{port}"). The Prometheus scrape token (`kind: monitoring`) is format-checked only (32–256 characters). Daily (`kind: video`) reads the account with the API key (`GET https://api.daily.co/v1/`); an optional pasted domain must be the account’s, and the optional webhook HMAC secret must be base64. Cloudflare’s check proves only "SSL and Certificates: Edit"; the edge also needs Cache Purge, Single Redirect: Edit and Analytics: Read. Cloudflare Registrar (`cloudflare_registrar`) checks the 32-hex account ID and a token of at least 20 characters, then reads the registrar’s extension list (refused → "Cloudflare Registrar rejected these credentials: … (the token needs Registrar: Edit on this account)").',
      auth: 'platform.manage',
      path_params: keyParam(
        'Connection key: `stripe`, `paddle`, `lemon_squeezy`, `cloudflare`, `cloudflare_registrar`, `expo`, `postmark`, `smtp`, `google_ads`, `microsoft_ads`, `google_crux`, `anthropic`, `assemblyai`, `clamav`, `metrics`, `oauth_{provider}`.',
      ),
      body: ref('ConnectionInput'),
      response: resource(ref('PlatformConnection')),
      errors: [404, 422, 423],
      audit: { text: 'Connected {name} / Updated credentials for {name}', category: 'Security' },
      example: {
        params: { key: 'postmark' },
        body: { credentials: [{ field: 'server_token', value: 'pm-server-token-5e1d0a9c' }] },
      },
    },
    {
      method: 'DELETE',
      path: '/platform/connections/{key}',
      summary: 'Disconnect (deletes the stored credentials)',
      description:
        'Payment providers also need `billing.manage`. 409 for `paddle` / `lemon_squeezy` while it is the billing provider (Settings → Billing & dunning) or still bills schools (“1 school is still billed through Lemon Squeezy. …”).',
      auth: 'platform.manage',
      path_params: keyParam('Connection key.'),
      response: resource(ref('PlatformConnection')),
      errors: [404, 409, 423],
      audit: { text: 'Disconnected {name}', category: 'Security' },
      example: { params: { key: 'oauth_zoom' } },
    },
    {
      method: 'POST',
      path: '/platform/connections/{key}/test',
      summary: 'Re-verify the stored credentials with the provider',
      auth: 'platform.manage',
      path_params: keyParam('Connection key.'),
      response: resource(ref('ConnectionTestResult')),
      errors: [404, 409],
      example: { params: { key: 'cloudflare' } },
    },

    // ---------- Feature availability ----------
    {
      method: 'GET',
      path: '/platform/availability',
      summary: 'Feature availability: every capability with its switch, connections and reach',
      description:
        'One platform switch per capability (module, extension, live provider, ad network, sign-in provider, marketplace app), above plans, extensions and per-school overrides. `available` = switch on and the `requires` connections connected (all of them; any one when `requires_any`). Unavailable capabilities are hidden from every school: `/auth/me` and the public site payload list them in `unavailable`; their API answers 403 `feature_unavailable` (`reason: platform_disabled`, `capability`). `schools_using` is cached for 5 minutes (null = not counted); `paying_schools` counts schools paying for one of its `extensions` (their billing is never changed automatically). `groups` are in display order.',
      auth: 'platform.view',
      response: resource(ref('Availability')),
    },
    {
      method: 'PUT',
      path: '/platform/availability/{key}',
      summary: 'Turn a capability on or off for every school',
      description:
        'Switching off needs a password confirmed in the last 15 minutes (423 `password_confirmation_required`); switching on does not. Audited only when the switch changes. The Connections screen shows the same switches per connection (`capabilities` on each connection).',
      auth: 'platform.manage',
      path_params: keyParam('Capability key, e.g. `live_rooms`, `ai`, `app_slack`, `signin_google`.'),
      body: ref('AvailabilityUpdate'),
      response: resource(ref('Capability')),
      errors: [404, 422, 423],
      audit: { text: 'Turned off {label} for all schools / Turned on {label} for all schools', category: 'Flags' },
      example: { params: { key: 'live_rooms' }, body: { on: true } },
    },

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
      description:
        'Switches the feature for every school in the rollout at once. Requires a password confirmed in the last 15 minutes (423 `password_confirmation_required`).',
      auth: 'flags.manage',
      path_params: keyParam('Flag key, e.g. `multi_currency`.'),
      body: ref('FlagUpdate'),
      response: resource(ref('FeatureFlag')),
      errors: [404, 423],
      audit: { text: 'Set "{flag}" rollout to {rollout} · Enabled/Disabled "{flag}" for {rollout}', category: 'Flags' },
      example: { params: { key: 'multi_currency' }, body: { enabled: false, rollout: 'Beta list' } },
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

    // ---------- Sender reputation ----------
    {
      method: 'GET',
      path: '/platform/sending-ips',
      summary: 'Coursiva Mail sending IPs (shared pool and dedicated) with their Spamhaus ZEN result',
      auth: 'platform.view',
      response: resource(arrayOf(ref('SendingIp'))),
    },
    {
      method: 'POST',
      path: '/platform/sending-ips',
      summary: 'Add a sending IP (a public IP; dedicated IPs name their school)',
      auth: 'platform.manage',
      body: ref('SendingIpInput'),
      response: resource(ref('SendingIp'), 201),
      errors: [422],
      audit: { text: 'Added sending IP {ip} ({kind})', category: 'Tenants' },
      example: { body: { ip: '198.51.100.20', kind: 'pool', label: 'Shared pool C' } },
    },
    {
      method: 'DELETE',
      path: '/platform/sending-ips/{id}',
      summary: 'Remove a sending IP (409 for an active dedicated IP)',
      auth: 'platform.manage',
      path_params: idParam('Sending IP id, e.g. `sip_pool_2`.'),
      response: noContent(),
      errors: [404, 409],
      audit: { text: 'Removed sending IP {ip}', category: 'Tenants' },
      example: { params: { id: 'sip_pool_2' } },
    },
    {
      method: 'GET',
      path: '/platform/dedicated-ips',
      summary: 'Dedicated IP requests (pending first); the server token is never returned',
      auth: 'platform.view',
      query: { ...pageParams },
      response: paginated(ref('DedicatedIpRequest')),
    },
    {
      method: 'POST',
      path: '/platform/dedicated-ips/{id}/provision',
      summary: 'Provision a dedicated IP with a dedicated Postmark server (token verified, sealed)',
      description: 'Needs a recently confirmed password (423 otherwise).',
      auth: 'platform.manage',
      path_params: idParam('Request id, e.g. `dip_devpath`.'),
      body: ref('ProvisionInput'),
      response: resource(ref('DedicatedIpRequest')),
      errors: [404, 409, 422, 423],
      audit: { text: 'Provisioned dedicated IP {ip} for {tenant}', category: 'Tenants' },
      example: { skip: 'Needs a recently confirmed password.' },
    },
    {
      method: 'POST',
      path: '/platform/dedicated-ips/{id}/reject',
      summary: 'Decline a pending dedicated IP request',
      auth: 'platform.manage',
      path_params: idParam('Request id, e.g. `dip_devpath`.'),
      body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } },
      response: resource(ref('DedicatedIpRequest')),
      errors: [404, 409, 422],
      audit: { text: 'Declined the dedicated IP request of {tenant}', category: 'Tenants' },
      example: { params: { id: 'dip_devpath' }, body: { reason: 'Volume is too low for a dedicated IP yet.' } },
    },
    {
      method: 'POST',
      path: '/platform/dedicated-ips/{id}/release',
      summary: 'Release a dedicated IP (the school goes back to the shared pool)',
      auth: 'platform.manage',
      path_params: idParam('Request id, e.g. `dip_nordic`.'),
      response: resource(ref('DedicatedIpRequest')),
      errors: [404, 409],
      audit: { text: 'Released the dedicated IP of {tenant}; its mail goes through the shared pool', category: 'Tenants' },
      example: { params: { id: 'dip_nordic' } },
    },

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
      description:
        '`failed_imports` is one page of the open failed imports, newest first; `meta` pages it and `summary.failed_imports` is their total.',
      auth: 'platform.view',
      query: pageParams,
      response: pagedResource(ref('Standards')),
      example: { query: { per_page: 25 } },
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
      description:
        'The response is the only time the full `secret` is returned. Requires a password confirmed in the last 15 minutes (423 `password_confirmation_required`). A request authenticated with an API key has no session, so it can never mint another key.',
      auth: 'platform.manage',
      errors: [423],
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
      description: '`failed_deliveries` is one page of the failed deliveries of the last 24 hours, newest first; `meta` pages it.',
      auth: 'platform.view',
      query: pageParams,
      response: pagedResource(ref('Webhooks')),
      example: { query: { per_page: 25 } },
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
