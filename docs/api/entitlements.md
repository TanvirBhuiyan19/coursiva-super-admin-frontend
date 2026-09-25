# Plan entitlements

Types: `src/features/entitlements/types.ts` · Mock: `src/features/entitlements/mock.ts` · Tests: `src/features/entitlements/entitlements.test.tsx`

Which tenant-dashboard modules each plan unlocks, and the plan default limits. This is the source of truth for what a tenant sees:
turning a module off hides its nav item and blocks its routes for every tenant on that plan.

Permission: reads `platform.view`, writes `platform.manage`.

## Rules (server-side)

For module `m` on plan `p` (see `moduleOnForPlan` in `src/mocks/derive.ts`):

1. Core modules are always on and can't be changed.
2. A plan-level override for `(m, p)` wins.
3. Otherwise, if an extension **gates** the module (`gates_module: true`), the module is on when `p` is in that extension's
   `included_plans` ([extensions.md](extensions.md)).
4. Otherwise the module is on from its tier plan upwards.

`plan_default` is the result of steps 1, 3 and 4 (what the plan gives without an override). Tenant-level overrides
(`PUT /tenants/{id}/modules/{module}`) are applied on top of this per tenant.

Overrides are stored server-side keyed by module and plan, but the API always exchanges **arrays of cells** — never maps keyed by module id.

## `GET /entitlements`

```
{ data: {
    modules: [{ id, label, group, core,
                extension: { key, name, price, gates_module, included_plans[] } | null,
                cells: [{ plan, enabled, plan_default, overridden }] }],   // one cell per plan, plan order
    plans: [{ plan, enabled, total }],                                       // modules on per plan
    override_count
} }
```

## `PUT /entitlements`

Body `{ cells: [{ module_id, plan, enabled }] }` (one or more) → `{ data: EntitlementMatrix }`.
A cell set equal to its plan default removes the override.

| Field                 | Rule (422 message)                                                                    |
| --------------------- | ------------------------------------------------------------------------------------- |
| `cells`               | at least one — "Send at least one module and plan to change."                         |
| `cells.{i}.module_id` | known module — "Unknown module."; not core — "{label} is core — every plan keeps it." |
| `cells.{i}.plan`      | `Launch` · `Growth` · `Scale`                                                         |
| `cells.{i}.enabled`   | boolean                                                                               |

Side effects: every tenant on that plan gets the new module default (tenant detail `modules`); the overview's `entitlement_overrides` count changes.
Audit (Flags), per changed cell: `{module} added to the {plan} plan` · `{module} removed from the {plan} plan`.

## `DELETE /entitlements/overrides`

Removes every plan-level override → `{ data: EntitlementMatrix }`. The console asks for confirmation first.
Audit (Flags): `Reset {n} entitlement override(s) to plan defaults` (only when there were overrides).

## `GET /entitlements/limits`

`{ data: [{ key, values: [{ plan, value }], managed_by: "media" | null }] }` for `storage_gb, staff_seats, api_per_minute, students, courses, live_room_minutes`.
**`0` = unlimited** (for `live_room_minutes`, `0` = built-in rooms off, BYO provider only).
`live_room_minutes` comes from the live-room policy and is edited with `PATCH /media/live-rooms` ([media.md](media.md)).
Every limit can be overridden per tenant with `PUT /tenants/{id}/limits`.
