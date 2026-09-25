# Auth

Types: `src/features/auth/types.ts` · Mock: `src/features/auth/mock.ts`

## `GET /auth/me`

Signed-in staff user. `401` when signed out.

```json
{
  "data": {
    "id": "st_sam",
    "name": "Sam Ortega",
    "email": "sam@coursiva.io",
    "role": "Owner",
    "two_factor_enabled": true,
    "permissions": ["tenants.view", "tenants.manage", "…"]
  }
}
```

## `POST /auth/login`

Body: `{ "email", "password", "remember" }`

- `200 { "data": { "two_factor_required": true, "user": null } }` — password OK, 2FA pending (session holds the pending user).
- `200 { "data": { "two_factor_required": false, "user": { … } } }` — signed in.
- `422` `errors.email`: `These credentials do not match our records.` · suspended account · invite not accepted.

Rate-limit (e.g. 5/min per email+IP). Audit: `Signed in to the platform console` (Auth).

## `POST /auth/two-factor-challenge`

Body: `{ "code": "123456" }` (TOTP; recovery codes may also be accepted).

- `200 { "data": User }`
- `422 errors.code` for a wrong code · `419` if there is no pending login.

Audit: `Signed in to the platform console (2FA)` (Auth).

## `POST /auth/logout`

`204`. Audit: `Signed out` (Auth).
