# Console settings

Types: `src/features/settings/types.ts` · Mock: `src/features/settings/mock.ts` · Tests: `src/features/settings/settings.test.tsx`

The Settings screen has two kinds of settings:

| Kind                                               | Where it lives                           | API                             |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| **Personal appearance** — brand colour, light/dark | The browser (`useUi()` → `localStorage`) | None. Never sent to the server. |
| **Platform settings** — everything below           | Shared server-side records               | This document                   |

Permissions: every `GET` needs `platform.view`; every write needs `platform.manage`.

## Platform settings

### `GET /settings`

`{ data: PlatformSettings }` (the `platformSettings` singleton):

| Field                                                | Rule                                                                                                                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `support_email`                                      | email                                                                                                                                                                                         |
| `primary_domain`                                     | hostname, **must be a verified platform domain** (`coursiva.io`, `coursiva.com`, `coursiva.app`) — new tenants get `{slug}.{primary_domain}`                                                  |
| `trial_days`                                         | integer 0–90 — free-trial length of new schools (the **single source**: the same value as `GET /billing/pricing` → `trial_days`; 0 = schools pay the first period at sign-up)                 |
| `trial_requires_card`                                | bool, default `true` — sign-up needs a verified card before the trial starts ($0.50 check, refunded). `false` restores card-less trials (they pause at the trial's end until a card is added) |
| `card_check_amount`                                  | integer 50–500, default `50` — the card check's amount in minor units of the **platform billing currency** (`billing_currency`; Stripe's minimum is 50 = $0.50 in USD); always refunded       |
| `billing_currency`                                   | read-only ISO code (`USD` today; backend config `coursiva.billing.currency`) — the currency Coursiva bills schools in. Show `card_check_amount` as `amount / 100` in it. Ignored by `PATCH`   |
| `default_plan`                                       | `Launch` · `Growth` · `Scale`                                                                                                                                                                 |
| `dunning_retries`                                    | integer 1–5 — failed-payment retries before suspension                                                                                                                                        |
| `auto_suspend`                                       | bool                                                                                                                                                                                          |
| `require_staff_two_factor`                           | bool                                                                                                                                                                                          |
| `enforce_sso`                                        | bool — **always false for now**: there is no staff identity provider, so `true` is a 422 (`Staff single sign-on isn’t available yet — …`); the console shows the toggle disabled              |
| `session_hours`                                      | `4` · `8` · `12` · `24`                                                                                                                                                                       |
| `weekly_digest`, `billing_alerts`, `incident_alerts` | bool                                                                                                                                                                                          |

### `PATCH /settings`

Body: any subset of the fields above (the client sends only changed fields). → `{ data: PlatformSettings }`.

422 per field, e.g. `trial_days: The trial length must be between 0 and 90 days.`,
`card_check_amount: The card check must be between 50 and 500 (minor units; Stripe's minimum is 50).`,
`primary_domain: coursiva.dev isn’t a verified platform domain. Verify its DNS first (…)`. The UI shows them inline.

Audit (Security), listing the fields that actually changed: `Updated platform settings: trial length, SSO enforcement`.

### Sections and the full field list

The screen groups `PlatformSettings` into sections (`SettingsSection`); each has its own Save, Restore defaults and
"Where these values are read". Every field below is also accepted by `PATCH /settings`.

| Section         | Fields (wire names) and rules                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`      | `platform_name` (2–60) · `support_email` · `primary_domain` (above) · `help_centre_url` (https URL or `''`) · `default_timezone` (IANA zone, e.g. `Europe/London`)                                                                                                                                 |
| `signup`        | `public_signup` (bool) · `default_plan` · `trial_days`, `trial_requires_card`, `card_check_amount` (above) · `reserved_subdomains` (≤ 200 of `a-z0-9-`, 1–40 each; added to the built-in list, which can't be removed) · `min_subdomain_length` (3–20)                                             |
| `branding`      | `default_brand_color` (`#RRGGBB`) · `default_data_region` (`US` · `EU` · `APAC`) · `footer_text` (≤ 300). Read-only here: `brand_assets` (see below)                                                                                                                                               |
| `legal`         | `legal_company_name` (≤ 160) · `legal_address` (≤ 300) · `terms_url`, `privacy_url` (https URL or `''`) · `social_links` (≤ 10 https URLs). Platform emails and invoices show them. (Page SEO and analytics belong to the marketing and school sites, not here.)                                   |
| `email`         | `mail_from_name` (1–80) · `mail_from_address` (email) · `mail_reply_to` (email or `''`) · `email_footer` (≤ 500)                                                                                                                                                                                   |
| `security`      | `require_staff_two_factor` · `enforce_sso` · `session_hours` · `idle_lock_minutes` (above) · `console_ip_allowlist` (≤ 50 IPv4/IPv6 addresses or CIDR ranges; **422 when it would lock out the request's own IP**) · `impersonation_requires_reason` (bool) · `impersonation_max_minutes` (15–240) |
| `billing`       | `billing_provider` (below) · `dunning_retries` · `auto_suspend` (above)                                                                                                                                                                                                                            |
| `notifications` | `weekly_digest`, `billing_alerts`, `incident_alerts`                                                                                                                                                                                                                                               |
| `maintenance`   | `maintenance_mode` (bool) · `maintenance_message` (≤ 300, **required when turning maintenance on**) · `maintenance_exempt_tenants` (≤ 100 existing tenant ids)                                                                                                                                     |

Shipped defaults (as `GET /settings/meta` reports them): `platform_name` app name · `support_email`, `mail_from_address`,
`mail_from_name`, `default_plan`, `trial_days`, `idle_lock_minutes`, `dunning_retries`, `auto_suspend` from config ·
`primary_domain` none and `billing_provider` `stripe` (both not resettable → `default: null`) · `default_timezone` `UTC` · `public_signup` `true` ·
`trial_requires_card` `true` · `card_check_amount` `50` ·
`min_subdomain_length` `3` · `default_brand_color` `#4F46E5` · `default_data_region` `US` · `require_staff_two_factor`,
`enforce_sso` `false` · `session_hours` `12` · `impersonation_requires_reason` `true` · `impersonation_max_minutes` `30` ·
notifications `true` · `maintenance_mode` `false` · strings `''` · lists `[]`.

Normalisation: emails and `primary_domain` lowercased, strings trimmed, `default_brand_color` uppercased; list items
trimmed, blanks and duplicates dropped (`reserved_subdomains` lowercased). A list longer than its limit is a 422 on the
field (`console_ip_allowlist: Add up to 50 IP addresses or CIDR ranges, like 203.0.113.0/24.`); an invalid item is a 422 on
`{field}.{index}` with the same message — the UI shows either on the list. Cross-field 422s:
`maintenance_message: Tell tenants what’s happening before turning maintenance on.` and
`console_ip_allowlist: Your own address ({ip}) isn’t on the list — saving it would lock you out.` and, when an operator
without 2FA turns the requirement on,
`require_staff_two_factor: Turn on two-factor authentication for your own account first (Account → Security) — requiring it now would lock you out.`

### `billing_provider`

Where schools check out and pay their subscription (dashboard Plan & billing) — for **new** checkouts only; schools
already subscribed keep theirs until their subscription ends there. Values:

| Value           | Who bills                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `stripe`        | Coursiva charges cards itself (default; always available)                                                   |
| `paddle`        | Paddle Billing, merchant of record: collects the payment, handles sales tax/VAT and issues the invoice      |
| `lemon_squeezy` | Lemon Squeezy, merchant of record — **plans only**: no paid add-ons, bundle, promo codes or overage charges |

- Not resettable: `GET /settings/meta` reports `default: null` and Restore defaults (`POST /settings/sections/{section}/reset` for `billing`)
  leaves it. The shipped value is `stripe`. The screen never counts it as "changed from default".
- `PATCH /settings` with a changed value (in this order):
  - 422 `billing_provider`: `Choose Stripe, Paddle or Lemon Squeezy.` for any other value;
  - 403 `Changing the billing provider needs the billing.manage permission.` (on top of `platform.manage`);
  - 422 `billing_provider`: `Connect Paddle in Platform → Connections first.` / `Connect Lemon Squeezy in Platform → Connections first.`
    while that connection isn't set up (see [platform.md](platform.md#connections)).
- `effect`: `Where schools check out and pay their subscription (dashboard Plan & billing); schools already subscribed keep theirs`.
  Audit label: `billing provider`.
- UI: first field of Billing & dunning, a segmented control (Stripe · Paddle · Lemon Squeezy). It names the providers
  whose connection isn't set up (from `GET /platform/connections`, linking to Connections) but leaves them selectable —
  the 422 above shows on the field. Without `billing.manage` the control is disabled with an explanation.

The same `impersonation_*` settings drive `POST /tenants/{id}/impersonate` (optional `reason`, required while
`impersonation_requires_reason` is on; the session lasts `impersonation_max_minutes`) — see tenants.md.

List fields are sent whole (the new list replaces the old one). Audit (Security) names the changed fields, as above;
turning maintenance on or off is its own entry: `Turned maintenance mode on — tenant dashboards and school sites answer 503` /
`Turned maintenance mode off`.

Switching `maintenance_mode` **on** takes every school offline, so it needs a password confirmed in the last 15 minutes
(`423 password_confirmation_required`, see [auth.md](auth.md)) in both backends; switching it off doesn't. The console
asks for `MAINTENANCE` typed back in a dialog that names how many schools go offline (all schools minus the exempt ones).

### `GET /settings/meta`

`{ data: { fields: [{ key, section, default, effect }] } }`: every field's section, its shipped default (JSON; `null`
when it has none or can't be restored, like `primary_domain`) and **where the value is read** (plain text such as
`Marketing sign-up (POST /signup) and subdomain checks`). The screen uses it for the "changed from default" counts,
Restore defaults and the "Where these values are read" list. Not translated. `key` is the snake_case setting name as a
**value** (`public_signup`); the API client camelises object keys only, so `useSettingsMeta` maps it to the app key.

### `POST /settings/sections/{section}/reset`

Restores the shipped defaults of every field in the section that has one → `{ data: PlatformSettings }`. `404` unknown
section. Audit (Security), only when something changed: `Restored the default {section} settings ({fields})` — `{section}`
is the section key, e.g. `Restored the default signup settings (trial length)`.

### Brand assets

`brand_assets` in `GET /settings`: `[{ slot, url, updated_at }]` for `logo`, `logo_dark`, `favicon`, `og_image`
(`url` null when not uploaded).

- `POST /settings/brand-assets/{slot}` — multipart `file`: PNG, JPEG or WebP, ≤ 2 MB (`favicon` ≤ 512 KB). **SVG is
  refused**: it can carry script, and served from the platform's origin that would be stored XSS against every operator
  and tenant. 422 `file`: `Choose an image to upload.` · `That image is too large (max 2 MB).` (`512 KB` for the favicon) ·
  `Upload a PNG, JPEG or WebP image. SVG isn’t accepted: it can carry script.` Replacing an asset deletes the previous file. → `{ data: BrandAsset[] }`.
  Audit (Security): `Uploaded the platform {slot label}`.
- `DELETE /settings/brand-assets/{slot}` → `{ data: BrandAsset[] }`. Audit: `Removed the platform {slot label}`.

Where the images are read (the help text under each upload says the same — keep them in sync):

| Slot        | Readers                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `logo`      | Console sign-in and lock screens, console sidebar (when there is no `logo_dark`), platform email header, coursiva.com |
| `logo_dark` | Console sidebar (dark in both themes) and the sign-in / lock screens in dark theme; falls back to `logo`              |
| `favicon`   | Console browser tab, coursiva.com                                                                                     |
| `og_image`  | Link previews of coursiva.com pages (`og:image`)                                                                      |

The console reads `logo`, `logo_dark` and `favicon` from the public `GET /platform/branding` ([auth.md](auth.md)); coursiva.com
reads them through the marketing API. After an upload or removal the console updates its cached branding from the
response (the public endpoint is HTTP-cached for 5 minutes, so other browsers and coursiva.com see it within that).

### `POST /settings/email/test`

Sends a test email with the saved email settings to the signed-in staff member → `202 { data: { sent_to } }`.
Throttled (5 per 10 minutes → `429`). Audit (Security): `Sent a test platform email to {address}`.

## Integration marketplace

### `GET /settings/integrations`

```json
{
  "data": {
    "live_apps": 54,
    "categories": 20,
    "policies": [],
    "adoption": [{ "name": "Stripe", "category": "Payments", "tenants": 9, "total_tenants": 10, "note": "…" }],
    "requests": [{ "id": "rq_kajabi", "name": "Kajabi import", "requests": 3, "on_roadmap": false }]
  }
}
```

`policies` is always empty: the old `byo_processor`, `hris_scale_only`, `proctoring` and `self_hosted` policies were folded into
[feature availability](platform.md#feature-availability) (`pay_stripe`, `sso`, `exams`; `self_hosted` enforced nothing and is gone).
Adoption counts are computed from tenant connections.

### `POST /settings/integrations/requests/{id}/roadmap`

Marks a tenant request as on the roadmap (requesters are notified on launch) → `{ data: IntegrationSettings }`.
Audit (Security): `Added "{name}" to the integration roadmap`.

## Tax & invoicing

### `GET /settings/tax`

`{ data: { stripe_tax, tax_inclusive, invoice_prefix, next_invoice_number, min_next_invoice_number, next_invoice_preview, regions: [{ id, region, kind, rate }] } }`

### `PATCH /settings/tax`

Body: any of `{ stripe_tax, tax_inclusive, invoice_prefix, next_invoice_number }` → `{ data: TaxSettings }`.
422: `invoice_prefix` (1–8 of `A–Z 0–9 -`), `next_invoice_number` (integer ≤ 999999 and **greater than the last issued number** —
numbering is sequential and gap-free), `stripe_tax`, `tax_inclusive`.
Audit (Billing): `Updated tax & invoicing: Stripe Tax off, invoice numbering → CV-020300`.

### `DELETE /settings/tax/regions/{id}`

`204`. Checkout stops collecting tax there. Audit (Billing): `Removed tax registration for {region} — checkout stops collecting {kind}`.

### `idle_lock_minutes`

One of `5, 10, 15, 30, 60` (default `15`); `422 errors.idle_lock_minutes` = `Choose an idle lock of 5, 10, 15, 30 or 60 minutes.`
Reported to every staff user in `GET /auth/me` → `idle_lock_minutes`. Distinct from `session_hours` (absolute
session lifetime).
