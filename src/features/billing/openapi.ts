import { PLANS } from '@/lib/domain';
import { arrayOf, defineSpec, noContent, paginated, ref, resource, type EndpointDef, type ParamDef } from '@/openapi/dsl';

const invoiceId: Record<string, ParamDef> = { id: { type: 'string', description: 'Invoice id, e.g. `in_20260818`.' } };
const pastDue = { params: { id: 'in_20260818' } };

/** POST /billing/invoices/{id}/{action} — past-due invoice actions returning the updated invoice. */
const invoiceAction = (path: string, summary: string, audit: string, description: string): EndpointDef => ({
  method: 'POST',
  path: `/billing/invoices/{id}/${path}`,
  summary,
  description,
  auth: 'billing.manage',
  path_params: invoiceId,
  response: resource(ref('Invoice')),
  errors: [404, 422],
  audit: { text: audit, category: 'Billing' },
  example: pastDue,
});

export const spec = defineSpec({
  tag: 'Billing',
  description: 'Revenue, invoices and dunning, usage overages, plans & pricing, and promo codes.',
  endpoints: [
    // ---------- Revenue ----------
    {
      method: 'GET',
      path: '/billing/revenue',
      summary: 'MRR/ARR, last month’s movement, churn reasons and payouts',
      auth: 'billing.view',
      response: resource(ref('RevenueSummary')),
    },
    {
      method: 'GET',
      path: '/billing/invoices',
      summary: 'List invoices, newest first',
      auth: 'billing.view',
      query: {
        page: { type: 'integer', description: 'Page number (1-based).' },
        per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
        status: { type: 'string', enum: ['Paid', 'Past due', 'Waived'] },
        focus: { type: 'string', description: 'Invoice id; when `page` is omitted, returns the page containing it.' },
      },
      response: paginated(ref('Invoice')),
      example: { query: { focus: 'in_20260728', per_page: 2 } },
    },
    {
      method: 'GET',
      path: '/billing/dunning',
      summary: 'Past-due invoices and the retry policy',
      auth: 'billing.view',
      response: resource(ref('DunningQueue')),
    },
    invoiceAction(
      'retry',
      'Retry a failed charge',
      'Retried failed charge for {tenant} — ${amount} collected',
      'Marks the invoice Paid; the tenant leaves Past due once it has no past-due invoices left. 422 unless the invoice is Past due.',
    ),
    invoiceAction(
      'waive',
      'Waive a past-due invoice',
      'Waived ${amount} invoice {number} for {tenant}',
      'Marks the invoice Waived; the tenant leaves Past due once it has no past-due invoices left. 422 unless the invoice is Past due.',
    ),
    {
      method: 'PUT',
      path: '/billing/invoices/{id}/dunning',
      summary: 'Pause or resume dunning retries',
      description: '422 unless the invoice is Past due. No audit entry when the state is unchanged.',
      auth: 'billing.manage',
      path_params: invoiceId,
      body: { type: 'object', required: ['paused'], properties: { paused: { type: 'boolean' } } },
      response: resource(ref('Invoice')),
      errors: [404],
      audit: { text: 'Paused/Resumed dunning for {tenant} ({number})', category: 'Billing' },
      example: { ...pastDue, body: { paused: true } },
    },
    {
      method: 'GET',
      path: '/billing/overages',
      summary: 'Usage overages for the current metering period',
      auth: 'billing.view',
      response: resource(ref('OverageList')),
    },
    {
      method: 'POST',
      path: '/billing/overages/{id}/bill',
      summary: 'Add an overage to the tenant’s next invoice',
      auth: 'billing.manage',
      path_params: { id: { type: 'string', description: 'Overage id, e.g. `ov_1`.' } },
      response: resource(ref('Overage')),
      errors: [404, 422],
      audit: { text: 'Added ${amount} {meter} overage to {tenant}’s next invoice', category: 'Billing' },
      example: { params: { id: 'ov_1' } },
    },

    // ---------- Plans & pricing ----------
    {
      method: 'GET',
      path: '/billing/pricing',
      summary: 'Plans, prices, add-ons and plan features',
      auth: 'billing.view',
      response: resource(ref('PricingConfig')),
    },
    {
      method: 'PUT',
      path: '/billing/pricing',
      summary: 'Update prices, annual discount, trial length and add-on prices',
      description:
        'All keys optional. `rollout`: `new_signups` (default — existing tenants keep their locked-in price) or `migrate_all` ' +
        '(every tenant on a changed plan moves to the new price). One audit entry per actual change.',
      auth: 'billing.manage',
      body: ref('PricingUpdateInput'),
      response: resource(ref('PricingUpdateResult')),
      audit: {
        text:
          'Changed {plan} plan price from ${a} to ${b} (new signups only | migrated {n} tenants) · ' +
          'Changed annual billing discount from {a}% to {b}% · Changed {add-on} add-on price from ${a} to ${b}/mo · ' +
          'Changed free trial length from {a} to {b} days',
        category: 'Billing',
      },
      example: {
        body: {
          prices: [{ plan: 'Growth', price: 449 }],
          annual_discount_pct: 20,
          trial_days: 21,
          addons: [{ key: 'seat', price: 9 }],
          rollout: 'migrate_all',
        },
      },
    },
    {
      method: 'PUT',
      path: '/billing/plan-features/{key}/plans/{plan}',
      summary: 'Include or remove a feature from a plan',
      auth: 'billing.manage',
      path_params: {
        key: { type: 'string', description: 'Plan feature key, e.g. `sso`.' },
        plan: { type: 'string', enum: PLANS },
      },
      body: { type: 'object', required: ['included'], properties: { included: { type: 'boolean' } } },
      response: resource(ref('PricingConfig')),
      errors: [404],
      audit: { text: 'Included {feature} in the {plan} plan · Removed {feature} from the {plan} plan', category: 'Billing' },
      example: { params: { key: 'sso', plan: 'Growth' }, body: { included: true } },
    },

    // ---------- Promo codes ----------
    {
      method: 'GET',
      path: '/billing/promos',
      summary: 'Active promo codes, oldest first',
      auth: 'billing.view',
      response: resource(arrayOf(ref('PromoCode'))),
    },
    {
      method: 'POST',
      path: '/billing/promos',
      summary: 'Create a promo code',
      description: 'The code (3–20 letters or digits) is trimmed and upper-cased; 422 if it duplicates an active code.',
      auth: 'billing.manage',
      body: ref('PromoInput'),
      response: resource(ref('PromoCode'), 201),
      audit: { text: 'Created promo code {code} ({percent}% off · {duration})', category: 'Billing' },
      example: { body: { code: 'SPRING25', percent_off: 25, duration: '3 months' } },
    },
    {
      method: 'DELETE',
      path: '/billing/promos/{id}',
      summary: 'Deactivate a promo code',
      auth: 'billing.manage',
      path_params: { id: { type: 'string', description: 'Promo code id, e.g. `pc_launch30`.' } },
      response: noContent(),
      errors: [404],
      audit: { text: 'Deactivated promo code {code}', category: 'Billing' },
      example: { params: { id: 'pc_launch30' } },
    },
  ],
});
