import { arrayOf, defineSpec, noContent, ref, resource } from '@/openapi/dsl';

const slot = { slot: { type: 'string', enum: ['logo', 'logo_dark', 'favicon', 'og_image'], description: 'Brand asset slot.' } } as const;

export const spec = defineSpec({
  tag: 'Settings',
  description:
    'Platform-wide configuration: general, security and notification settings, the integration marketplace, and tax & invoicing.',
  endpoints: [
    { method: 'GET', path: '/settings', summary: 'Platform settings', auth: 'platform.view', response: resource(ref('PlatformSettings')) },
    {
      method: 'PATCH',
      path: '/settings',
      summary: 'Update platform settings',
      description:
        'Any subset of fields. `primary_domain` must be a verified platform domain; `trial_days` 0–90 (the single source, same as `GET /billing/pricing`; 0 = pay at sign-up); `trial_requires_card` bool; `card_check_amount` 50–500 minor units of `billing_currency` (read-only, ignored here); `dunning_retries` 1–5; `session_hours` 4/8/12/24; `idle_lock_minutes` 5/10/15/30/60. ' +
        '`billing_provider` (`stripe` · `paddle` · `lemon_squeezy`): changing it also needs `billing.manage` (403 “Changing the billing provider needs the billing.manage permission.”) and a connected provider (422 “Connect Paddle in Platform → Connections first.”). ' +
        'Switching `maintenance_mode` on (every school offline) requires a password confirmed in the last 15 minutes (423 `password_confirmation_required`); switching it off does not.',
      auth: 'platform.manage',
      errors: [423],
      body: ref('PlatformSettingsUpdate'),
      response: resource(ref('PlatformSettings')),
      audit: { text: 'Updated platform settings: {fields}', category: 'Security' },
      example: { body: { trial_days: 21, weekly_digest: false, console_ip_allowlist: ['203.0.113.0/24'] } },
    },
    {
      method: 'GET',
      path: '/settings/meta',
      summary: 'Shipped defaults and where each setting is read',
      description:
        'One entry per field: its section, its shipped default (`null` when it has none or isn’t resettable, like `primary_domain` and `billing_provider`) and where the value is read (not translated).',
      auth: 'platform.view',
      response: resource(ref('SettingsMetaWire')),
    },
    {
      method: 'POST',
      path: '/settings/sections/{section}/reset',
      summary: 'Restore the defaults of a settings section',
      description:
        'Every resettable field of the section that has a shipped default goes back to it (`billing_provider` is left as it is).',
      auth: 'platform.manage',
      path_params: {
        section: {
          type: 'string',
          enum: ['platform', 'signup', 'branding', 'legal', 'email', 'security', 'billing', 'notifications', 'maintenance'],
          description: 'Settings section.',
        },
      },
      response: resource(ref('PlatformSettings')),
      errors: [404],
      audit: { text: 'Restored the default {section} settings ({fields})', category: 'Security' },
      example: { params: { section: 'signup' } },
    },
    {
      method: 'POST',
      path: '/settings/brand-assets/{slot}',
      summary: 'Upload a platform brand image',
      description:
        'Multipart `file`: PNG, JPEG or WebP, ≤ 2 MB (`favicon` ≤ 512 KB). SVG is refused (it can carry script — stored XSS from the platform origin). Replacing an asset deletes the previous file.',
      auth: 'platform.manage',
      path_params: slot,
      body: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
      bodyType: 'multipart',
      response: resource(arrayOf(ref('BrandAsset'))),
      audit: { text: 'Uploaded the platform {slot label}', category: 'Security' },
      example: { params: { slot: 'logo' }, skip: 'multipart upload — exercised in settings.test.tsx' },
    },
    {
      method: 'DELETE',
      path: '/settings/brand-assets/{slot}',
      summary: 'Remove a platform brand image',
      auth: 'platform.manage',
      path_params: slot,
      response: resource(arrayOf(ref('BrandAsset'))),
      audit: { text: 'Removed the platform {slot label}', category: 'Security' },
      example: { params: { slot: 'favicon' } },
    },
    {
      method: 'POST',
      path: '/settings/email/test',
      summary: 'Send a test platform email to yourself',
      description: 'Uses the saved email settings; sent to the signed-in staff member. Throttled: 5 per 10 minutes.',
      auth: 'platform.manage',
      response: resource(ref('EmailTestResult'), 202),
      errors: [429],
      audit: { text: 'Sent a test platform email to {address}', category: 'Security' },
      example: {},
    },
    {
      method: 'GET',
      path: '/settings/integrations',
      summary: 'Integration marketplace adoption and requests',
      description:
        '`policies` is always empty: what schools may connect is switched per app on Platform → Feature availability (`app_*`, `pay_stripe`, `sso`, `exams`).',
      auth: 'platform.view',
      response: resource(ref('IntegrationSettings')),
    },
    {
      method: 'POST',
      path: '/settings/integrations/requests/{id}/roadmap',
      summary: 'Add a requested integration to the roadmap',
      auth: 'platform.manage',
      path_params: { id: { type: 'string', description: 'Request id, e.g. `rq_kajabi`.' } },
      response: resource(ref('IntegrationSettings')),
      errors: [404],
      audit: { text: 'Added "{name}" to the integration roadmap', category: 'Security' },
      example: { params: { id: 'rq_kajabi' } },
    },
    {
      method: 'GET',
      path: '/settings/tax',
      summary: 'Tax & invoicing settings',
      auth: 'platform.view',
      response: resource(ref('TaxSettings')),
    },
    {
      method: 'PATCH',
      path: '/settings/tax',
      summary: 'Update tax & invoicing',
      description:
        '`invoice_prefix`: 1–8 of A–Z, 0–9 or `-`. `next_invoice_number` is sequential and gap-free; it must be at least `min_next_invoice_number`.',
      auth: 'platform.manage',
      body: ref('TaxSettingsUpdate'),
      response: resource(ref('TaxSettings')),
      audit: { text: 'Updated tax & invoicing: {changes}', category: 'Billing' },
      example: { body: { tax_inclusive: true, invoice_prefix: 'INV-' } },
    },
    {
      method: 'DELETE',
      path: '/settings/tax/regions/{id}',
      summary: 'Remove a tax registration',
      description: 'Checkout stops collecting tax for the region.',
      auth: 'platform.manage',
      path_params: { id: { type: 'string', description: 'Tax region id, e.g. `uk`.' } },
      response: noContent(),
      errors: [404],
      audit: { text: 'Removed tax registration for {region} — checkout stops collecting {kind}', category: 'Billing' },
      example: { params: { id: 'uk' } },
    },
  ],
});
