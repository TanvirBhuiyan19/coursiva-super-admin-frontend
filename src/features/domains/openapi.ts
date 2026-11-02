import { arrayOf, defineSpec, paginated, ref, resource, type ParamDef } from '@/openapi/dsl';
import { DOMAIN_ORDER_KINDS, DOMAIN_ORDER_STATUSES, REGISTRAR_TASK_KINDS, REGISTRATION_STATUSES, TASK_STATUS_FILTERS } from './types';

const pageParams: Record<string, ParamDef> = {
  page: { type: 'integer', description: 'Page number (1-based).' },
  per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
};
const tenantParam: ParamDef = { type: 'string', description: 'Only this tenant, e.g. `tn_amplify`.' };
const taskId: Record<string, ParamDef> = { id: { type: 'string', description: 'Task id, e.g. `rgt_transfer`.' } };

export const spec = defineSpec({
  tag: 'Domains',
  description:
    'Domain resale: registrar settings and markup, registrations bought by schools, registrar tasks staff do in the registrar’s dashboard, and orders.',
  endpoints: [
    {
      method: 'GET',
      path: '/domains/settings',
      summary: 'Registrar, markup, extensions and renewal lead time',
      auth: 'tenants.view',
      response: resource(ref('DomainSettings')),
    },
    {
      method: 'PUT',
      path: '/domains/settings',
      summary: 'Change domain settings',
      description:
        'Any subset of the fields; `null` resets a terms URL to its default. The registrar must be `configured` (422 “Connect this registrar first.”). Changing it affects new purchases only. Needs a password confirmed in the last 15 minutes (423).',
      auth: 'platform.manage',
      body: ref('DomainSettingsUpdate'),
      response: resource(ref('DomainSettings')),
      errors: [423],
      audit: { text: 'Changed domain settings ({fields})', category: 'Billing' },
      example: { body: { markup_percent: 25, enabled_tlds: ['com', 'academy', 'co.uk'] } },
    },
    {
      method: 'GET',
      path: '/domains/registrations',
      summary: 'Registrations',
      description:
        'Newest first; with `expiring_within_days`, active/expiring ones expiring within N days, soonest first. `meta.counts` per status respect every filter except `status` (statuses with no rows are left out). Unknown filter values → 422.',
      auth: 'tenants.view',
      query: {
        ...pageParams,
        status: { type: 'string', enum: REGISTRATION_STATUSES },
        tenant_id: tenantParam,
        expiring_within_days: { type: 'integer', description: '1–365.' },
        search: { type: 'string', description: 'Domain contains.' },
      },
      response: paginated(ref('RegistrationRow'), {
        type: 'object',
        required: ['counts'],
        properties: {
          counts: arrayOf({
            type: 'object',
            required: ['status', 'count'],
            properties: { status: ref('RegistrationStatus'), count: { type: 'integer' } },
          }),
        },
      }),
      example: { query: { per_page: 5 } },
    },
    {
      method: 'GET',
      path: '/domains/registrations/{id}',
      summary: 'Registration detail with orders and tasks',
      description: 'Viewing the registrant is audited.',
      auth: 'tenants.view',
      path_params: { id: { type: 'string', description: 'Registration id, e.g. `dreg_amplify`.' } },
      response: resource(ref('RegistrationDetail')),
      errors: [404],
      audit: { text: 'Viewed the registrant contact of {domain}', category: 'Security' },
      example: { params: { id: 'dreg_amplify' } },
    },
    {
      method: 'GET',
      path: '/domains/tasks',
      summary: 'Registrar tasks',
      description:
        'Open first, oldest first. `meta.counts` = open tasks per kind, respecting `tenant_id` only; `meta.open_total` = every open task on the platform (the nav badge: `per_page=1`). Unknown filter values → 422.',
      auth: 'tenants.view',
      query: {
        ...pageParams,
        status: { type: 'string', enum: TASK_STATUS_FILTERS, description: 'Default `open`.' },
        kind: { type: 'string', enum: REGISTRAR_TASK_KINDS },
        tenant_id: tenantParam,
      },
      response: paginated(ref('RegistrarTask'), {
        type: 'object',
        required: ['counts', 'openTotal'],
        properties: {
          counts: arrayOf({
            type: 'object',
            required: ['kind', 'count'],
            properties: { kind: ref('RegistrarTaskKind'), count: { type: 'integer' } },
          }),
          openTotal: { type: 'integer', description: 'Every open task on the platform, whatever the filters.' },
        },
      }),
      example: { query: { status: 'all' } },
    },
    {
      method: 'POST',
      path: '/domains/tasks/{id}/complete',
      summary: 'Complete a task',
      description:
        '`auth_code` is required for `transfer_out` (printable ASCII without spaces, 6–64; emailed to the school’s owners, never stored, logged or audited — the registration stays `transfer_requested` until the daily sync); `expires_at` optional for `renew` (date `YYYY-MM-DD`). Not open → 409 `{ code: conflict, reason: task_closed }`. Needs a recent password (423).',
      auth: 'tenants.manage',
      path_params: taskId,
      body: ref('CompleteTaskInput'),
      response: resource(ref('RegistrarTask')),
      errors: [404, 409, 423],
      audit: { text: 'Completed {kind} task for {domain}', category: 'Tenants' },
      example: { params: { id: 'rgt_contact' }, body: { note: 'Updated in the registrar dashboard.' } },
    },
    {
      method: 'POST',
      path: '/domains/tasks/{id}/cancel',
      summary: 'Cancel a task',
      description:
        'Cancelling a `registration_review` fails the order and refunds the school; cancelling a `renew` whose renewal was paid refunds it (to the card, else account credit). Not open → 409 `task_closed`. Needs a recent password (423).',
      auth: 'tenants.manage',
      path_params: taskId,
      body: ref('CancelTaskInput'),
      response: resource(ref('RegistrarTask')),
      errors: [404, 409, 423],
      audit: { text: 'Cancelled {kind} task for {domain}', category: 'Tenants' },
      example: { params: { id: 'rgt_autorenew' }, body: { note: 'The school renewed after all.' } },
    },
    {
      method: 'GET',
      path: '/domains/orders',
      summary: 'Domain orders',
      description: 'Newest first. `status=problem` = failed + refunded + credited; quotes are listed only with `status=quoted`.',
      auth: 'tenants.view',
      query: {
        ...pageParams,
        status: { type: 'string', enum: [...DOMAIN_ORDER_STATUSES, 'problem'] },
        kind: { type: 'string', enum: DOMAIN_ORDER_KINDS },
        tenant_id: tenantParam,
      },
      response: paginated(ref('DomainOrderRow')),
      example: { query: { status: 'problem' } },
    },
  ],
});
