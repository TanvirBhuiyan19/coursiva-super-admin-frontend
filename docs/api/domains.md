# Domains & registrar

Types: `src/features/domains/types.ts` · Mock: `src/features/domains/mock.ts` (to build from this contract)

Screen: `/domains` — sidebar group **Main**, after Support. Schools buy domains in their dashboard
(tenant-dashboard `docs/api/domains.md`); Coursiva resells them through a registrar (Cloudflare Registrar today;
Name.com / OpenSRS can be added later) at the registrar's cost plus a markup set here. Some registrar operations have no
API yet (with Cloudflare: renewals, transfer codes, contact changes); those arrive here as **tasks** for staff to do in
the registrar's dashboard and complete.

Backend design: `backend/docs/domain-registrar.md`. The registrar's credentials are a connection
([platform.md](platform.md) → Connections, key `cloudflare_registrar`, Custom domains section).

Money: decimal USD (README → Money), e.g. `12.99`. Times: ISO-8601 UTC date-times unless a field says "date"
(`YYYY-MM-DD`).

## Permissions

| Endpoints                                    | Permission                         |
| -------------------------------------------- | ---------------------------------- |
| `GET` settings, registrations, tasks, orders | `tenants.view`                     |
| `PUT /domains/settings`                      | `platform.manage` + password (423) |
| Task complete / cancel                       | `tenants.manage` + password (423)  |

Password: confirmed in the last 15 minutes, else `423 password_confirmation_required` (see [auth.md](auth.md)).

## Types

```ts
type RegistrarKey = 'cloudflare' | 'fake'; // "fake" only outside production

/** `sandbox`: the registrar's test environment (free test registrations, not on the internet) — show a "Sandbox" badge. */
type Environment = 'live' | 'sandbox';

/** Display names: cloudflare → "Cloudflare Registrar", fake → "Test registrar (fake)". */
type RegistrarOption = {
  key: RegistrarKey;
  name: string;
  configured: boolean; // its connection is saved and verified (or env fallback)
  environment: Environment; // cloudflare: the connection's mode
  capabilities: { renew: boolean; auto_renew_toggle: boolean; transfer_out: boolean; contact_update: boolean; dns: boolean };
};

type DomainSettings = {
  registrar: RegistrarKey; // the registrar new purchases go to
  registrars: RegistrarOption[];
  markup_percent: number; // 0–200, up to 2 decimals (e.g. 12.5), default 20
  markup_min: number; // USD 0–100, up to 2 decimals, default 3 — the minimum margin per year
  rounding: 'x99' | 'none'; // default x99
  enabled_tlds: string[]; // 1–50, without dots, lower case; default com, net, org, co, io, academy, school, courses, education, online, dev, app
  renewal_lead_days: number; // 7–60, default 30 — renewals are charged this many days before expiry
  registration_agreement_url: string | null; // null = the registrar's own agreement
  registrant_benefits_url: string; // default ICANN's "Registrant benefits and responsibilities"
  registrant_education_url: string; // default ICANN's "Registrant educational information"
  terms: { key: 'registration_agreement' | 'registrant_benefits' | 'registrant_education'; label: string; url: string }[]; // what schools link at checkout
  currency: 'USD'; // the billing currency (read-only)
  example: { cost: number; price: number }; // the price of a 10.00 cost under these settings
  environment: Environment; // the active registrar's; "sandbox" → badge next to the registrar
  warnings: string[]; // e.g. the sandbox warning (below); show as a banner
};

type CustomDomainLink = { id: string; domain: string; status: 'pending' | 'verified' | 'failed'; is_primary: boolean }; // "dom_…"

type RegistrationRow = {
  id: string; // "dreg_…"
  tenant_id: string;
  tenant_name: string;
  domain: string;
  provider: RegistrarKey;
  environment: Environment; // "sandbox" rows get a "Sandbox" badge; they never renew or connect
  status: 'registering' | 'active' | 'expiring' | 'grace' | 'expired' | 'transfer_requested' | 'transferred_out' | 'failed';
  registered_at: string | null;
  expires_at: string | null;
  days_until_expiry: number | null;
  auto_renew: boolean; // the school's choice
  provider_auto_renew: boolean | null; // what the registrar is set to (null = unknown)
  renewal_price: number | null;
  renewal_cost: number | null; // registrar cost
  currency: 'USD';
  open_tasks: number;
  connected: boolean; // custom_domain !== null
  custom_domain: CustomDomainLink | null; // the school's custom-domain row for this domain
  contact_pending: boolean; // a contact change waits for a contact_update task
  created_at: string;
};

type RegistrationDetail = RegistrationRow & {
  provider_ref: string | null;
  privacy: boolean;
  transfer_locked_until: string | null;
  failure_reason: string | null;
  last_reminder: 30 | 7 | 1 | null;
  registrant: {
    // personal data: decrypted for staff; null after erasure
    name: string;
    organization: string | null;
    email: string;
    phone: string;
    street: string;
    city: string;
    state: string | null;
    postal_code: string;
    country: string;
  } | null;
  orders: DomainOrderRow[];
  tasks: RegistrarTask[];
};

type DomainOrderRow = {
  id: string; // "dord_…"
  tenant_id: string;
  tenant_name: string;
  domain: string;
  kind: 'registration' | 'renewal';
  environment: Environment;
  status: 'quoted' | 'charging' | 'paid' | 'registering' | 'completed' | 'failed' | 'refunded' | 'credited';
  cost: number; // registrar cost
  price: number; // charged to the school
  currency: 'USD';
  invoice_id: string | null;
  invoice_number: string | null;
  registration_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Task context as a list — never data values as keys. */
type TaskDetail = {
  key: 'reason' | 'detail' | 'requested_at' | 'expires_at' | 'order_id';
  label: 'Reason' | 'Details' | 'Requested' | 'Expires' | 'Order';
  value: string; // ISO-8601 for requested_at / expires_at; a readable sentence for reason
};

type RegistrarTask = {
  id: string; // "rgt_…"
  kind: 'transfer_out' | 'contact_update' | 'disable_auto_renew' | 'renew' | 'registration_review';
  status: 'open' | 'done' | 'cancelled';
  registration_id: string;
  domain: string;
  tenant_id: string;
  tenant_name: string;
  provider: RegistrarKey;
  instructions: string; // what to do in the registrar's dashboard
  details: TaskDetail[]; // in the key order above; never secrets
  resolution_note: string | null;
  completed_by: string | null; // staff name ("System" when closed automatically)
  completed_at: string | null;
  created_at: string;
};
```

`details` per kind (only keys with a value are listed):

| kind                  | keys                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transfer_out`        | `requested_at`                                                                                                                                                      |
| `contact_update`      | `requested_at`                                                                                                                                                      |
| `disable_auto_renew`  | — (none)                                                                                                                                                            |
| `renew`               | `reason` (“Renewal in the grace period (paid)”, “The registrar refused the renewal”, “The registrar can’t renew by API (paid)”), `detail`, `expires_at`, `order_id` |
| `registration_review` | `reason` (“The registrar needs action on this registration”, “The registration stayed pending for 24 hours”, “The registrar kept failing”), `detail`, `order_id`    |

## Pricing

Price per year, in cents, the same rule for registrations and renewals:

1. by percent = cost × (1 + `markup_percent` / 100), rounded **up** to the cent;
2. price = max(by percent, cost + `markup_min`) — never below cost + the minimum margin;
3. `x99`: rounded **up** to the next .99 — 10.00 → 10.99, 10.99 stays 10.99, 11.00 → 11.99 (never down, so step 2
   still holds); `none`: step 2 as is.

Examples (defaults 20 % / 3.00 / x99): cost 8.57 → max(10.29, 11.57) = 11.57 → **11.99**; cost 10.00 → max(12.00, 13.00)
→ **13.99**; cost 40.00 → max(48.00, 43.00) → **48.99**.

## Sandbox

The `cloudflare_registrar` connection's `mode` (default `sandbox`) sends every registrar call to Cloudflare's Registrar
Sandbox. Purchases then go through the normal checkout and invoice, but the registration is a free test record that
isn't on the internet: `com`/`net` only (other extensions answer `tld_unsupported`), no DNS zone, never connected to
the school's site, never reminded, charged or renewed by the daily run. Every registration and order records its
`environment`; sandbox and live registrations of the same domain never block each other. Settings answer
`environment: "sandbox"` and the warning “The registrar is in sandbox mode: purchases are test registrations, not real
domains, and are never connected or renewed. Switch the Cloudflare Registrar connection to live before selling
domains.” In production, readiness fails while the active registrar is in sandbox mode.

## `GET /domains/settings`

`tenants.view` → `{ data: DomainSettings }`.

## `PUT /domains/settings`

`platform.manage` + password. Body: any of `registrar`, `markup_percent`, `markup_min`, `rounding`, `enabled_tlds`,
`renewal_lead_days`, `registration_agreement_url`, `registrant_benefits_url`, `registrant_education_url` (`null` resets
a URL to its default) → `{ data: DomainSettings }`. 422 messages:

| Field                                                 | Message                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registrar`                                           | “Choose Cloudflare Registrar.” (unknown, or `fake` in production) · “Connect this registrar first.” (not `configured`)                                 |
| `markup_percent`                                      | “The markup is 0–200%, with up to 2 decimals.”                                                                                                         |
| `markup_min`                                          | “The minimum margin is 0–100, with up to 2 decimals.”                                                                                                  |
| `rounding`                                            | “Choose x99 or none.”                                                                                                                                  |
| `enabled_tlds`                                        | “Enable at least one extension.” (missing, empty, not a list) · “Enable at most 50 extensions.”                                                        |
| `enabled_tlds.{i}`                                    | “Enter extensions like com or co.uk.” (`^[a-z0-9-]{2,24}(\.[a-z0-9-]{2,24})?$` after trimming a leading dot and lower-casing) · “Each extension once.” |
| `renewal_lead_days`                                   | “Renewals are charged 7–60 days before expiry.”                                                                                                        |
| `registration_agreement_url`                          | “Enter an https:// link, or leave it empty for the registrar’s own agreement.” (≤ 500)                                                                 |
| `registrant_benefits_url`, `registrant_education_url` | “Enter an https:// link, or leave it empty for ICANN’s page.” (≤ 500)                                                                                  |

Changing the registrar affects **new purchases only**: each domain keeps renewing, transferring and syncing with the
registrar it was bought from. Existing domains keep their stored renewal price. Audit `Changed domain settings
({fields})` (Billing).

## Filters (all lists)

Unknown filter values answer 422 (not an empty list): `status` “Unknown status filter.” · `kind` “Unknown kind
filter.” · `tenant_id` “Unknown tenant filter.” (longer than 40) · `search` “The search is at most 253 characters.” ·
`expiring_within_days` “Expiring within is 1–365 days.” · `page` “The page must be 1 or more.” · `per_page` “Per page
is 1–100.” Lists are paginated: `meta { current_page, last_page, per_page, total, from, to, … }`.

## `GET /domains/registrations`

`tenants.view`. `RegistrationRow[]`, newest first (soonest expiry first with `expiring_within_days`). Filters: `status`,
`tenant_id`, `expiring_within_days` (1–365: active/expiring ones expiring within N days), `search` (domain contains).
`meta.counts: [{ status, count }]` — counts **respect every filter except `status`** (tenant, search, expiring), so the
chips show what each status would list; statuses with no rows are left out.

## `GET /domains/registrations/{id}`

`tenants.view` → `{ data: RegistrationDetail }`; 404 “Registration not found.” Viewing a registrant is audited:
`Viewed the registrant contact of {domain}` (Security).

## `GET /domains/tasks`

`tenants.view`. `RegistrarTask[]`, open first, oldest first. Filters: `status` (`open` default, `done`, `cancelled`,
`all`), `kind`, `tenant_id`. Meta:

- `counts: [{ kind, count }]` — **open** tasks per kind, respecting `tenant_id` only (not `kind` or `status`);
- `open_total` — every open task on the platform, whatever the filters. **The nav badge** uses it:
  `GET /domains/tasks?per_page=1` → `meta.open_total`.

Instructions per kind (Cloudflare):

| kind                  | Created when                                                                    | Staff do                                                                                               |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `transfer_out`        | A school asks for its transfer code                                             | Unlock the domain in the registrar dashboard, copy the auth code, complete with `auth_code`.           |
| `contact_update`      | A school changes its registrant contact                                         | Update the contact in the registrar dashboard (the registration's registrant), then complete.          |
| `disable_auto_renew`  | Auto-renew must be off and the registrar can’t be told by API                   | Turn auto-renew off for the domain, then complete.                                                     |
| `renew`               | A school paid to renew a domain in grace (or the registrar can’t renew by API)  | Renew it one year in the registrar dashboard, then complete (optional new `expires_at`).               |
| `registration_review` | A registration needs action, stayed pending 24 h, or the registrar kept failing | Resolve it in the registrar dashboard and complete (the order resumes); **cancel** refunds the school. |

## `POST /domains/tasks/{id}/complete`

`tenants.manage` + password. Body:

- `note?`: string ≤ 500 — 422 “The note is at most 500 characters.”
- `auth_code`: `transfer_out` only, **required** there — printable ASCII without spaces (`!`–`~`), 6–64 characters;
  422 “Paste the transfer code from the registrar.”
- `expires_at?`: `renew` only — a **date** `YYYY-MM-DD` (the domain expires at the end of that day, UTC), after the
  current expiry; 422 “Enter the new expiry date (YYYY-MM-DD).” / “Enter the new expiry date.” (not later).

→ `{ data: RegistrarTask }`. A task that isn't `open` → `409 { code: "conflict", reason: "task_closed" }` (“This task
is already closed.”). Effects:

- `transfer_out`: the code is emailed to the school's owners and **never stored** (nor logged or audited). The
  registration stays `transfer_requested`; it becomes `transferred_out` when the daily sync (04:30 UTC) no longer finds
  it at the registrar — i.e. once the new registrar has completed the transfer (usually within 5 days).
- `contact_update`: `contact_pending` becomes `false` (the contact on the registration is the applied one).
- `disable_auto_renew`: `provider_auto_renew` becomes `false`.
- `renew`: the renewal order completes; with `expires_at` the expiry moves at once (else at the next daily sync); status
  `active`. Open `renew` tasks also close themselves (`completed_by: "System"`) when the sync sees the new expiry.
- `registration_review`: the registration is polled again (the order resumes).

Audit `Completed {kind} task for {domain}` (Tenants).

## `POST /domains/tasks/{id}/cancel`

`tenants.manage` + password. Body `{ note?: string ≤ 500 }` → `{ data: RegistrarTask }`; not `open` → the same `409
task_closed`. Cancelling a `registration_review` fails the order and refunds the school; cancelling a `renew` whose
renewal was paid refunds it (both to the card, else account credit). Audit `Cancelled {kind} task for {domain}`
(Tenants).

## `GET /domains/orders`

`tenants.view`. `DomainOrderRow[]`, newest first. Filters: `status` (one status, or `problem` = failed + refunded +
credited), `kind` (`registration` | `renewal`), `tenant_id`. Quotes (`quoted`) are listed only with `status=quoted`.
