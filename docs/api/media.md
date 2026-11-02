# Video & storage

Types: `src/features/media/types.ts` · Mock: `src/features/media/mock.ts` · Tests: `src/features/media/media.test.tsx`

Platform-wide live-room policy, video DRM and the storage/delivery pipeline.

Permission: reads `platform.view`, writes `platform.manage`.

## Credentials (DRM providers, storage backends)

Provider and backend credentials are encrypted with the platform KMS and **never returned**. Every GET returns, per field:

`CredentialField`: `key, label, secret, configured, last4, value, options, default` — `value` is the full stored value for non-secret fields
(account id, username, region, URLs) and always `null` for secrets. `options` (`[{ value, label }]` or null) is a fixed
choice shown as a switch; `default` is the value in effect while none is stored.

`Connection`: `key, name, description, role (storage only, e.g. "Hot delivery"), connected, verified_at, fields[]`.

Writes send new values as an array — `{ credentials: [{ field: "token_secret", value: "…" }] }`. Omitted or blank fields keep their stored
value, so an operator can replace one secret without re-entering the others. After merging, every field must be set.
The server verifies the credentials with the provider before saving (422 `credentials` with the provider's message, shown on the card).
`last4` is sent only for stored values of 12+ characters. Writes need a password confirmed in the last 15 minutes (423, see [auth.md](auth.md)).
Storage backends also take a `bucket` (non-secret) field. The same model serves Stripe, Cloudflare, email and OAuth apps on the
Connections screen ([platform.md](platform.md#connections)).

## Live rooms

### `GET /media/live-rooms`

```
{ data: {
    policies: [{ key, label, description, enabled }],     // pull_recordings, fallback_to_built_in
    allowances: [{ plan, minutes }],                       // built-in room minutes / month; 0 = BYO provider only
    overage_rate,                                          // USD per participant-minute above the allowance
    top_up: { minutes, price },
    usage: [{ tenant_id, name, plan, used_minutes, allowance_minutes, status: within|over|byo }]
} }
```

Whether schools get built-in rooms or Zoom / Meet / Teams at all is a [feature availability](platform.md#feature-availability)
switch (`live_rooms`, `live_zoom`, `live_meet`, `live_teams`); the old `built_in_rooms` / `byo_providers` policies are gone
(a `PATCH` naming them answers 422).

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
422 per field, e.g. `credentials.password`: "Enter the Password." Each value is one line of at most 500 characters (`signing_private_key`: 8,192) — "The {label} must be a single line of at most {n} characters."
Audit (Security): `Connected DRM provider {name}` · `Updated credentials for DRM provider {name}`.

Provider fields (`secret` fields are write-only; optional fields may stay blank):

| Provider | Field                                         | Label                                         | Secret   | Required | Format check (422 message)                                                                                                                                                                            |
| -------- | --------------------------------------------- | --------------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mux`    | `token_id`                                    | Token ID                                      | yes      | yes      |                                                                                                                                                                                                       |
| `mux`    | `token_secret`                                | Token secret                                  | yes      | yes      |                                                                                                                                                                                                       |
| `mux`    | `signing_key_id`                              | Signing key ID                                | yes      | yes      | 8–128 letters/digits — "The signing key ID is letters and digits only."                                                                                                                               |
| `mux`    | `signing_private_key`                         | Signing private key (base64, as Mux shows it) | yes      | yes      | one line of up to 8,192 characters (other fields: 500); an RSA private key, base64 of the PEM (a pasted PEM also works) — "Paste the base64 private key Mux showed when the signing key was created." |
| `mux`    | `webhook_secret`                              | Webhook signing secret                        | yes      | no       |                                                                                                                                                                                                       |
| `mux`    | `drm_configuration_id`                        | DRM configuration ID                          | no       | no       | 8–128 letters/digits — "The DRM configuration ID is letters and digits only (Mux → Settings → Digital Rights Management)."                                                                            |
| `ezdrm`  | `username` · `password` · `fairplay_cert_url` | Username · Password · FairPlay cert URL       | password | yes      |                                                                                                                                                                                                       |
| `keyos`  | `api_key` · `server_key`                      | API key · Server key                          | yes      | yes      |                                                                                                                                                                                                       |

Mux is verified by reading the signing key with the token (`GET https://api.mux.com/video/v1/signing-keys/{signing_key_id}`).
It drives transcoding (backend `docs/storage-and-media.md` → "Transcoding (Mux)"): the private key signs every playback
URL (without a usable key transcoding stays off and video plays from its source file); the webhook signing secret is the
secret of the Mux webhook endpoint `{API}/api/v1/webhooks/mux`, subscribed to `video.asset.*` (without it every
delivery is refused and polling settles transcodes); the DRM configuration ID turns on Mux DRM.

### `DELETE /media/drm/providers/{key}`

Deletes the stored credentials → `{ data: Connection }` (`connected: false`). Playback falls back to AES-128 only.
Audit (Security): `Disconnected DRM provider {name}`.

### `POST /media/drm/rotate-keys`

Rotates the license signing keys → `{ data: DrmSettings }` with a new `keys_rotated_at`. Forces re-licensing on next play; the console asks for confirmation.
Audit (Security): `Rotated DRM license signing keys`.

## Storage & delivery

### `GET /media/storage`

`{ data: { stats, backends: Connection[], pipeline: [{ step, description, healthy }], archive_after_days, rendition_ladder, direct_uploads, footprint: [{ tenant_id, name, storage_tb, bandwidth_tb }] } }`

`backends[].key`: `r2` (hot delivery) · `s3` (archive masters) · `public_assets` (public images). `rendition_ladder`: `standard` · `uhd` · `budget`.

**`public_assets`** (role "Public images") is the bucket public images are served from: school logos, course covers,
product thumbnails and the platform's brand images (browsers and mail clients load them directly). Until it is
connected the backend falls back to its environment disk (`BRAND_ASSETS_DISK`). Fields:

| Field                                | Kind               | Notes                                                                                                                       |
| ------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `provider`                           | switch (`options`) | `r2` (Cloudflare R2, default) · `s3` (AWS S3)                                                                               |
| `account_id`                         | text, optional     | R2 account ID (32 hex) — required when `provider` is `r2` (422 `credentials.account_id`: `Enter the Account ID (R2).`)      |
| `region`                             | text, optional     | S3 region, e.g. `eu-west-1` — required when `provider` is `s3` (422 `credentials.region`)                                   |
| `access_key_id`, `secret_access_key` | secret             |                                                                                                                             |
| `bucket`                             | text               |                                                                                                                             |
| `public_url`                         | text               | The https base URL serving the bucket (R2 custom domain or CDN), no query or fragment; image URLs are `{public_url}/{path}` |
| `acl`                                | switch (`options`) | `none` (default: R2 and ACL-disabled S3; the bucket policy / custom domain makes files readable) · `public-read`            |

Verification writes a small probe file, reads it back, fetches it through `public_url` (must answer 200 with the same
bytes) and deletes it; a refusal is a 422 on `credentials` naming what to fix (e.g. the URL doesn't serve the bucket,
the bucket refuses ACLs, the key can't delete).
The last `footprint` row has `tenant_id: null` and aggregates every other tenant.

### `PATCH /media/storage`

Body any of `{ archive_after_days: 1–3650, rendition_ladder, direct_uploads: bool }` → `{ data: StorageSettings }`.
Audit (Security): `Masters now archive to Glacier Deep Archive after {n} days` · `Rendition ladder set to {label}` · `Enabled|Disabled direct-to-bucket uploads`.

### `PUT /media/storage/backends/{key}` · `DELETE /media/storage/backends/{key}`

Same contract as DRM providers. 404 `Storage backend not found.`
Audit (Security): `Connected storage backend {name}` · `Updated credentials for storage backend {name}` · `Disconnected storage backend {name}`.
