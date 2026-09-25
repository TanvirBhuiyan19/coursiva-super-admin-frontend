# Tenants

Types: `src/features/tenants/types.ts` · Mock: `src/features/tenants/mock.ts` · Tests: `src/features/tenants/tenants.test.tsx`

Tenant ids are opaque strings (`tn_…`). Health, utilisation, stage and MRR are **computed server-side**
(see `src/mocks/derive.ts` for the exact rules) so every screen reports the same numbers.

## Directory

### `GET /tenants`

Permission `tenants.view`. Paginated `Tenant[]`.

| Param     | Values                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search`  | name, owner name/email, domain (contains, case-insensitive)                                                                                      |
| `segment` | `all` · `watchlist` (viewer's) · `at_risk` · `trials_ending` (≤ 7 days) · `past_due` · `dormant` (active, no activity 3 d+) · `top_mrr` (≥ $899) |
| `plan`    | `Launch` · `Growth` · `Scale`                                                                                                                    |
| `status`  | `Active` · `Trial` · `Past due` · `Suspended`                                                                                                    |
| `sort`    | `name` · `students` · `mrr` · `created_at` · `last_active_at` (prefix `-` for desc)                                                              |

`Tenant`: `id, name, domain, owner_name, owner_email, plan, status, students, mrr, health (Healthy|Watch|At risk), health_reason, utilization (0–100 of student limit), stage, created_at, last_active_at, trial_ends_at, watched`.

### `GET /tenants/summary`

`{ data: { total, active, trials, mrr, arpa, at_risk, at_risk_mrr, learners, segments: [{ segment, count }] } }`

### `GET /tenants/export`

Same filters as the directory. CSV attachment `tenants.csv`. Audit: `Exported {n} tenants to CSV` (Tenants).

### `POST /tenants` — provision

Permission `tenants.manage`. Body `{ name, owner_email, plan }` → `201 { data: Tenant }`.
Creates the workspace on `{slug}.{primary_domain}`, status `Trial` for the platform trial length, and emails the owner an invite.
422: `name` (min 2, unique, subdomain taken), `owner_email` (email), `plan` (enum).
Audit: `Provisioned tenant "{name}" on {plan}` (Tenants).

### `POST /tenants/bulk`

Body `{ action: suspend|watch|export, ids: [] }` → `{ data: { affected } }`.
Permission: `tenants.suspend` for suspend, `tenants.view` otherwise.

### `POST /tenants/email`

Permission `tenants.manage`. Body `{ ids, subject, body }` (merge tags `{owner_name}`, `{tenant_name}`, `{plan}`) → `{ data: { sent } }`.
422 `subject`, `body`, `ids`. Audit: `Emailed {n} tenant owners: "{subject}"`.

## Tenant detail

### `GET /tenants/{id}`

Permission `tenants.view`. `TenantDetail` = `Tenant` plus:

| Field                           | Notes                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `region`                        | `EU` · `US` · `APAC`                                                                                                                                   |
| `notes`                         | Internal staff note, nullable                                                                                                                          |
| `storage_used_gb`, `seats_used` | Usage                                                                                                                                                  |
| `health_score`                  | `{ score 0–100, churn_risk Low\|Medium\|High, drivers: [{ label, value, trend up\|down }] }`                                                           |
| `limits`                        | `[{ key, value, plan_default, overridden }]` for `storage_gb, staff_seats, api_per_minute, students, courses, live_room_minutes`. **`0` = unlimited.** |
| `modules`                       | `[{ id, label, group, enabled, plan_default, overridden }]` — non-core tenant modules                                                                  |
| `extensions`                    | `[{ key, name, price, state: comped\|paying\|none }]`                                                                                                  |
| `flags`                         | `[{ key, name, enabled, overridden }]` — flags a tenant can override                                                                                   |
| `invoices`                      | `[{ id, issued_at, amount, status }]` newest first                                                                                                     |
| `timeline`                      | `[{ at, text }]`                                                                                                                                       |

Every mutation below returns the updated `{ data: TenantDetail }`.

| Endpoint                                     | Permission            | Body                                                                          | Audit (category)                                                                                                          |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /tenants/{id}`                        | `tenants.manage`      | any of `{ plan, region, notes }`                                              | plan: `Moved {name} from {a} to {b}` (Tenants) · region: `Scheduled data-residency move for {name}: {a} → {b}` (Security) |
| `PUT /tenants/{id}/limits`                   | `tenants.manage`      | `{ limits: { storage_gb?: int\|null, … } }` — `null` resets to plan default   | `Updated limits for {name}`                                                                                               |
| `PUT /tenants/{id}/modules/{module}`         | `tenants.manage`      | `{ enabled: bool\|null }` — `null`/equal to plan default removes the override | `Granted/Revoked {module} for {name}`                                                                                     |
| `DELETE /tenants/{id}/modules`               | `tenants.manage`      | —                                                                             | `Reset module access for {name} to the {plan} plan`                                                                       |
| `PUT /tenants/{id}/flags/{key}`              | `flags.manage`        | `{ enabled: bool }`                                                           | `Enabled/Disabled "{flag}" for {name}` (Flags)                                                                            |
| `POST /tenants/{id}/extensions/{key}/comp`   | `billing.manage`      | —                                                                             | `Comped {ext} for {name}` (Billing)                                                                                       |
| `DELETE /tenants/{id}/extensions/{key}/comp` | `billing.manage`      | —                                                                             | `Revoked {ext} comp for {name}` (Billing)                                                                                 |
| `POST /tenants/{id}/watch` · `DELETE`        | `tenants.view`        | —                                                                             | — (per staff user)                                                                                                        |
| `POST /tenants/{id}/transfer-ownership`      | `tenants.manage`      | `{ email }` (422 `email`)                                                     | `Started ownership transfer of {name} to {email}` (Security)                                                              |
| `POST /tenants/{id}/impersonate`             | `tenants.impersonate` | — → `{ data: { tenant_id, url, expires_at } }` read-only token, ~30 min       | `Signed in as owner of {name} (read-only)` (Security)                                                                     |
| `POST /tenants/{id}/suspend`                 | `tenants.suspend`     | —                                                                             | `Suspended {name}`                                                                                                        |
| `POST /tenants/{id}/reactivate`              | `tenants.suspend`     | —                                                                             | `Reactivated {name}`                                                                                                      |
| `POST /tenants/{id}/extend-trial`            | `tenants.manage`      | — (+14 days; 422 unless on trial)                                             | `Extended {name}'s trial by 14 days`                                                                                      |
| `POST /tenants/{id}/export`                  | `tenants.manage`      | — (queues export, emails owner)                                               | `Queued full data export for {name}` (Security)                                                                           |
| `POST /tenants/{id}/purge`                   | `tenants.purge`       | — (30-day grace, then hard delete)                                            | `Scheduled data purge for {name} (30-day grace period)` (Security)                                                        |
| `POST /tenants/{id}/revoke-sessions`         | `tenants.manage`      | —                                                                             | `Revoked all sessions for {name}` (Security)                                                                              |
| `POST /tenants/{id}/reset-password`          | `tenants.manage`      | —                                                                             | `Sent password reset to the owner of {name}` (Security)                                                                   |
| `POST /tenants/{id}/reissue-ssl`             | `tenants.manage`      | —                                                                             | `Reissued SSL certificate for {domain}` (Security)                                                                        |

Certificates issued by a tenant stay verifiable after suspension or purge (platform registry).
