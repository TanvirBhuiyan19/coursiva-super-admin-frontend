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
    "permissions": ["tenants.view", "tenants.manage", "…"],
    "idle_lock_minutes": 15
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

`idle_lock_minutes` is the platform idle-lock policy (`platform_settings.idle_lock_minutes`).

## Idle lock — `POST /auth/confirm-password`

The console locks itself after `idle_lock_minutes` without activity (tracked client-side across tabs; the lock
survives reloads). Unlocking re-confirms the password without starting a new session — Laravel Fortify's
password confirmation (`password.confirm`).

Body: `{ "password": "…" }` → `204` · `422 errors.password` = `The provided password was incorrect.` · `401` if the
session has already expired (the client then shows the login page). Rate-limit like login.
Audit: `Unlocked the console after an idle lock` (Auth).

The server must still enforce `session_hours` as the absolute session lifetime; the idle lock only protects an
unattended, still-valid session.

## `POST /auth/logout`

`204`. Audit: `Signed out` (Auth).
