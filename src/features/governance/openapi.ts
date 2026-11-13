import { arrayOf, defineSpec, noContent, paginated, ref, resource, type ParamDef } from '@/openapi/dsl';
import { PLANS } from '@/lib/domain';
import { RETENTION_PERIODS, SEVERITIES } from './types';

const id = (what: string, sample: string): Record<string, ParamDef> => ({
  id: { type: 'string', description: `${what} id, e.g. \`${sample}\`.` },
});
const pageParams: Record<string, ParamDef> = {
  page: { type: 'integer', description: 'Page number (1-based).' },
  per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
};

export const spec = defineSpec({
  tag: 'Governance',
  description:
    'Compliance & privacy (DSARs, retention, sub-processors), trust & moderation, policies & terms, data residency, abuse signals, rate limits and IP blocks.',
  endpoints: [
    // ---------- Compliance & privacy ----------
    {
      method: 'GET',
      path: '/governance/compliance',
      summary: 'Compliance KPIs',
      auth: 'governance.view',
      response: resource(ref('ComplianceSummary')),
    },
    {
      method: 'GET',
      path: '/governance/dsars',
      summary: 'Data subject requests',
      description: 'Open requests first (most urgent due date first), then fulfilled (most recent first).',
      auth: 'governance.view',
      query: { ...pageParams, status: { type: 'string', enum: ['open', 'fulfilled'], description: 'Omit for all requests.' } },
      response: paginated(ref('Dsar')),
      example: { query: { status: 'open' } },
    },
    {
      method: 'POST',
      path: '/governance/dsars/{id}/fulfil',
      summary: 'Mark a data subject request fulfilled',
      description: 'For a Deletion request this erases the personal data. 422 if already fulfilled.',
      auth: 'governance.manage',
      path_params: id('Request', 'ds_1'),
      response: resource(ref('Dsar')),
      errors: [422],
      audit: {
        text: 'Erased personal data for {requester} ({tenant}) · {type} request fulfilled for {requester} ({tenant})',
        category: 'Security',
      },
      example: { params: { id: 'ds_1' } },
    },
    {
      method: 'GET',
      path: '/governance/retention',
      summary: 'Data retention settings per data class',
      auth: 'governance.view',
      response: resource(arrayOf(ref('RetentionSetting'))),
    },
    {
      method: 'PUT',
      path: '/governance/retention/{key}',
      summary: 'Set the retention period for a data class',
      auth: 'governance.manage',
      path_params: { key: { type: 'string', description: 'Data-class key, e.g. `deleted_students`.' } },
      body: { type: 'object', required: ['period'], properties: { period: { type: 'string', enum: RETENTION_PERIODS } } },
      response: resource(ref('RetentionSetting')),
      audit: { text: 'Retention for {data class} set to {period}', category: 'Security' },
      example: { params: { key: 'deleted_students' }, body: { period: '1 year' } },
    },
    {
      method: 'GET',
      path: '/governance/sub-processors',
      summary: 'Sub-processors',
      auth: 'governance.view',
      response: resource(arrayOf(ref('SubProcessor'))),
    },

    // ---------- Trust & moderation ----------
    {
      method: 'GET',
      path: '/governance/moderation',
      summary: 'Moderation KPIs',
      auth: 'governance.view',
      response: resource(ref('ModerationSummary')),
    },
    {
      method: 'GET',
      path: '/governance/moderation/strikes',
      summary: 'Tenants with upheld strikes (paginated)',
      description: 'Most strikes first, then the most recently struck; paginated by school (grouped, ordered and paged in SQL).',
      auth: 'governance.view',
      query: pageParams,
      response: paginated(ref('TenantStrikes')),
    },
    {
      method: 'GET',
      path: '/governance/reports',
      summary: 'Moderation reports',
      description:
        '`open` (default) = undecided or access limited, sorted by severity then newest; `decided` = removed or kept, most recently decided first.',
      auth: 'governance.view',
      query: {
        ...pageParams,
        status: { type: 'string', enum: ['open', 'decided'] },
        severity: { type: 'string', enum: SEVERITIES },
      },
      response: paginated(ref('ModerationReport'), {
        type: 'object',
        required: ['severityCounts'],
        properties: {
          severityCounts: {
            description: 'Reports per severity within the current `status` (ignores the severity filter).',
            ...arrayOf({
              type: 'object',
              required: ['severity', 'count'],
              properties: { severity: ref('Severity'), count: { type: 'integer' } },
            }),
          },
        },
      }),
      example: { query: { status: 'open' } },
    },
    {
      method: 'POST',
      path: '/governance/reports/{id}/decision',
      summary: 'Decide a moderation report',
      description:
        '`removed` upholds the report (a strike — reaching the strike limit suspends publishing); `limited` hides the content while the tenant responds; `kept` closes it as no violation. 422 if already decided.',
      auth: 'governance.manage',
      path_params: id('Report', 'rp_1'),
      body: { type: 'object', required: ['decision'], properties: { decision: ref('ModerationDecision') } },
      response: resource(ref('ModerationReport')),
      audit: {
        text: '{kind} upheld — removed content on {tenant} (+ Publishing suspended for {tenant} — 3 upheld strikes) · Limited access to reported content on {tenant} ({kind}) · Closed {kind} report on {tenant} as no violation',
        category: 'Tenants',
      },
      example: { params: { id: 'rp_1' }, body: { decision: 'removed' } },
    },

    // ---------- Policies & terms ----------
    {
      method: 'GET',
      path: '/governance/policies',
      summary: 'Policy documents and next legal review',
      auth: 'governance.view',
      response: resource(ref('PolicyOverview')),
    },
    {
      method: 'GET',
      path: '/governance/policies/{id}/acceptance',
      summary: 'Per-tenant acceptance of a document version',
      description:
        'Not-yet-accepted tenants first, then by name; paginated. `search` matches the tenant name. `meta.accepted` / `meta.pending` count every live tenant (the search does not narrow them).',
      auth: 'governance.view',
      path_params: id('Document', 'pd_tos_41'),
      query: { ...pageParams, search: { type: 'string', description: 'Tenant name contains (case-insensitive).' } },
      response: paginated(ref('PolicyAcceptance'), {
        type: 'object',
        required: ['accepted', 'pending'],
        properties: { accepted: { type: 'integer' }, pending: { type: 'integer' } },
      }),
      example: { params: { id: 'pd_tos_41' } },
    },
    {
      method: 'POST',
      path: '/governance/policies',
      summary: 'Draft a new version of a policy document',
      description:
        '`doc_key` tos|dpa|aup|student_terms, `version` (≤ 20, letters/numbers/dots, new for the family), `note?` (≤ 300). One draft per family: 422 `doc_key` "This document already has a draft — publish it first."; 422 `version` when the label exists.',
      auth: 'governance.manage',
      body: ref('PolicyDraftInput'),
      response: resource(ref('PolicyDocument'), 201),
      audit: { text: 'Drafted {name} {version}', category: 'Tenants' },
      example: { body: { doc_key: 'aup', version: 'v1.9', note: 'Clarifies AI-generated content' } },
    },
    {
      method: 'POST',
      path: '/governance/policies/{id}/publish',
      summary: 'Publish a draft',
      description: 'Supersedes the family’s current Live version and opens a 30-day acceptance window. 422 unless the document is a Draft.',
      auth: 'governance.manage',
      path_params: id('Document', 'pd_tos_42'),
      response: resource(ref('PolicyDocument')),
      errors: [422],
      audit: { text: 'Published {name} {version}', category: 'Tenants' },
      example: { params: { id: 'pd_tos_42' } },
    },
    {
      method: 'POST',
      path: '/governance/policies/{id}/reminders',
      summary: 'Remind a tenant to accept a live document',
      description:
        'Reminders never count as acceptance. 422 if the tenant is unknown, the document is not Live, or the tenant already accepted.',
      auth: 'governance.manage',
      path_params: id('Document', 'pd_tos_41'),
      body: { type: 'object', required: ['tenantId'], properties: { tenantId: { type: 'string' } } },
      response: resource(ref('PolicyAcceptance')),
      audit: { text: 'Reminded {tenant} to accept {name} {version}', category: 'Tenants' },
      example: { params: { id: 'pd_tos_41' }, body: { tenant_id: 'tn_devpath' } },
    },

    // ---------- Data residency ----------
    {
      method: 'GET',
      path: '/governance/regions',
      summary: 'Data residency by region',
      description:
        'Counts per region (all tenants). `tenants` lists only the first 100 by name (kept for older clients) and `tenants_total` says how many there are; the full list pages through `GET /governance/regions/tenants`. Moves are scheduled with `PATCH /tenants/{id}` `{ region }` (tenants.manage).',
      auth: 'governance.view',
      response: resource(ref('RegionSummary')),
    },
    {
      method: 'GET',
      path: '/governance/regions/tenants',
      summary: 'Tenant data regions (paginated)',
      description: 'Every tenant by name. `search` matches the name; `region` narrows to one region (422 `region` if unknown).',
      auth: 'governance.view',
      query: {
        ...pageParams,
        search: { type: 'string', description: 'Tenant name contains (case-insensitive).' },
        region: { type: 'string', enum: ['EU', 'US', 'UK', 'APAC'] },
      },
      response: paginated(ref('TenantResidency')),
      errors: [422],
    },

    // ---------- Abuse & limits ----------
    {
      method: 'GET',
      path: '/governance/abuse-signals',
      summary: 'Unresolved abuse signals',
      description: 'Sorted by severity, then newest; paginated.',
      auth: 'governance.view',
      query: pageParams,
      response: paginated(ref('AbuseSignal')),
    },
    {
      method: 'POST',
      path: '/governance/abuse-signals/{id}/action',
      summary: "Apply a signal's recommended action",
      description:
        '`raise_limit` doubles the tenant’s API per-minute limit; `freeze_checkout` blocks new card payments (sets the tenant’s `checkout_frozen_at`; undo with `DELETE /governance/tenants/{id}/checkout-freeze`) and requires a password confirmed in the last 15 minutes (423 `password_confirmation_required`). 422 if already handled.',
      auth: 'governance.manage',
      path_params: id('Signal', 'as_1'),
      response: resource(ref('AbuseActionResult')),
      errors: [422, 423],
      audit: { text: '{action} applied to {tenant}', category: 'Security' },
      example: { params: { id: 'as_1' } },
    },
    {
      method: 'POST',
      path: '/governance/abuse-signals/{id}/dismiss',
      summary: 'Dismiss an abuse signal',
      auth: 'governance.manage',
      path_params: id('Signal', 'as_3'),
      response: noContent(),
      errors: [422],
      audit: { text: 'Dismissed abuse signal for {tenant}: {signal}', category: 'Security' },
      example: { params: { id: 'as_3' } },
    },
    {
      method: 'GET',
      path: '/governance/rate-limits',
      summary: 'API rate limits per plan',
      auth: 'governance.view',
      response: resource(arrayOf(ref('RateLimit'))),
    },
    {
      method: 'PUT',
      path: '/governance/rate-limits',
      summary: 'Set API rate limits per plan',
      description: 'Send one or more plans; others keep their value. Errors are keyed `limits.{i}.plan` / `limits.{i}.per_minute`.',
      auth: 'governance.manage',
      body: {
        type: 'object',
        required: ['limits'],
        properties: {
          limits: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['plan', 'perMinute'],
              properties: { plan: { type: 'string', enum: PLANS }, perMinute: { type: 'integer', minimum: 1, maximum: 100000 } },
            },
          },
        },
      },
      response: resource(arrayOf(ref('RateLimit'))),
      audit: { text: 'Set API rate limits — Launch {n} · Growth {n} · Scale {n} req/min', category: 'Security' },
      example: { body: { limits: [{ plan: 'Growth', per_minute: 300 }] } },
    },
    {
      method: 'GET',
      path: '/governance/blocked-ips',
      summary: 'Blocked IPs, newest first (paginated)',
      description: '`search` matches the address or range.',
      auth: 'governance.view',
      query: { ...pageParams, search: { type: 'string', description: 'Address or range contains.' } },
      response: paginated(ref('BlockedIp')),
    },
    {
      method: 'POST',
      path: '/governance/blocked-ips',
      summary: 'Block an IP or CIDR range',
      description: 'IPv4, IPv6 or CIDR; stored lower-cased. 422 if invalid or already blocked. Reason defaults to "Blocked manually".',
      auth: 'governance.manage',
      body: { type: 'object', required: ['ip'], properties: { ip: { type: 'string' }, reason: { type: 'string', maxLength: 120 } } },
      response: resource(ref('BlockedIp'), 201),
      audit: { text: 'Blocked IP {ip}', category: 'Security' },
      example: { body: { ip: '10.20.0.0/16', reason: 'Scraper' } },
    },
    {
      method: 'DELETE',
      path: '/governance/blocked-ips/{id}',
      summary: 'Unblock an IP',
      auth: 'governance.manage',
      path_params: id('Blocked IP', 'ip_1'),
      response: noContent(),
      audit: { text: 'Unblocked IP {ip}', category: 'Security' },
      example: { params: { id: 'ip_1' } },
    },
  ],
});
