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

| Field                                                | Rule                                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `support_email`                                      | email                                                                                                                                        |
| `primary_domain`                                     | hostname, **must be a verified platform domain** (`coursiva.io`, `coursiva.com`, `coursiva.app`) — new tenants get `{slug}.{primary_domain}` |
| `trial_days`                                         | integer 7–60 — trial length for new tenants                                                                                                  |
| `default_plan`                                       | `Launch` · `Growth` · `Scale`                                                                                                                |
| `dunning_retries`                                    | integer 1–5 — failed-payment retries before suspension                                                                                       |
| `auto_suspend`                                       | bool                                                                                                                                         |
| `require_staff_two_factor`                           | bool                                                                                                                                         |
| `enforce_sso`                                        | bool                                                                                                                                         |
| `session_hours`                                      | `4` · `8` · `12` · `24`                                                                                                                      |
| `weekly_digest`, `billing_alerts`, `incident_alerts` | bool                                                                                                                                         |

### `PATCH /settings`

Body: any subset of the fields above (the client sends only changed fields). → `{ data: PlatformSettings }`.

422 per field, e.g. `trial_days: The trial length must be between 7 and 60 days.`,
`primary_domain: coursiva.dev isn’t a verified platform domain. Verify its DNS first (…)`. The UI shows them inline.

Audit (Security), listing the fields that actually changed: `Updated platform settings: trial length, SSO enforcement`.

## Integration marketplace

### `GET /settings/integrations`

```json
{
  "data": {
    "live_apps": 54,
    "categories": 20,
    "policies": [{ "key": "byo_processor", "label": "…", "description": "…", "enabled": false }],
    "adoption": [{ "name": "Stripe", "category": "Payments", "tenants": 9, "total_tenants": 10, "note": "…" }],
    "requests": [{ "id": "rq_kajabi", "name": "Kajabi import", "requests": 3, "on_roadmap": false }]
  }
}
```

Policy keys: `byo_processor`, `hris_scale_only`, `proctoring`, `self_hosted`. Adoption counts are computed from tenant connections.

### `PUT /settings/integrations/policies/{key}`

Body `{ enabled: bool }` → `{ data: IntegrationSettings }`. 404 unknown key, 422 `enabled`.
Audit (Security): `Enabled/Disabled integration policy "{label}"`.

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
