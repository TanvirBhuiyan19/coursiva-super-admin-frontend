# Video & storage

Types: `src/features/media/types.ts` · Mock: `src/features/media/mock.ts` · Tests: `src/features/media/media.test.tsx`

Platform-wide live-room policy, video DRM and the storage/delivery pipeline.

Permission: reads `platform.view`, writes `platform.manage`.

## Credentials (DRM providers, storage backends)

Provider and backend credentials are encrypted with the platform KMS and **never returned**. Every GET returns, per field:

`CredentialField`: `key, label, secret, configured, last4, value` — `value` is the full stored value for non-secret fields
(account id, username, region, URLs) and always `null` for secrets.

`Connection`: `key, name, description, role (storage only, e.g. "Hot delivery"), connected, verified_at, fields[]`.

Writes send new values as an array — `{ credentials: [{ field: "token_secret", value: "…" }] }`. Omitted or blank fields keep their stored
value, so an operator can replace one secret without re-entering the others. After merging, every field must be set.

## Live rooms

### `GET /media/live-rooms`

```
{ data: {
    policies: [{ key, label, description, enabled }],     // byo_providers, built_in_rooms, pull_recordings, fallback_to_built_in
    allowances: [{ plan, minutes }],                       // built-in room minutes / month; 0 = BYO provider only
    overage_rate,                                          // USD per participant-minute above the allowance
    top_up: { minutes, price },
    usage: [{ tenant_id, name, plan, used_minutes, allowance_minutes, status: within|over|byo }]
} }
```

`allowance_minutes` is the tenant's **effective** limit (plan allowance, or the tenant's `live_room_minutes` override).

### `PATCH /media/live-rooms`

Body any of `{ policies: [{ key, enabled }], allowances: [{ plan, minutes }] }` → `{ data: LiveRoomSettings }`.

| Field                           | Rule (422 message)                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `policies.{i}.key` / `.enabled` | known key / boolean                                                                                      |
| `allowances.{i}.plan`           | `Launch` · `Growth` · `Scale`                                                                            |
| `allowances.{i}.minutes`        | whole number 0–1,000,000 — "Minutes must be a whole number from 0 to 1,000,000 (0 = BYO provider only)." |

**Allowances are owned here**: they are the plan default for every tenant's `live_room_minutes` limit
(`GET /tenants/{id}` `limits`, `GET /entitlements/limits`).

Audit: `Set {plan} built-in room allowance to {n} min/mo` · `Turned off built-in rooms for {plan} (BYO provider only)` (Billing) ·
`Turned on|off live-room policy "{label}"` (Flags).

## DRM

### `GET /media/drm`

`{ data: { stats: [{ label, value }], protections: [{ key, label, description, enabled, locked }], security_level, watermark_style, device_leases, available_on, providers: Connection[], keys_rotated_at } }`

| Field               | Values                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `protections[].key` | `encryption` (locked, always on) · `hardware_drm` · `watermark` · `block_capture` · `geo_restrictions` |
| `security_level`    | `widevine_l3_fairplay` · `widevine_l1` · `clearkey`                                                    |
| `watermark_style`   | `email` · `email_ip` · `forensic`                                                                      |
| `available_on`      | `all` · `growth` · `scale`                                                                             |
| `providers[].key`   | `mux` · `ezdrm` · `keyos`                                                                              |

### `PATCH /media/drm`

Body any of `{ protections: [{ key, enabled }], security_level, watermark_style, device_leases, available_on }` → `{ data: DrmSettings }`.
422: unknown enum values; `device_leases` whole number 1–20; turning off a locked protection — "AES-128 stream encryption can’t be turned off."

Audit (Security): `{protection} enabled|disabled platform-wide` · `DRM security level set to {label}` · `Watermark style set to {label}` ·
`Concurrent device leases set to {n}` · `DRM made available on {label}`.

### `PUT /media/drm/providers/{key}` — connect & verify / replace credentials

Body `{ credentials: [{ field, value }] }` → `{ data: Connection }`. 404 `DRM provider not found.`
422 per field, e.g. `credentials.password`: "Enter the Password." (max 500 characters).
Audit (Security): `Connected DRM provider {name}` · `Updated credentials for DRM provider {name}`.

### `DELETE /media/drm/providers/{key}`

Deletes the stored credentials → `{ data: Connection }` (`connected: false`). Playback falls back to AES-128 only.
Audit (Security): `Disconnected DRM provider {name}`.

### `POST /media/drm/rotate-keys`

Rotates the license signing keys → `{ data: DrmSettings }` with a new `keys_rotated_at`. Forces re-licensing on next play; the console asks for confirmation.
Audit (Security): `Rotated DRM license signing keys`.

## Storage & delivery

### `GET /media/storage`

`{ data: { stats, backends: Connection[], pipeline: [{ step, description, healthy }], archive_after_days, rendition_ladder, direct_uploads, footprint: [{ tenant_id, name, storage_tb, bandwidth_tb }] } }`

`backends[].key`: `r2` (hot delivery) · `s3` (archive masters). `rendition_ladder`: `standard` · `uhd` · `budget`.
The last `footprint` row has `tenant_id: null` and aggregates every other tenant.

### `PATCH /media/storage`

Body any of `{ archive_after_days: 1–3650, rendition_ladder, direct_uploads: bool }` → `{ data: StorageSettings }`.
Audit (Security): `Masters now archive to Glacier Deep Archive after {n} days` · `Rendition ladder set to {label}` · `Enabled|Disabled direct-to-bucket uploads`.

### `PUT /media/storage/backends/{key}` · `DELETE /media/storage/backends/{key}`

Same contract as DRM providers. 404 `Storage backend not found.`
Audit (Security): `Connected storage backend {name}` · `Updated credentials for storage backend {name}` · `Disconnected storage backend {name}`.
