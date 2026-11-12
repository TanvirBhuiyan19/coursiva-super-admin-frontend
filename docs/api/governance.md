# Governance

Types: `src/features/governance/types.ts` · Mock: `src/features/governance/mock.ts` · Tests: `src/features/governance/governance.test.tsx`

Screens: Compliance & privacy, Trust & moderation, Policies & terms, Data residency, Abuse & limits.

**Permissions.** Every `GET` needs `governance.view`. Every mutation needs `governance.manage`, except region moves, which use
`PATCH /tenants/{id}` and need `tenants.manage` (see [tenants.md](tenants.md)).

Lists marked _not paginated_ return `{ data: [ … ] }` with no `meta` (small, bounded collections: Laravel `Resource::collection($items)`).

## Compliance & privacy

### `GET /governance/compliance`

`{ data: { open_dsars, overdue_dsars, nearest_due_at (ISO|null), sub_processors, dpas_signed, tenants } }`
`dpas_signed` = tenants that accepted the **live** Data Processing Agreement (from policy acceptance below).

### `GET /governance/dsars`

Paginated `Dsar[]`. Filter `status` = `open` · `fulfilled` (omit for both). Open requests first (soonest `due_at`), then fulfilled (newest first).
The console asks for 25 a page (`?dsarPage=` in its URL) and shows the pager — it never stops at a fixed cap.

`Dsar`: `id, requester, tenant_id, tenant_name, type (Access|Deletion|Portability), received_at, due_at, fulfilled_at|null`.
`due_at` is the statutory deadline (receipt + 30 days); the client shows "in 4d" / "2d overdue" from it.
Rows live in the shared `dsars` table — the overview action queue counts the same rows.

### `POST /governance/dsars/{id}/fulfil`

Sets `fulfilled_at`. When the learner no longer exists (already erased or deleted), there is nothing to export or erase and
the request is simply closed (200, never a 404). For a `Deletion` request this **erases** the subject's personal data (UI asks for confirmation first);
`Access` / `Portability` queue the learner's export and email it **to the data subject (the learner)**, never to the staff
member who fulfils it: the email links to the learner's account page on the school's site, where they download their data
once signed in. → `{ data: Dsar }`. 422 `status` if already fulfilled.
Audit (Security, tenant): `Erased personal data for {requester} ({tenant})` · `{type} request fulfilled for {requester} ({tenant})`.

### `GET /governance/retention` — _not paginated_

`[{ key, label, period, default_period }]`. Keys: `deleted_students`, `cancelled_workspaces`, `payment_records`, `audit_logs`.
Periods: `30 days` · `90 days` · `1 year` · `3 years` · `7 years`.

### `PUT /governance/retention/{key}`

Body `{ period }` → `{ data: RetentionSetting }`. 404 unknown key, 422 `period`.
Audit (Security): `Retention for {label, lower-case} set to {period}`.

### `GET /governance/sub-processors` — _not paginated_

`[{ id, name, purpose, location }]`. The single list behind the Compliance card, the DPA, the public trust page and the Data residency count.

## Trust & moderation

### `GET /governance/moderation`

`{ data: { open_reports, open_high, dmca_notices_90d, median_hours_to_action|null, tenants_on_strikes, strike_limit } }`
Median over decided reports (`decided_at − received_at`). `strike_limit` is 3.

### `GET /governance/reports`

Paginated `ModerationReport[]`. Params: `status` = `open` (default: undecided **or** access limited) · `decided` (removed or kept);
`severity` = `High|Medium|Low`. Open: highest severity first, then newest. Decided: newest decision first.
`meta.severity_counts: [{ severity, count }]` — counts within `status`, ignoring `severity` (drives the filter chips).

`ModerationReport`: `id, kind, tenant_id, tenant_name, location, detail, source, severity, received_at, decision (removed|limited|kept|null), decided_at, decided_by`.
Intake additions: `category` (`csam | illegal | copyright | harassment | privacy | impersonation | spam | other`, null on
older rows), `content_type` (`community_post | course | lesson | blog_post | product`, null when the report names only a
URL), `content_id`, `reporter` (`{ name, email }` or null for anonymous — console only, never shown to the school),
`counts_as_strike` (false for learner posts and the school's own reports), `enforcement` (`hidden | not_found | restored`
or null), `reporter_notified_at` and `reporter_count` (how many people reported the item: a later report about an item
with an open report joins it, raising its severity and category but never lowering them). Paged (`page`, `per_page`;
the console asks for 50). Removing or limiting also locks the item in the school until a `kept` decision (it can't
publish, restore or approve it: 409); only reporters who confirmed their email are told the outcome.

**Where reports come from:** community escalations (a member reports a post as illegal content, child safety or
copyright), the report form on school sites (`/report`) and on coursiva.com, and school staff ("Report to Coursiva"). A
CSAM report never stores the material or the reporter's description — only the reference.

### `POST /governance/reports/{id}/decision`

Body `{ decision: removed | limited | kept }` → `{ data: ModerationReport }`.
`limited` is interim: the content is hidden from students and the report stays open for a final decision. `removed` and `kept` are final.
422 `decision`: invalid value, already decided, or limiting twice.
`removed` and `limited` hide the linked item in the school's database (post removed or held, course archived or made
private, lesson back to draft, blog post / product to Draft → `enforcement: hidden`; a missing item → `not_found`);
`kept` after `limited` puts it back (`restored`). The school gets a policy notice (with the appeal window) naming what
was reported and where, never the reporter. The reporter is emailed the final outcome (`removed` or `kept`) once.

| Decision  | Audit (Tenants, tenant)                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `removed` | `{kind} upheld — removed content on {tenant}` — and, when this is the 3rd upheld strike, `Publishing suspended for {tenant} — 3 upheld strikes` |
| `limited` | `Limited access to reported content on {tenant} ({kind})`                                                                                       |
| `kept`    | `Closed {kind} report on {tenant} as no violation`                                                                                              |

### `GET /governance/moderation/strikes`

Derived from decisions: every `removed` report with `counts_as_strike` is one strike.
Paginated (`page`, `per_page` ≤ 100, default 25) by school:
`[{ tenant_id, tenant_name, strikes, publishing_suspended (strikes ≥ 3), history: [{ kind, decided_at }] }]`, most strikes
first, then the most recently struck. Grouping, ordering and paging run in SQL; only the page's schools' histories are read.
The Trust & moderation screen keeps the page in `?strikesPage=`.
A tenant with `publishing_suspended` keeps serving students but can't publish new courses.

## Policies & terms

### `GET /governance/policies`

`{ data: { documents: PolicyDocument[], next_review_at } }` (annual legal review, 1 December).

`PolicyDocument`: `id, doc_key (tos|dpa|aup|student_terms), name, version, state (Draft|Live|Superseded), note, published_at|null,
acceptance_deadline|null, acceptance: { accepted, total }|null` (Live only). One Live version per `doc_key`.

### `GET /governance/policies/{id}/acceptance`

Paginated (`page`, `per_page` ≤ 100, default 25), one row per live tenant:
`[{ tenant_id, tenant_name, plan, accepted_at|null, last_reminded_at|null, reminders }]`, pending first, then by name.
`search` matches the tenant name. `meta` adds `accepted` and `pending` — every live tenant counted, whatever the search —
for the card's "N of M tenants" line. The Policies screen keeps `?acceptanceQ=` and `?acceptancePage=` in the URL.
**Acceptance and reminders are separate records** — a reminder never sets `accepted_at`. Acceptance is recorded by the tenant
dashboard (owner clicks "Accept"), not by this console.

### `POST /governance/policies` — draft a new version

`governance.manage`. Body `{ doc_key: tos|dpa|aup|student_terms, version, note? }` → `201 { data: PolicyDocument }` (state
`Draft`, `name` from the family, `note` null when empty). 422 `doc_key` (unknown family, or "This document already has a
draft — publish it first."), `version` (≤ 20 letters/numbers/dots, and new for the family), `note` (≤ 300).
Audit: `Drafted {name} {version}` (Tenants). The Documents section has the form; nothing else creates documents.

### `POST /governance/policies/{id}/publish`

Draft → Live. The previous Live version of the same `doc_key` becomes `Superseded`. Sets `published_at` = now and
`acceptance_deadline` = now + 30 days; acceptance of the new version starts at zero. → `{ data: PolicyDocument }`.
422 `state` unless Draft. Tenants that haven't accepted by the deadline can't publish new courses.
Audit (Tenants): `Published {name} {version}`.

### `POST /governance/policies/{id}/reminders`

Body `{ tenant_id }` → `{ data: PolicyAcceptance }` (with `last_reminded_at` / `reminders` updated). Emails the owner and shows a
dashboard banner until they accept. 422 `tenant_id`: unknown tenant, document not Live, or already accepted.
Audit (Tenants, tenant): `Reminded {tenant} to accept {name} {version}`.

## Data residency

### `GET /governance/regions`

```json
{
  "data": {
    "regions": [{ "region": "EU", "label": "EU · Frankfurt", "framework": "GDPR · Schrems II", "tenants": 6, "learners": 9412 }],
    "tenants": [
      {
        "tenant_id": "tn_kodo",
        "name": "Kodo Design School",
        "plan": "Launch",
        "students": 146,
        "region": "APAC",
        "migrating": true,
        "requested_region": "EU"
      }
    ],
    "tenants_total": 1,
    "pending_migrations": 1,
    "sub_processors": 6
  }
}
```

Region counts are computed in SQL over every live tenant. `tenants` carries only the **first 100 by name** (kept for
older clients) and `tenants_total` says how many there are; the console pages the full list through
`GET /governance/regions/tenants`.

`regions` lists `EU`, `US`, `UK`, `APAC`. `region` is where the tenant's data **is** (`EU|US|UK|APAC`). `migrating` = a move
was requested and hasn't been carried out; `requested_region` is its target (null otherwise). There is **no automatic
cutover**: a request stays pending (and `region` unchanged) until the platform team migrates the data. Requests from the
tenant dashboard (`uk-london`, …) are reported with the console's codes.

### `GET /governance/regions/tenants`

Paginated `TenantResidency[]` (the rows of `tenants` above), every live tenant by name. `search` matches the name; `region`
(`EU|US|UK|APAC`, 422 `region` otherwise) narrows to one region. The Data residency screen keeps `?regionQ=`, `?region=`
and `?regionPage=` in the URL.

### Moving a tenant — `PATCH /tenants/{id}` `{ region }`

No governance endpoint: the console calls the tenant endpoint (`tenants.manage`), which records a move **request**
(`region_request`, returned on the tenant detail) and audits `Scheduled data-residency move for {name}: {a} → {b}` (Security).
It doesn't move data by itself; the console shows "Move requested" and never claims the tenant moved.

## Abuse & limits

### `GET /governance/abuse-signals`

Unresolved signals, highest severity first, then newest; paginated (`page`, `per_page` ≤ 100, default 25; the screen keeps
`?signalsPage=`):
`[{ id, severity, tenant_id, tenant_name, signal, action (freeze_checkout|raise_limit|acknowledge), action_label, detected_at }]`.

### `POST /governance/abuse-signals/{id}/action`

Applies the recommended action and resolves the signal → `{ data: { signal_id, outcome } }` (`outcome` is the operator-facing sentence).
`raise_limit` doubles the tenant's API limit (sets the tenant's `api_per_minute` limit override); `freeze_checkout` blocks new card
payments (sets the tenant's `checkout_frozen_at`; `acknowledge` just records review). 422 `status` if already handled.
`freeze_checkout` needs a password confirmed in the last 15 minutes (`423 password_confirmation_required`, see [auth.md](auth.md)) in both backends, and the console asks for the school's name typed back first.
A freeze is undone with `DELETE /governance/tenants/{id}/checkout-freeze` (`governance.manage`, audited; see
[tenants.md](tenants.md)) — the tenant drawer shows "Checkout frozen" with **Unfreeze checkout**.
Audit (Security, tenant): `{action_label} applied to {tenant}`.

### `POST /governance/abuse-signals/{id}/dismiss`

Resolves without action → `204`. 422 `status` if already handled.
Audit (Security, tenant): `Dismissed abuse signal for {tenant}: {signal}`.

### `GET /governance/rate-limits` — _not paginated_

`[{ plan, per_minute, default_per_minute, peak_per_minute }]` for Launch, Growth, Scale. Defaults equal the plan limit
`api_per_minute` (60 / 300 / 1000). `peak_per_minute` = highest per-tenant rate seen today, or **null** while request rates aren't sampled (shown as "—").

### `PUT /governance/rate-limits`

Body `{ limits: [{ plan, per_minute }] }` → the full list. Each `per_minute` is an integer 1–100,000.
422 `limits` (empty), `limits.{i}.plan`, `limits.{i}.per_minute`.
Audit (Security): `Set API rate limits — Launch {n} · Growth {n} · Scale {n} req/min`.

### `GET /governance/blocked-ips`

`[{ id, ip, reason, blocked_at, blocked_by }]`, newest first, paginated (`page`, `per_page` ≤ 100, default 25). `search`
matches the address or range. `blocked_by` is `System` for automatic blocks. The screen keeps `?ipsQ=` and `?ipsPage=`.

### `POST /governance/blocked-ips`

Body `{ ip, reason? }` → `201 { data: BlockedIp }`. `ip` accepts IPv4, IPv6 or CIDR (`/0–32`, `/0–128`); stored lower-case.
Blocked addresses get a 403 at the edge. 422 `ip`: invalid (`Enter a valid IPv4 or IPv6 address, or a CIDR range such as 198.51.100.0/24.`)
or `{ip} is already blocked.`; 422 `reason` over 120 characters (default `Blocked manually`).
Audit (Security): `Blocked IP {ip}`.

### `DELETE /governance/blocked-ips/{id}`

→ `204`. 404 unknown id. Audit (Security): `Unblocked IP {ip}`.
