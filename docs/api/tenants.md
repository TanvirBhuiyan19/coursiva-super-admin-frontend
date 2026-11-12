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
| `ids`     | Comma-separated tenant ids (at most 100 read; 422 `ids` when malformed): only those tenants. Tenant pickers resolve a saved selection with it.   |

`Tenant`: `id, name, domain, owner_name, owner_email, plan, status, students, mrr, health (Healthy|Watch|At risk), health_reason, utilization (0–100 of student limit), stage, created_at, last_active_at, trial_ends_at, watched, suspension_reason`.

- `suspension_reason` — set only while `status` is `Suspended`, else null: `billing` (final failed payment),
  `canceled` (subscription ended), `payment_method_required` (**paused**: the free trial ended without a card; show
  “Paused — no card” and offer “Reopen with a new trial” = `POST /tenants/{id}/extend-trial`), `maintenance`, or a
  staff reason (any other string, e.g. the console's suspend). The first three are billing holds (health reason
  “Suspended for billing”).

### `GET /tenants/summary`

`{ data: { total, active, trials, mrr, arpa, at_risk, at_risk_mrr, learners, segments: [{ segment, count }] } }`

### `GET /tenants/export`

Same filters as the directory, plus optional `ids` (comma-separated, ≤ 500): only those tenants — the bulk bar's
**Export CSV** sends the selected rows. CSV attachment `tenants.csv` with columns `id, name, domain, owner_name,
owner_email, plan, status, students, mrr, health, health_reason, utilization, stage, created_at, last_active_at`
(cells starting `= + - @` are prefixed with `'`). Audit: `Exported {n} tenants to CSV` (Tenants).

### `POST /tenants` — provision

Permission `tenants.manage`. Body `{ name, owner_email, plan }` → `201 { data: Tenant }`.
Creates the workspace on `{slug}.{primary_domain}`, status `Trial` for the platform trial length, and emails the owner an invite.
Console-created schools have no card yet (card-first applies to marketing sign-up only): their trial pauses at its end
until the owner adds one (or staff extend it). With the platform trial length `0`: status `Active`, `trial_ends_at`
null, and the first period is **invoiced at once** (no free month); with no card it is `Past due` and follows dunning
(retries 1/3/7 days, then suspension `billing`); the owner saving a card charges it immediately.
422: `name` (min 2, unique, subdomain taken), `owner_email` (email), `plan` (enum).
`plan` is the lowercase key `launch|growth|scale` (the console sends it lowercase); the API also accepts the display
names `Launch|Growth|Scale` (case-insensitive). Anything else → 422 `plan: The selected plan is invalid.`
Audit: `Provisioned tenant "{name}" on {plan}` (Tenants).

### `POST /tenants/bulk`

Body `{ action: suspend|watch|export, ids: [] }` → `{ data: { affected } }`.
Permission: `tenants.suspend` for suspend, `tenants.manage` for export (queues a full data export per tenant, like
`POST /tenants/{id}/export`; at most 5 bulk exports an hour per staff member, then 429), `tenants.view` for watch.
The console's bulk bar doesn't queue full exports: its Export CSV downloads `GET /tenants/export?ids=…`.
`suspend` takes up to 200 schools offline at once, so it also needs a password confirmed in the last 15 minutes
(`423 password_confirmation_required`, see [auth.md](auth.md)); the console first asks for the count typed back
(`SUSPEND {n}`) in a dialog that names how many schools go offline. `watch` and `export` need no step-up.

### `POST /tenants/email`

Permission `tenants.manage`. Body `{ ids, subject, body }` (merge tags `{owner_name}`, `{tenant_name}`, `{plan}`) → `{ data: { sent } }`.
422 `subject` (≤ 150), `body` (≤ 10,000), `ids`. Audit: `Emailed {n} tenant owners: "{subject}"`.

`subject` is plain text. `body` is **Markdown**, written in the console's rich text editor (`STANDARD`: `##`/`###`
headings, paragraphs, `**bold**`, `*italic*`, `-`/`1.` lists, `>` quotes, `[links](https://…)`; merge tags stored
unescaped). The server fills the merge tags with Markdown-escaped values (a school called `**Acme** <b>` shows
literally, never as formatting, HTML or a link), then renders it with the safe mail Markdown renderer (raw HTML
stripped, images dropped, only `https`/`http`/`mailto:` links; a site-relative `/path` resolves against the marketing
site) into the branded platform email and its plain-text part. A plain-text body (blank lines between paragraphs)
renders as before.

## Tenant detail

### `GET /tenants/{id}`

Permission `tenants.view`. `TenantDetail` = `Tenant` plus:

| Field                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `region`                        | `EU` · `US` · `UK` · `APAC` — where the data is now. `region_request` (`{ region, requested_at, requested_by? }` or null) is a pending move: `PATCH { region }` creates one; the data moves only when the platform team migrates it.                                                                                                                                                                                                                      |
| `notes`                         | Internal staff note, nullable                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `storage_used_gb`, `seats_used` | Usage                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `health_score`                  | `{ score 0–100, churn_risk Low\|Medium\|High, drivers: [{ label, value, trend up\|down }] }`                                                                                                                                                                                                                                                                                                                                                              |
| `limits`                        | `[{ key, value, plan_default, overridden }]` for `storage_gb, staff_seats, api_per_minute, students, courses, live_room_minutes, ai_credits, sms_credits`. **`0` = unlimited.** `key` is a snake_case _value_ (the client converts it with `limitKeyOf`).                                                                                                                                                                                                 |
| `modules`                       | `[{ id, label, group, enabled, plan_default, overridden }]` — non-core tenant modules                                                                                                                                                                                                                                                                                                                                                                     |
| `extensions`                    | `[{ key, name, price, state: comped\|paying\|none }]`                                                                                                                                                                                                                                                                                                                                                                                                     |
| `flags`                         | `[{ key, name, enabled, overridden }]` — flags a tenant can override                                                                                                                                                                                                                                                                                                                                                                                      |
| `invoices`                      | `[{ id, issued_at, amount, status }]` newest first                                                                                                                                                                                                                                                                                                                                                                                                        |
| `timeline`                      | `[{ at, text }]` — the newest 20 only; the full history is `GET /tenants/{id}/activity`                                                                                                                                                                                                                                                                                                                                                                   |
| `checkout_frozen_at`            | When the abuse queue's "Freeze checkout" blocked the school's new card payments, else null. The drawer shows a "Checkout frozen" notice with **Unfreeze checkout** (`governance.manage`).                                                                                                                                                                                                                                                                 |
| `trial`                         | `{ card_verified, requires_card, paused, trial_ends_at } \| null` (null: no subscription yet). `card_verified`: a card saved with Coursiva will be charged when the trial ends. `requires_card`: trialing or paused with no way to charge (no card; or a merchant-of-record school that never checked out). `paused`: the trial ended without a card (`suspension_reason: payment_method_required`). `trial_ends_at`: while trialing or paused, else null |

Every mutation below returns the updated `{ data: TenantDetail }`.

| Endpoint                                     | Permission            | Body                                                                                                                                                                                                                                                                                                                     | Audit (category)                                                                                                          |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `PATCH /tenants/{id}`                        | `tenants.manage`      | any of `{ plan, region, notes }`                                                                                                                                                                                                                                                                                         | plan: `Moved {name} from {a} to {b}` (Tenants) · region: `Scheduled data-residency move for {name}: {a} → {b}` (Security) |
| `PUT /tenants/{id}/limits`                   | `tenants.manage`      | `{ limits: { storage_gb?: int\|null, … } }` — `null` resets to plan default                                                                                                                                                                                                                                              | `Updated limits for {name}`                                                                                               |
| `PUT /tenants/{id}/modules/{module}`         | `tenants.manage`      | `{ enabled: bool\|null }` — `null`/equal to plan default removes the override                                                                                                                                                                                                                                            | `Granted/Revoked {module} for {name}`                                                                                     |
| `DELETE /tenants/{id}/modules`               | `tenants.manage`      | —                                                                                                                                                                                                                                                                                                                        | `Reset module access for {name} to the {plan} plan`                                                                       |
| `PUT /tenants/{id}/flags/{key}`              | `flags.manage`        | `{ enabled: bool }`                                                                                                                                                                                                                                                                                                      | `Enabled/Disabled "{flag}" for {name}` (Flags)                                                                            |
| `POST /tenants/{id}/extensions/{key}/comp`   | `billing.manage`      | —                                                                                                                                                                                                                                                                                                                        | `Comped {ext} for {name}` (Billing)                                                                                       |
| `DELETE /tenants/{id}/extensions/{key}/comp` | `billing.manage`      | —                                                                                                                                                                                                                                                                                                                        | `Revoked {ext} comp for {name}` (Billing)                                                                                 |
| `POST /tenants/{id}/watch` · `DELETE`        | `tenants.view`        | —                                                                                                                                                                                                                                                                                                                        | — (per staff user)                                                                                                        |
| `POST /tenants/{id}/transfer-ownership`      | `tenants.manage`      | `{ email }` (422 `email`)                                                                                                                                                                                                                                                                                                | `Started ownership transfer of {name} to {email}` (Security)                                                              |
| `POST /tenants/{id}/impersonate`             | `tenants.impersonate` | `{ reason? }` (5–300; **required** when `impersonation_requires_reason`) → `{ data: { tenant_id, url, expires_at } }` read-only token, lasts `impersonation_max_minutes`                                                                                                                                                 | `Signed in as owner of {name} (read-only)` + ` — reason: {reason}` when given (Security)                                  |
| `POST /tenants/{id}/suspend`                 | `tenants.suspend`     | —                                                                                                                                                                                                                                                                                                                        | `Suspended {name}`                                                                                                        |
| `POST /tenants/{id}/reactivate`              | `tenants.suspend`     | —                                                                                                                                                                                                                                                                                                                        | `Reactivated {name}`                                                                                                      |
| `POST /tenants/{id}/extend-trial`            | `tenants.manage`      | `{ days? }` integer 1–90, default 14 (422 `days`; 422 `trial` unless on trial or paused for a missing card). A paused school gets a new trial of `days` from now and reopens. Also moved at Paddle / Lemon Squeezy for a school billed there (`502`/`503 provider_error`: nothing changed). Trial reminders are re-armed | `Extended {name}'s trial by {days} days` (Billing)                                                                        |
| `POST /tenants/{id}/export`                  | `tenants.manage`      | — (queues export, emails owner)                                                                                                                                                                                                                                                                                          | `Queued full data export for {name}` (Security)                                                                           |
| `POST /tenants/{id}/purge`                   | `tenants.purge`       | — (30-day grace, then hard delete)                                                                                                                                                                                                                                                                                       | `Scheduled data purge for {name} (30-day grace period)` (Security)                                                        |
| `POST /tenants/{id}/revoke-sessions`         | `tenants.manage`      | —                                                                                                                                                                                                                                                                                                                        | `Revoked all sessions for {name}` (Security)                                                                              |
| `POST /tenants/{id}/reset-password`          | `tenants.manage`      | —                                                                                                                                                                                                                                                                                                                        | `Sent password reset to the owner of {name}` (Security)                                                                   |
| `POST /tenants/{id}/reissue-ssl`             | `tenants.manage`      | —                                                                                                                                                                                                                                                                                                                        | `Reissued SSL certificate for {domain}` (Security)                                                                        |

`PATCH /tenants/{id}` `{ plan }` moves the subscription with the plan (both backends): the new plan's current price
on the school's cycle is locked in, paid add-ons the new plan includes stop billing, a school billed by Paddle / Lemon
Squeezy gets the new price from its next renewal (`502`/`503 provider_error`: nothing changed), and the MRR ledger and
the directory's MRR follow. Staff decide, so there is no downgrade guard and no proration. The same plan is a no-op
(not audited).

### `GET /tenants/{id}/activity`

Permission `tenants.view`. The school's whole history, newest first: lifecycle state changes and console audit entries
merged. `page`, `per_page` (1–100, default 25; the drawer asks for 10). `{ data: [{ at, text }], meta }` with the usual
pagination meta. 404 for an unknown tenant. Each source is read on its `(tenant_id, created_at)` index and cut to
`page × per_page` rows before merging, so deep pages stay cheap.

### Step-up (recent password)

`POST /tenants/{id}/purge` and `POST /tenants/{id}/impersonate` need a password confirmed in the last 15 minutes in
both backends (`423 password_confirmation_required` → the console's password prompt, then one retry; see
[auth.md](auth.md)), like bulk suspend above.

### `DELETE /governance/tenants/{id}/checkout-freeze`

Permission `governance.manage`. Lifts the abuse queue's "Freeze checkout" (`checkout_frozen_at` back to null) so the
school takes card payments again → `{ data: TenantDetail }`. A school that isn't frozen is a no-op (no audit entry).
404 for an unknown tenant. Audit: `Unfroze checkout for {name} — new card payments allowed again` (Security).

### Limits form

`limits` lists all eight keys in both backends (Go used to send six, so Apply limits failed silently on the missing
`ai_credits` / `sms_credits`). The drawer validates and sends only the limits the API returned; a validation error for
a limit with no input (or for `limits` itself) is shown as the form error, never dropped.

`POST /tenants/{id}/impersonate` 422: `reason: Give a reason for signing in as this tenant (5–300 characters).` (missing while
the platform requires one, or outside 5–300 characters). The console asks for the reason before starting the session.
`url` is `{tenant dashboard origin}/auth/handoff?token=…` (single-use handoff token). The console opens it in a new tab
(`window.open(url, '_blank', 'noopener,noreferrer')`) and keeps an "Open the dashboard" link in case a pop-up blocker stops the tab (the token works once);
the tenant dashboard shows the read-only banner and the exit control. There is no in-console mirror of the tenant.

Certificates issued by a tenant stay verifiable after suspension or purge (platform registry).
