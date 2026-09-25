# Platform settings

Types: `src/features/platform/types.ts` · Mock: `src/features/platform/mock.ts` · Tests: `src/features/platform/platform.test.tsx`

Screens: Flags & system status (`/platform/flags`), Email deliverability (`/platform/deliverability`),
Certificate authority (`/platform/certificates`), Standards & conformance (`/platform/standards`), API & webhooks (`/platform/api`).

Every read needs `platform.view`. Writes need the permission listed per endpoint. Every write records an audit entry server-side.

## Feature flags

### `GET /platform/flags`

`{ data: FeatureFlag[] }` — `FeatureFlag`: `key, name, description, enabled, rollout, tenant_overrides` (number of tenants overriding the flag individually).
`rollout`: `All tenants` · `Scale only` · `Growth and Scale` · `Beta list` · `10% of tenants`.

### `PATCH /platform/flags/{key}`

Permission `flags.manage`. Body: any of `{ enabled: bool, rollout }` → `{ data: FeatureFlag }`. 404 unknown key; 422 `enabled`, `rollout`.
Tenant detail (`GET /tenants/{id}` → `flags[]`) reports this platform value for tenants without an override.

| Change    | Audit (Flags)                                                            |
| --------- | ------------------------------------------------------------------------ |
| `enabled` | `Enabled "{name}" for {rollout, lower-case}` / `Disabled "{name}" for …` |
| `rollout` | `Set "{name}" rollout to {rollout, lower-case}`                          |

## System status & incidents

The incident is the same record the header reads from `GET /status` (see [shell.md](shell.md)): posting or resolving one flips
`operational` there immediately.

### `GET /platform/system`

```
{ data: {
  incident: { title, posted_at, service_ids: [] } | null,
  status_page_url: "https://status.{primary_domain}",
  services: [{ id, name, uptime_90d, status: Operational|Degraded }]
} }
```

A service is `Degraded` while an open incident lists it in `service_ids`.

### `POST /platform/incident`

Permission `flags.manage`. Body `{ title, service_ids: [] }` → `201 { data: SystemStatus }`.
422: `title` (5–120 chars; also "An incident is already posted — resolve it before posting another."), `service_ids` (≥ 1, known ids).
Audit: `Posted incident: {title}` (Flags).

### `DELETE /platform/incident`

Permission `flags.manage`. Resolves the open incident → `{ data: SystemStatus }`. 422 `incident` when none is open.
Audit: `Resolved incident: {title}` (Flags).

## Broadcast announcements

A dismissible banner in tenant admin dashboards.

### `GET /platform/broadcasts`

Paginated `Broadcast[]`, newest first: `id, message, audience, recipients, sent_by, sent_at`.

### `POST /platform/broadcasts`

Permission `announcements.send`. Body `{ message, audience }` → `201 { data: Broadcast }`.
`audience`: `All tenants` (not suspended) · `Growth & Scale` (not suspended) · `Trials only`. `recipients` = matching tenants at send time.
422: `message` (required, ≤ 200 chars), `audience`. Audit: `Broadcast to {audience}: "{message}"` (Tenants).

## Email deliverability

### `GET /platform/deliverability`

```
{ data: {
  summary: { sent_30d, bounce_rate, complaint_rate, domains_at_risk,
             thresholds: { bounce_watch: 2, bounce_max: 5, complaint_watch: 0.1, complaint_max: 0.3 } },
  domains: SenderDomain[],
  suppression: [{ list, count, note }]
} }
```

`SenderDomain`: `id, tenant_id, tenant_name, domain, spf, dkim (Pass|Fail|Not set), dmarc (policy string or "none"), sent_30d,
bounce_rate, complaint_rate (percent), risk, paused, paused_at, dns_checked_at`.

Rates are percentages; summary rates are weighted by volume. **`risk` is computed server-side** from provider thresholds:
`Over threshold` when complaints ≥ 0.3% or bounces ≥ 5%; `Watch` when complaints ≥ 0.1% or bounces ≥ 2%; otherwise `Healthy`.
`domains_at_risk` counts domains over threshold or failing SPF/DKIM.

### Sender actions

Permission `platform.manage`. All return `{ data: SenderDomain }`; 404 unknown domain.

| Endpoint                                       | Effect                                                             | Audit (Tenants, with `tenant_id`)    |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `POST /platform/sender-domains/{id}/pause`     | Stops all sending from the tenant's domain (422 if already paused) | `Paused email sending for {tenant}`  |
| `POST /platform/sender-domains/{id}/resume`    | Resumes sending (422 if not paused)                                | `Resumed email sending for {tenant}` |
| `POST /platform/sender-domains/{id}/dns-check` | Re-reads SPF/DKIM/DMARC, updates `dns_checked_at`                  | `Re-checked DNS for {domain}`        |

## Certificate authority

Certificates are held in the platform registry (`verify.coursiva.io`) and stay verifiable after a tenant is suspended or closed.

### `GET /platform/certificates/summary`

`{ data: { issued, verified_30d, revoked, orphaned } }`

### `GET /platform/certificates`

Paginated `Certificate[]`, newest issued first. `search` matches certificate id, learner, course or school (contains, case-insensitive).
`Certificate`: `id` (public id, e.g. `AC-2026-0341`), `learner_name, tenant_id, tenant_name, course, issued_at, status (Valid|Revoked), revoked_at, verify_url`.

### `POST /platform/certificates/{id}/revoke` · `POST /platform/certificates/{id}/reinstate`

Permission `platform.manage` → `{ data: Certificate }`. 422 when already in that state. The public verify page then reads "revoked"
and the holder and tenant are notified.
Audit (Security): `Revoked certificate {id} ({learner})` / `Reinstated certificate {id} ({learner})`.

### `GET /platform/certificate-policies`

`{ data: [{ key, label, description, enabled }] }` — keys `outlive`, `issuer`, `self_revoke`, `ob3`.

### `PUT /platform/certificate-policies/{key}`

Permission `platform.manage`. Body `{ enabled: bool }` → `{ data: RegistryPolicy }`. 422 `enabled`.
Audit: `Enabled/Disabled registry policy "{label}"` (Security).

## Standards & conformance

### `GET /platform/standards`

```
{ data: {
  summary: { scorm_packages, xapi_statements_24h, lti_launches_30d, failed_imports },
  standards: [{ id, name, direction: Import|Export|Both, packages, note, support: Supported|Partial|Not supported }],
  failed_imports: [{ id, tenant_id, tenant_name, file, reason, failed_at }],   // open queue only
  accessibility: [{ surface, level, status: Conformant|Partial|Not conformant, note }]
} }
```

### `POST /platform/imports/{id}/reprocess`

Permission `platform.manage`. Re-runs the import and removes it from the failed queue either way →
`{ data: { id, file, tenant_name, outcome: imported|rejected, message } }`. The tenant is notified of the outcome.
A package over the 2 GB limit is `rejected`; other failures are repaired and `imported` (counted in `scorm_packages`).
422 when already re-processed. Audit: `Re-processed {file} for {tenant} — {outcome}` (Tenants).

## API keys

Platform (staff) API keys. **The full secret is returned exactly once, in the create response.** The server stores only a hash
and the last four characters; every other response carries the masked `prefix`.

### `GET /platform/api-keys`

Paginated `ApiKey[]`, newest first: `id, name, prefix` (e.g. `sk_live_••••4f2a`), `scope (Full access|Read only), created_at, last_used_at, revoked_at`.
Revoked keys stay listed.

### `POST /platform/api-keys`

Permission `platform.manage`. Body `{ name, scope }` → `201 { data: ApiKey & { secret } }` (`secret` = `sk_live_` + 40 hex chars).
422: `name` (2–60 chars, unique among active keys), `scope`.
Audit: `Created API key "{name}" ({prefix}, {scope, lower-case})` (Security).

### `POST /platform/api-keys/{id}/revoke`

Permission `platform.manage` → `{ data: ApiKey }`. Requests with the key are rejected from then on. 422 if already revoked.
Audit: `Revoked API key "{name}" ({prefix})` (Security).

## Webhooks

### `GET /platform/webhooks`

```
{ data: {
  endpoints: [{ id, tenant_id, url, events, success_rate_7d, status: Healthy|Failing }],
  failed_deliveries: [{ id, event, url, error, attempts, last_attempt_at }]    // last 24 h, newest first
} }
```

### `POST /platform/webhook-deliveries/{id}/retry`

Permission `platform.manage` → `{ data: { delivered: bool, status: int|null, delivery: WebhookDelivery|null } }`.
Delivered: removed from the failed list (`delivery: null`). Failed again: `attempts` + 1 and the updated `delivery` is returned.
Audit (Tenants): `Retried webhook {event} to {url} — delivered (HTTP 200)` / `— failed again (HTTP {status})`.
