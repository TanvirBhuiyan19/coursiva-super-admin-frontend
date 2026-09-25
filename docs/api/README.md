# Platform console API — contract

This folder is the contract between the super-admin frontend and the Laravel backend.
The frontend runs against a Mock Service Worker implementation of exactly this contract
(`src/features/*/mock.ts`), so each document here is backed by working code and tests.

The TypeScript types in `src/features/<feature>/types.ts` are the source of truth for every resource.

## OpenAPI 3.1 spec

**[`docs/openapi.yaml`](../openapi.yaml)** is the machine-readable version of this contract: every endpoint with its
permission (`x-permission`), the audit entry it writes (`x-audit`), request/response schemas (snake_case wire format),
pagination and error responses. It is generated — never edit it by hand:

```bash
npm run openapi         # regenerate after changing types.ts or a feature's openapi.ts
npm run openapi:check   # CI: fails if the committed spec is stale
```

- Endpoints are declared per feature in `src/features/<feature>/openapi.ts` (DSL: `src/openapi/dsl.ts`); schemas are
  generated from the feature's `types.ts`.
- `src/test/contract.test.ts` keeps the spec honest: every mock route must be documented (and vice versa), and every
  endpoint is called against the mock API with its example and its real JSON response validated against the schema.
- Laravel side: import the spec into Scribe/Scramble comparisons, Postman/Insomnia, or validate responses in feature
  tests (e.g. `spectator` / `league/openapi-psr7-validator`) so both implementations stay on one contract.

## Base URL

```
{VITE_API_URL}{VITE_API_PREFIX}      e.g. https://api.coursiva.io/api/v1/admin
```

All paths below are relative to that prefix.

## Authentication — Laravel Sanctum (SPA, cookie based)

1. `GET /sanctum/csrf-cookie` (at the backend root, not under the prefix) sets `XSRF-TOKEN`.
   The client calls it once before the first state-changing request.
2. Every request sends `credentials: include`, `Accept: application/json`, `X-Requested-With: XMLHttpRequest`
   and `X-XSRF-TOKEN` (read from the cookie).
3. Sessions are server-side. `401` or `419` anywhere ends the client session and shows the login page.

Configure `SANCTUM_STATEFUL_DOMAINS` and `SESSION_DOMAIN` for the console's domain, and CORS with
`supports_credentials: true`.

See [auth.md](auth.md) for login and two-factor authentication.

## Conventions

| Topic               | Rule                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON keys           | **snake_case** on the wire. The client converts to camelCase in one place (`src/lib/api/case.ts`).                                                                                                                |
| Data values as keys | **Never** use data values as object keys (e.g. `{ "at_risk": 3 }`): key conversion would rewrite them. Return arrays such as `[{ "segment": "at_risk", "count": 3 }]`. Keyed maps are only for fixed field names. |
| Single resources    | `{ "data": { … } }` (Laravel `JsonResource`).                                                                                                                                                                     |
| Collections         | `{ "data": [ … ], "meta": { "current_page", "last_page", "per_page", "total", "from", "to" } }` (Laravel paginator; `links` may be included and is ignored).                                                      |
| Query params        | `page`, `per_page` (max 100, default 25), `search`, `sort` (`field` asc, `-field` desc), plus feature filters. snake_case names.                                                                                  |
| Timestamps          | ISO-8601 UTC strings, e.g. `2026-09-25T09:14:00Z`. The client formats them ("3h ago").                                                                                                                            |
| Money               | Integer or decimal **USD amounts** (not cents) in fields named `amount`, `mrr`, `price`.                                                                                                                          |
| Empty responses     | `204 No Content`.                                                                                                                                                                                                 |
| File downloads      | `200` with `Content-Type` and `Content-Disposition: attachment; filename="…"` (CSV exports).                                                                                                                      |
| Validation          | `422 { "message": "…", "errors": { "field_name": ["message"] } }`. Nested fields use dot notation (`limits.staff_seats`). Messages are shown verbatim, so write them for operators.                               |
| Authorization       | `403 { "message": "This action is unauthorized." }`. Every endpoint enforces the permission listed in its doc — the UI only hides controls.                                                                       |
| Not found           | `404 { "message": "Tenant not found." }`                                                                                                                                                                          |
| Errors              | `5xx { "message": "Server Error" }`. The client retries idempotent reads twice.                                                                                                                                   |

## Audit log

The **server** writes an audit entry for every significant action (the client never posts to the audit log).
Each doc lists the entry text and category per endpoint. Categories: `Tenants`, `Billing`, `Flags`, `Security`, `Auth`.
Entries record `actor_id`, `actor_name` (or `System`), `ip`, and `tenant_id` where relevant.

## Permissions

Roles and permissions are defined in `src/features/auth/permissions.ts` (use it as the seeder spec).
`GET /auth/me` returns the signed-in user's effective `permissions[]`. Owners always have every permission;
other roles' permissions are editable from the Staff screen.

## Index

| Doc                                  | Endpoints                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| [auth.md](auth.md)                   | `/auth/*`                                                                                     |
| [shell.md](shell.md)                 | `/status`, `/badges`, `/notifications`, `/search`                                             |
| [overview.md](overview.md)           | `/overview`                                                                                   |
| [tenants.md](tenants.md)             | `/tenants/*`                                                                                  |
| [audit.md](audit.md)                 | `/audit`, `/audit/export`                                                                     |
| [billing.md](billing.md)             | `/billing/*` — revenue, invoices, dunning, overages, pricing, promos                          |
| [extensions.md](extensions.md)       | `/extensions/*`                                                                               |
| [entitlements.md](entitlements.md)   | `/entitlements/*`                                                                             |
| [media.md](media.md)                 | `/media/*` — live rooms, DRM, storage                                                         |
| [support.md](support.md)             | `/support/*`                                                                                  |
| [announcements.md](announcements.md) | `/announcements/*` (also the Flags & status banner)                                           |
| [analytics.md](analytics.md)         | `/analytics/*`                                                                                |
| [governance.md](governance.md)       | `/governance/*` — privacy, moderation, policies, residency, abuse                             |
| [platform.md](platform.md)           | `/platform/*` — flags, incidents, deliverability, certificates, standards, API keys, webhooks |
| [backup.md](backup.md)               | `/backup/*`                                                                                   |
| [settings.md](settings.md)           | `/settings/*`                                                                                 |
| [staff.md](staff.md)                 | `/staff/*`                                                                                    |
| [telemetry.md](telemetry.md)         | Web Vitals beacon (real-user monitoring)                                                      |

## Shared business rules

These values have exactly one owner. Every endpoint that reports them must derive them the same way
(the mock implementations live in `src/mocks/derive.ts`, and `src/test/cross-feature.test.ts` locks them in):

| Value                                                                          | Owner (writes)                                                                                   | Read by                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Tenant MRR (locked-in `monthly_price`, 0 while trial/suspended)                | Plans & pricing (migration), provisioning                                                        | Overview, Tenants, Revenue, Analytics, Extensions                              |
| Tenant health & health score                                                   | derived                                                                                          | Tenants, Overview, Growth, Support context                                     |
| Plan limits = static plan limits + **API rate limits** + **live-room minutes** | Abuse & limits (`api_per_minute`), Video & storage (live rooms)                                  | Tenant limits (`0` = unlimited, per-tenant overrides win), Entitlements, Plans |
| Extension plan inclusion & price                                               | Extensions                                                                                       | Entitlements, tenant drawer                                                    |
| Module access per plan                                                         | Entitlements (overrides) over tier / extension defaults                                          | tenant drawer, tenant app                                                      |
| Role permissions                                                               | Staff (permission matrix); Owner always complete; just-in-time elevation grants all until expiry | `/auth/me`, every endpoint                                                     |
| Broadcast banners                                                              | Announcements (`channel: Banner`)                                                                | Flags & status panel                                                           |
