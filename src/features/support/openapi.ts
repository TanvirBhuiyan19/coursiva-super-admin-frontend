import { defineSpec, paginated, ref, resource, type EndpointDef, type ParamDef } from '@/openapi/dsl';
import { TICKET_VIEWS } from './types';

const id: Record<string, ParamDef> = { id: { type: 'string', description: 'Ticket id, e.g. `tk_1041`.' } };
const example = { params: { id: 'tk_1041' } };

/** POST /support/tickets/{id}/{action} — single-purpose actions returning the updated ticket. */
const action = (path: string, summary: string, audit: EndpointDef['audit'], extra: Partial<EndpointDef> = {}): EndpointDef => ({
  method: 'POST',
  path: `/support/tickets/{id}/${path}`,
  summary,
  auth: 'support.manage',
  path_params: id,
  response: resource(ref('TicketDetail')),
  errors: [404, 422],
  ...(audit ? { audit } : {}),
  example,
  ...extra,
});

export const spec = defineSpec({
  tag: 'Support',
  description: 'Tenant support inbox: tickets, replies and internal notes, SLA tracking and tenant context.',
  endpoints: [
    {
      method: 'GET',
      path: '/support/summary',
      summary: 'Inbox KPIs and per-view counts',
      auth: 'support.view',
      response: resource(ref('SupportSummary')),
    },
    {
      method: 'GET',
      path: '/support/options',
      summary: 'Assignees, tags and canned replies for the ticket editor',
      auth: 'support.view',
      response: resource(ref('SupportOptions')),
    },
    {
      method: 'GET',
      path: '/support/tickets',
      summary: 'List tickets in an inbox view',
      description:
        'Newest first; tickets breaching their first-reply SLA float to the top. Search matches subject, requester, tenant name and ticket number.',
      auth: 'support.view',
      query: {
        page: { type: 'integer', description: 'Page number (1-based).' },
        per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
        search: { type: 'string', description: 'Case-insensitive contains search.' },
        view: { type: 'string', enum: TICKET_VIEWS, description: 'Inbox view (default `open`).' },
      },
      response: paginated(ref('Ticket')),
      example: { query: { view: 'all', per_page: 5 } },
    },
    {
      method: 'GET',
      path: '/support/tickets/{id}',
      summary: 'Ticket detail with messages and tenant context',
      auth: 'support.view',
      path_params: id,
      response: resource(ref('TicketDetail')),
      errors: [404],
      example,
    },
    {
      method: 'PATCH',
      path: '/support/tickets/{id}',
      summary: 'Assign, change status or retag a ticket',
      description: 'Snooze in the UI is `{ status: "Pending" }` (pauses the SLA clock). Tags must come from `/support/options`.',
      auth: 'support.manage',
      path_params: id,
      body: ref('TicketUpdate'),
      response: resource(ref('TicketDetail')),
      errors: [404],
      audit: { text: 'Assigned ticket #{n} to {name} · Unassigned ticket #{n} · Changed ticket #{n} from {a} to {b}', category: 'Tenants' },
      example: { ...example, body: { assignee_id: 'st_priya', status: 'Pending', tags: ['Billing'] } },
    },
    {
      method: 'POST',
      path: '/support/tickets/{id}/messages',
      summary: 'Reply to the tenant or add an internal note',
      description: '`internal: true` notes are staff-only and never exposed to the tenant. Body max 5,000 characters.',
      auth: 'support.manage',
      path_params: id,
      body: ref('NewTicketMessage'),
      response: resource(ref('TicketDetail'), 201),
      errors: [404],
      audit: { text: 'Replied to ticket #{n} ({tenant}) · Added an internal note to ticket #{n} ({tenant})', category: 'Tenants' },
      example: { ...example, body: { body: 'Thanks, looking into this now.', internal: false } },
    },
    action('escalate', 'Escalate to engineering (reopens a resolved ticket)', {
      text: 'Escalated ticket #{n} to engineering',
      category: 'Tenants',
    }),
    action('resolve', 'Resolve and send a CSAT survey', {
      text: 'Resolved ticket #{n} and sent a CSAT survey to {requester}',
      category: 'Tenants',
    }),
  ],
});
