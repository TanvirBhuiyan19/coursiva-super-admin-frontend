# Extensions

Types: `src/features/extensions/types.ts` · Mock: `src/features/extensions/mock.ts` · Tests: `src/features/extensions/extensions.test.tsx`

The paid add-on catalogue. Extension keys are opaque strings (`ai`, `rooms`, …) from the catalogue seeder.
Install counts, MRR and attach rates are **computed server-side** so every screen reports the same numbers.

Permission: reads `billing.view`, writes `billing.manage`.

## Rules (server-side)

- `included_plans` — plans that get the extension free. Defaults come from the catalogue's `free_from` plan (that plan and above);
  once staff set it, the stored list wins. **Plan entitlements and the tenant drawer read the same table**: for an extension with
  `gates_module: true` the tenant module is on for exactly these plans (unless an entitlement override says otherwise).
- `paying_installs = min(installs, tenants whose plan is not in included_plans)`, `free_installs = installs − paying_installs`.
- `mrr = price × paying_installs`. `attach_pct = installs ÷ tenants`.
- Hidden extensions stay installed for existing tenants, can't be added by new ones, and are left out of the summary and bundle comparison.

## `GET /extensions`

Paginated `Extension[]` (the catalogue is small — the console asks for `per_page=100`).

`Extension`: `key, name, category, blurb, module, gates_module, price, status (Live|Beta|Hidden), hidden, included_plans[], installs, paying_installs, free_installs, mrr, attach_pct`.

## `GET /extensions/summary`

`{ data: { mrr, paying_installs, free_installs, tenants, tenants_with_any, attach_pct, avg_per_tenant, trial_conversion_pct, extensions, categories } }`

`tenants_with_any` = tenants that pay for, are comped, or get free by plan at least one visible extension. `avg_per_tenant = mrr ÷ tenants_with_any`.

## `GET /extensions/export`

CSV attachment `extension-revenue.csv` (extension, category, status, price, free on, installs, paying, free, MRR, attach %).
Audit: `Exported extension revenue for {n} extensions` (Billing).

## `GET /extensions/{key}`

`{ data: Extension }`. 404 `Extension not found.`

## `PATCH /extensions/{key}`

Body any of `{ price: int, hidden: bool }` → `{ data: Extension }`.

| Field    | Rule (422 message)                                                           |
| -------- | ---------------------------------------------------------------------------- |
| `price`  | whole number 1–999 — "The price must be a whole number between $1 and $999." |
| `hidden` | boolean                                                                      |

Audit (Billing): `Changed {name} price from ${a} to ${b}/mo` · `Hid {name} from the extension catalogue` · `Published {name} in the extension catalogue`.

## `PUT /extensions/{key}/plans`

Body `{ plans: ["Growth", "Scale"] }` (array; may be empty = paid on every plan) → `{ data: Extension }`.
Duplicates are dropped and the list is stored in plan order. 422 `plans`: "Choose plans from Launch, Growth and Scale."

Side effects: tenant module access and `GET /entitlements` change for gating extensions; tenants on a newly-included plan stop being billed for it.

Audit (Billing), one entry per direction: `{name}: included free on {plans}` · `{name}: now charged on {plans}`.

## Settings

### `GET /extensions/settings`

`{ data: { bundle_price, separate_price, bundle_discount_pct, trial_days (0|7|14|30), rules: [{ key, label, description, enabled }] } }`

`separate_price` is the sum of every visible extension's current price. Rule keys: `self_serve`, `prorate`, `retain_data`, `auto_include_on_upgrade`.

### `PATCH /extensions/settings`

Body any of `{ bundle_price: int, trial_days: 0|7|14|30, rules: [{ key, enabled }] }` → `{ data: ExtensionSettings }`.

| Field                                 | Rule (422 message)                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `bundle_price`                        | whole number 1–9999 — "The bundle price must be a whole number between $1 and $9,999." |
| `trial_days`                          | one of 0, 7, 14, 30 — "Choose no trial, 7, 14 or 30 days."                             |
| `rules.{i}.key` / `rules.{i}.enabled` | known key / boolean                                                                    |

Audit (Billing): `Changed all-access bundle price from ${a} to ${b}/mo` · `Set the extension free trial to {n days|no trial}` ·
`Turned on|off extension selling rule "{label}"`.

## Related

- One-off comps for a single tenant: `POST|DELETE /tenants/{id}/extensions/{key}/comp` ([tenants.md](tenants.md)).
