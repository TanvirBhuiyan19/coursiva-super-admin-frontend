# Partner programme

Coursiva's own partners refer schools to Coursiva and earn a recurring commission (marketing-site `docs/api/partners.md`
covers links, attribution and the partner portal). The console manages applications, partners, referrals, commissions,
payouts on the shared payout rail, tax forms and the programme terms. Screen `partners` (`/partners`, sections in
`?section=`). Laravel: `PartnerConsoleController`, `PartnerPayoutController` (`routes/api/v1/platform-partners.php`).
Go: `internal/modules/partners`.

**Money is in minor units (cents).** Every change is written to the platform audit log (category `Billing`) with its
amounts.

## Permissions

| Permission        | Allows                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `partners.view`   | Every read below.                                                                                                                                                                                 |
| `partners.manage` | Approve, decline, pause, reactivate and ban partners; overrides (rate, cookie window, partner code, linked account); manual attribution and voiding referrals; programme terms (recent password). |
| `partners.payout` | Draft, approve, send, cancel and retry payout batches; reverse a commission; accept and reject tax forms; the 1099 export (recent password).                                                      |

Seeded to the Owner role (platform migration `2026_11_12_110003`); the Admin role's defaults include them.

## Figures and partners

- `GET /partners/summary` → `{ applications, active_partners, referrals, clicks_30d, held, owed, paid, reversed, currency }`.
- `GET /partners?status=&search=&sort=&applications=1` → paginated `Partner`. Applications are Pending partners whose
  email is confirmed.
- `GET /partners/{id}` → `Partner` with `stats` (`clicks`, `clicks_30d`, `signups`, `active_schools`, `held`, `owed`,
  `paid`, `reversed`, `balance`).
- `PATCH /partners/{id}` `{ name?, website?, commission_pct?, cookie_days?, coupon_code?, account_email? }` — `null`
  clears an override; `coupon_code` is stored upper-case and unique; `account_email` must be a Coursiva account (it is
  used to refuse self-referrals).
- `POST /partners/{id}/{approve|decline|pause|activate|ban}` `{ note? }`. Approve needs a confirmed email
  (409 `email_unconfirmed`) and emails the partner the portal link; decline and ban end every portal session; an invalid
  move is 409 `invalid_status`.

## Referrals and commissions

- `GET /partners/referrals?status=active|void&partner_id=` → paginated `PartnerReferral`.
- `POST /partners/referrals` `{ tenant_id, partner_id, reason }` → 201 — manual attribution of a school with no referral
  (409 `already_attributed`), never the partner's own school.
- `POST /partners/referrals/{tenant}/void` `{ reason }` → `{ tenant_id, void_reason, reversed }`: no commission from now
  on; unpaid commissions are reversed.
- `GET /partners/commissions?status=&partner_id=&tenant_id=` → paginated `PartnerCommission`: `due = amount −
reversed_amount − paid_amount` (negative after a clawback of a paid commission: it nets against the next payout).
- `POST /partners/commissions/{id}/reverse` `{ amount, reason }` → `{ id, reversed }`.

Commissions are written once per paid SaaS invoice (base = plan, extensions, bundles minus discounts; never tax, overage
or domains), held for `hold_days`, and clawed back in proportion to refunds and chargebacks only within
`clawback_months` of the school's first paid invoice.

## Payout batches (shared payout rail)

Every money-moving POST needs an `Idempotency-Key` header (8–100 of `A-Za-z0-9_-`), kept on the batch.

- `GET /partners/payout-batches/funding` → `{ currency, stripe_balance, minimum, dual_approval, payout_day, rails[] }`.
- `GET /partners/payout-batches` → paginated `PayoutBatch` (with `item_count`, `needs_second_approver`).
- `GET /partners/payout-batches/{id}` → `PayoutBatch` with `items` and `blocked` (`no_payout_method`,
  `account_unverified`, `tax_form_missing`, `rail_unavailable`).
- `POST /partners/payout-batches` → 201 the draft (409 when nobody is due). A monthly draft is also built on
  `payout_day` (`partners:payouts`); nothing is ever sent automatically.
- `POST …/{id}/approve` — four-eyes: a batch above `dual_approval_usd` can't be approved by its creator
  (403 `second_approver_required`).
- `POST …/{id}/send` — Stripe items are funded from the platform's Stripe balance (409 `insufficient_balance` with
  `available` / `needed`); PayPal items go through the console's PayPal Payouts connection.
- `POST …/{id}/cancel` (draft or approved: every line back to owed), `POST /partners/payout-transfers/{id}/retry`.

## Tax forms

- `GET /partners/tax-forms` → `{ threshold, forms[] }` — the TIN's last four digits only.
- `POST /partners/tax-forms/{id}/accept`, `POST /partners/tax-forms/{id}/reject` `{ note }` (the partner is emailed).
- `GET /partners/tax-forms/1099.csv?year=` — the 1099-NEC worksheet (IRIS CSV layout) of W-9 partners paid at least the
  console threshold (`payouts_form_1099_threshold_usd`, $2,000 for tax year 2026) on the Stripe rail; PayPal amounts
  are a separate column and left out of Box 1. Recent password; audited. Coursiva doesn't e-file.

## Programme terms

- `GET /partners/settings` → the terms, plus `defaults` and `line_kinds`.
- `PUT /partners/settings` (recent password) `{ commission_pct?, cookie_days?, hold_days?, clawback_months?, recurring?
("lifetime" | 1–60), min_payout_usd?, payout_day?, rails?, attribution? (last_click | first_click),
excluded_line_kinds? (must keep tax), dual_approval_usd? }`. Revalidates coursiva.com (`m:affiliate`).
