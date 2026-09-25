import { PLANS } from '@/lib/domain';
import { defineSpec, file, paginated, ref, resource, type ParamDef } from '@/openapi/dsl';

const key: Record<string, ParamDef> = { key: { type: 'string', description: 'Extension key, e.g. `ai`.' } };
const example = { params: { key: 'ai' } };

export const spec = defineSpec({
  tag: 'Extensions',
  description: 'Paid extension catalogue: prices, visibility, plan inclusion, the all-access bundle and selling rules.',
  endpoints: [
    {
      method: 'GET',
      path: '/extensions',
      summary: 'Extension catalogue with installs and MRR',
      auth: 'billing.view',
      query: {
        page: { type: 'integer', description: 'Page number (1-based).' },
        per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
      },
      response: paginated(ref('Extension')),
      example: { query: { per_page: 100 } },
    },
    {
      method: 'GET',
      path: '/extensions/summary',
      summary: 'Extension revenue KPIs',
      auth: 'billing.view',
      response: resource(ref('ExtensionSummary')),
    },
    {
      method: 'GET',
      path: '/extensions/settings',
      summary: 'Bundle, trial and selling rules',
      auth: 'billing.view',
      response: resource(ref('ExtensionSettings')),
    },
    {
      method: 'PATCH',
      path: '/extensions/settings',
      summary: 'Update bundle price, trial length or selling rules',
      auth: 'billing.manage',
      body: ref('ExtensionSettingsUpdate'),
      response: resource(ref('ExtensionSettings')),
      audit: {
        text: 'Changed all-access bundle price from {old} to {new}/mo (USD) · Set the extension free trial to {n} days · Turned on/off extension selling rule "{rule}"',
        category: 'Billing',
      },
      example: { body: { bundle_price: 149, trial_days: 7, rules: [{ key: 'prorate', enabled: false }] } },
    },
    {
      method: 'GET',
      path: '/extensions/export',
      summary: 'Export installs and MRR per extension as CSV',
      auth: 'billing.view',
      response: file('text/csv', 'extension-revenue.csv'),
      audit: { text: 'Exported extension revenue for {n} extensions', category: 'Billing' },
    },
    {
      method: 'GET',
      path: '/extensions/{key}',
      summary: 'Extension detail',
      auth: 'billing.view',
      path_params: key,
      response: resource(ref('Extension')),
      errors: [404],
      example,
    },
    {
      method: 'PATCH',
      path: '/extensions/{key}',
      summary: 'Change price or hide/publish in the catalogue',
      auth: 'billing.manage',
      path_params: key,
      body: ref('ExtensionUpdate'),
      response: resource(ref('Extension')),
      errors: [404],
      audit: {
        text: 'Changed {name} price from {old} to {new}/mo (USD) · Hid/Published {name} from/in the extension catalogue',
        category: 'Billing',
      },
      example: { ...example, body: { price: 29, hidden: false } },
    },
    {
      method: 'PUT',
      path: '/extensions/{key}/plans',
      summary: 'Set which plans get the extension free',
      description: 'Writes the shared plan-inclusion table used by Plan entitlements and every tenant’s extension list.',
      auth: 'billing.manage',
      path_params: key,
      body: {
        type: 'object',
        required: ['plans'],
        properties: { plans: { type: 'array', items: { type: 'string', enum: PLANS } } },
      },
      response: resource(ref('Extension')),
      errors: [404],
      audit: { text: '{name}: included free on {plans} · {name}: now charged on {plans}', category: 'Billing' },
      example: { ...example, body: { plans: ['Scale'] } },
    },
  ],
});
