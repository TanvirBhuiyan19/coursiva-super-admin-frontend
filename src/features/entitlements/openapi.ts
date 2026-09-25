import { arrayOf, defineSpec, ref, resource } from '@/openapi/dsl';

export const spec = defineSpec({
  tag: 'Entitlements',
  description:
    'Module × plan entitlement matrix and plan limits. Overrides are stored per module and plan; the API always exchanges arrays of cells.',
  endpoints: [
    {
      method: 'GET',
      path: '/entitlements/limits',
      summary: 'Plan limits (0 = unlimited)',
      description: '`live_room_minutes` is managed on the Video & storage screen (`managed_by: media`).',
      auth: 'platform.view',
      response: resource(arrayOf(ref('PlanLimit'))),
    },
    {
      method: 'GET',
      path: '/entitlements',
      summary: 'Entitlement matrix',
      auth: 'platform.view',
      response: resource(ref('EntitlementMatrix')),
    },
    {
      method: 'PUT',
      path: '/entitlements',
      summary: 'Set module × plan cells',
      description:
        'A value equal to the plan default removes the override. Core modules cannot be changed (422). Validation errors are keyed `cells.{i}.module_id` / `.plan` / `.enabled`.',
      auth: 'platform.manage',
      body: {
        type: 'object',
        required: ['cells'],
        properties: { cells: { type: 'array', minItems: 1, items: ref('EntitlementCellInput') } },
      },
      response: resource(ref('EntitlementMatrix')),
      audit: { text: '{module} added to / removed from the {plan} plan (one entry per changed cell)', category: 'Flags' },
      example: { body: { cells: [{ module_id: 'aistudio', plan: 'Growth', enabled: true }] } },
    },
    {
      method: 'DELETE',
      path: '/entitlements/overrides',
      summary: 'Reset all overrides to plan defaults',
      auth: 'platform.manage',
      response: resource(ref('EntitlementMatrix')),
      audit: { text: 'Reset {n} entitlement override(s) to plan defaults (only when there were any)', category: 'Flags' },
      example: {},
    },
  ],
});
