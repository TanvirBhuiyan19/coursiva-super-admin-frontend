# Billing — revenue, dunning, overages, plans & pricing

Types: `src/features/billing/types.ts` · Mock: `src/features/billing/mock.ts` · Tests: `src/features/billing/billing.test.tsx`

Screens: **Revenue** (`/revenue`) and **Plans & pricing** (`/plans`).
Every read needs `billing.view`; every write needs `billing.manage`. All audit entries use category `Billing`.

MRR is **computed server-side** from tenants (`tenantMrr`: a tenant's locked-in `monthly_price`, `0` while on trial or
suspended — see `src/mocks/derive.ts`), so Revenue, Overview and Tenants always report the same number.

## Revenue

### `GET /billing/revenue`

`RevenueSummary`:

| Field              | Notes                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mrr`, `arr`       | Platform MRR and `mrr × 12`                                                                                                                                                            |
| `net_change`       | Sum of **every** movement of the month (not only the listed ones)                                                                                                                      |
| `past_due_tenants` | Tenants with status `Past due`                                                                                                                                                         |
| `movement_month`   | ISO date, first day of the last closed month                                                                                                                                           |
| `movements`        | `[{ id, kind: new\|expansion\|contraction\|churn, label, detail, amount }]` — signed USD, from the MRR ledger; the 12 largest by absolute amount, biggest first (`id` is a stable key) |
| `movement_count`   | How many movements the month had (the console says "+ N smaller movements")                                                                                                            |
| `churn_reasons`    | `[{ reason, pct }]` over the last 90 days                                                                                                                                              |
| `payouts`          | `[{ id, date, amount, status: Scheduled\|Paid }]` — Stripe payouts (1st and 15th), net of fees, newest first                                                                           |

### `GET /billing/invoices`

Paginated `Invoice[]`, newest first.

| Param              | Values                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `status`           | `Paid` · `Past due` · `Waived` · `Void` (cancelled) · `Open` (issued, not charged yet). The `status` list filter takes the first three. |
| `focus`            | Invoice id. When `page` is absent, returns the page that contains it (deep links from global search: `/revenue?invoice={id}`).          |
| `tenant`           | Tenant id: only that school's invoices (the tenant drawer's "View all invoices" opens `/revenue?tenant={id}`). Unknown id → empty page. |
| `page`, `per_page` | Standard                                                                                                                                |

`Invoice`: `id, number, tenant_id, tenant_name, plan, amount, issued_at, status, attempts, next_retry_at (null when paused or settled), dunning_paused, provider`.

`provider`: `paddle` · `lemon_squeezy` · `null`. Non-null when a merchant of record billed the invoice (schools that
checked out while `billing_provider` pointed at it — see [settings.md](settings.md#billing_provider)); `null` for
Coursiva's own Stripe invoices. The provider retries its invoices on its own schedule, so the console can't act on them
(below): the Revenue screen shows a "Billed by Paddle" / "Billed by Lemon Squeezy" tag on those rows and disables
Retry, Pause and Waive.

### `GET /billing/dunning`

`{ data: { max_attempts, retry_days: int[], auto_suspend, items: Invoice[] }, meta }` — the `Past due` invoices, oldest
failure first, one page at a time: `page`, `per_page` (max 100, default 25); `meta` is the standard pagination meta
(`current_page, last_page, per_page, total, from, to`). The Revenue screen keeps the queue's page in `?dunningPage=`.
`max_attempts` = first charge + `platform_settings.dunning_retries`; `retry_days` is the retry schedule (days after the failed charge).

### Invoice actions

| Endpoint                             | Body               | Effect                                                                                                                                                                                                                                                                                            | Audit                                                                             |
| ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /billing/invoices/{id}/retry`  | —                  | Charges the saved card. On success: invoice `Paid`, `attempts + 1`. The tenant returns to `Active` once it has no past-due invoices. A declined card is **also a 200**: the invoice stays `Past due` (`attempts + 1`) — the console checks `status === 'Paid'` before saying money was collected. | `Retried failed charge for {tenant} — ${amount} collected` / `… — declined again` |
| `POST /billing/invoices/{id}/waive`  | —                  | Invoice `Waived` (written off). Tenant settles as above.                                                                                                                                                                                                                                          | `Waived ${amount} invoice {number} for {tenant}`                                  |
| `PUT /billing/invoices/{id}/dunning` | `{ paused: bool }` | Stops/restarts automatic retries (422 `paused` if not boolean).                                                                                                                                                                                                                                   | `Paused dunning for {tenant} ({number})` / `Resumed …`                            |

All three return `{ data: Invoice }`, 404 for an unknown id, and `422 { status }` unless the invoice is `Past due`.
For a provider invoice they answer `422 { status }`: `{number} is billed by Paddle, which retries it on its own schedule. Manage it in Paddle.`
(`Lemon Squeezy` likewise).

## Metered overages

### `GET /billing/overages`

`{ data: { period, unbilled_total, items: Overage[] }, meta }` for the current metering month (`period` = first day, meters reset on the 1st).
Largest first, one page at a time: `page`, `per_page` (max 100, default 25); `meta` is the standard pagination meta.
`unbilled_total` covers the whole month, not just the page. The Revenue screen keeps the page in `?overagesPage=`.
`Overage`: `id, tenant_id, tenant_name, meter, usage, allowance, rate, per, amount, billed_at`.

### `POST /billing/overages/{id}/bill`

Adds the overage to the tenant's next invoice (sets `billed_at`) → `{ data: Overage }`. 422 `overage` if already billed.
For a school billed through **Lemon Squeezy** (plans only) → `409` with `reason: provider_unsupported`:
`Overage charges aren’t available while billing goes through Lemon Squeezy, which bills plans only. Contact support to arrange them.`
(the screen shows it as an error toast). For a **Paddle** school the overage becomes a one-off charge on its next Paddle renewal.
Audit: `Added ${amount} {meter} overage to {tenant}’s next invoice`.

## Plans & pricing

### `GET /billing/pricing`

`PricingConfig`:

| Field                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plans`               | `[{ plan, price, tenants, paying_tenants, mrr, limits: { staff_seats, students, storage_gb, live_room_minutes }, highlight }]`. `highlight` is a boolean: the recommended plan (Growth), shown as a "Recommended" badge. `price` is the list price for new signups; `limits` are plan defaults (`0` = unlimited, except `live_room_minutes` where `0` = no built-in rooms, tenants bring Zoom/Meet/Teams). |
| `annual_discount_pct` | Discount for annual billing                                                                                                                                                                                                                                                                                                                                                                                |
| `trial_days`          | Platform free-trial length, 0–90 — the single source, also `GET /settings` → `trial_days` (card-first trials: see Settings → `trial_requires_card`, `card_check_amount`)                                                                                                                                                                                                                                   |
| `addons`              | `[{ key, label, price, availability }]` — capacity add-ons, per month                                                                                                                                                                                                                                                                                                                                      |
| `features`            | `[{ key, label, plans: Plan[] }]` — commercial plan flags (LMS modules are in Entitlements)                                                                                                                                                                                                                                                                                                                |

The client previews the MRR impact of a draft price change from `tenants`, `paying_tenants` and `mrr`:
new signups only → `Σ (draft − price) × tenants` (projection); migrate → `Σ draft × paying_tenants − mrr` for changed plans.

### `PUT /billing/pricing`

```json
{
  "prices": [{ "plan": "Growth", "price": 449 }],
  "annual_discount_pct": 20,
  "trial_days": 14,
  "addons": [{ "key": "seat", "price": 9 }],
  "rollout": "new_signups"
}
```

All keys optional. `rollout`: `new_signups` (default — existing tenants keep their locked-in `monthly_price`) or
`migrate_all` (every tenant on a changed plan moves to the new price at its next billing cycle).
→ `{ data: { pricing: PricingConfig, migrated_tenants } }`.

422: `prices.{i}.price` (0–100,000), `prices.{i}.plan`, `addons.{i}.price`, `addons.{i}.key`, `annual_discount_pct` (integer 0–60),
`trial_days` (integer 0–90), `rollout`.

Audit (one entry per actual change):

- `Changed {plan} plan price from ${a} to ${b} (new signups only)` / `(migrated {n} tenants)`
- `Changed {add-on} add-on price from ${a} to ${b}/mo`
- `Changed annual billing discount from {a}% to {b}%`
- `Changed free trial length from {a} to {b} days`

### `PUT /billing/plan-features/{key}/plans/{plan}`

Body `{ included: bool }` → `{ data: PricingConfig }`. 404 for an unknown feature or plan.
Audit: `Included {feature} in the {plan} plan` / `Removed {feature} from the {plan} plan`.

## Card-first trials

Schools enter a card before any plan starts (backend `docs/billing.md` → Free trials). What the console sees:

- New schools appear only once their card is verified (pending sign-ups aren't tenants). Their subscription is
  `trialing` with a card; MRR counts them from the first charge at the trial's end.
- A card that already had a trial gets no free days: that school is `Active` from sign-up with a paid first invoice.
- Legacy card-less trials whose trial ends without a card are **paused**: tenant status `Suspended`, health reason
  `Suspended for billing`, `suspension_reason: "payment_method_required"`. No invoice is issued. Adding a card
  charges the first period and reopens the school; `POST /tenants/{id}/extend-trial` with `{ days }` gives a paused
  school a new trial and reopens it too.
- Settings: `trial_days` (0–90, one value), `trial_requires_card`, `card_check_amount` (Settings → Sign-up).

## Promo codes

### `GET /billing/promos`

Active codes, oldest first: `[{ id, code, percent_off, duration, audience, redemptions, created_at }]`.

### `POST /billing/promos`

Body `{ code, percent_off, duration }` → `201 { data: PromoCode }` (audience `All tenants`).
422: `code` (3–20 letters/digits, upper-cased; unique among active codes), `percent_off` (integer 1–100),
`duration` (`1 month` · `2 months` · `3 months` · `12 months` · `Forever`).
Audit: `Created promo code {code} ({pct}% off · {duration})`.

### `DELETE /billing/promos/{id}`

Deactivates the code (kept for reporting; existing redemptions keep their discount) → `204`. 404 if unknown or already inactive.
Audit: `Deactivated promo code {code}`.
