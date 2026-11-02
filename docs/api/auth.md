# Auth

Types: `src/features/auth/types.ts` · Mock: `src/features/auth/mock.ts`

## `GET /platform/branding` (public)

The platform name and brand images for the console shell. **No sign-in needed** — the sign-in screen uses it too.

```json
{
  "data": {
    "name": "Coursiva",
    "logo_url": "https://assets.coursiva.io/platform/brand/logo.png?v=1760774400",
    "logo_dark_url": null,
    "favicon_url": null
  }
}
```

- `name` is the `platform_name` setting; the URLs are absolute (with `?v={unix seconds}`, which changes on every
  replacement: the key itself doesn't), `null` when not uploaded (see Brand assets in [settings.md](settings.md)).
- `Cache-Control: public, max-age=300`. Rate-limit 60/min per IP.
- The client (`useBranding()` in `features/auth/api.ts`) fetches it once, keeps it 5 minutes and never shows an error:
  on failure the built-in "C" mark, the name "Coursiva" and the built-in favicon stay.
- Console use: the sidebar shows `logo_dark_url` (the sidebar is dark in both themes), else `logo_url`; the sign-in and
  lock screens show `logo_dark_url` in dark theme, else `logo_url`. A logo replaces the "C" mark and the name (the logo's
  alt text is `name`). `favicon_url` replaces the `<link rel="icon">` of the page.
- Images are served by the API origin (`https://api.coursiva.io`, allowed in the CSP `img-src` of `deploy/nginx.conf`). If
  storage moves to a CDN, add its origin there too.

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
    "two_factor_setup_required": false,
    "permissions": ["tenants.view", "tenants.manage", "…"],
    "idle_lock_minutes": 15
  }
}
```

`two_factor_setup_required` is true while the platform requires staff 2FA (`require_staff_two_factor`) and this member
has none. The API then answers `403 { code: "two_factor_setup_required" }` on every route except `auth/*`; the console
keeps the member on **Account → Security** (`/account`) until they enrol. A 403 with that code mid-session makes the
console refetch `/auth/me`. An operator without 2FA can't turn the requirement on (settings 422
`require_staff_two_factor`).

## `POST /auth/login`

Body: `{ "email", "password", "remember" }`

- `200 { "data": { "two_factor_required": true, "user": null } }` — password OK, 2FA pending (session holds the pending user).
- `200 { "data": { "two_factor_required": false, "user": { … } } }` — signed in.
- `422` `errors.email`: `These credentials do not match our records.` · suspended account · invite not accepted.

Rate-limited: 5 a minute per email + IP, and per account whatever the IP (20 failures in 15 minutes lock the email's
sign-in): `429` "Too many attempts. Please try again in N seconds.". Audit: `Signed in to the platform console` (Auth).

## `POST /auth/two-factor-challenge`

Body: `{ "code": "123456" }` — the TOTP code, or a single-use recovery code (`xxxxx-xxxxx`, consumed on use).
Wrong codes: 5 a minute per sign-in, and at most 10 an hour per person whatever the session (every two-factor code check counts, enrolment included); beyond that `429 too_many_requests` "Too many attempts. Please try again in N seconds." (`Retry-After`). The account holder gets one "Repeated two-factor failures" email when the hourly lock trips.

- `200 { "data": User }`
- `422 errors.code` for a wrong code · `419` if there is no pending login.

Audit: `Signed in to the platform console (2FA)` (Auth).

`idle_lock_minutes` is the platform idle-lock policy (`platform_settings.idle_lock_minutes`).

## Password confirmation — `POST /auth/confirm-password`

The console locks itself after `idle_lock_minutes` without activity (tracked client-side across tabs; the lock
survives reloads). Unlocking re-confirms the password without starting a new session — Laravel Fortify's
password confirmation (`password.confirm`).

Body: `{ "password": "…" }` → `204` · `422 errors.password` = `The provided password was incorrect.` · `401` if the
session has already expired (the client then shows the login page). Rate-limit like login.
Audit: `Confirmed their password` (Auth).

**Step-up for sensitive changes.** Saving or removing credentials (Connections, DRM providers, storage backends) needs
a password entered in the last 15 minutes (at sign-in or here). Otherwise the API answers
`423 { code: "password_confirmation_required" }`. The client (`lib/api/client.ts`) then opens one password prompt
(`features/auth/PasswordConfirmPrompt.tsx`). After a successful confirmation it retries the request once; if the user
cancels, the original 423 is raised.

The server must still enforce `session_hours` as the absolute session lifetime; the idle lock only protects an
unattended, still-valid session.

## Password reset and staff invitations (public)

Console pages: `/forgot-password` (linked from sign-in) and `/reset-password?token&email[&invite=1]` (the emailed link).

- `POST /auth/forgot-password` `{ email }` → `200 { data: { sent: true }, message: "If an account exists for that email, we sent a link to reset the password." }`
  whether or not the account exists. At most one email a minute per address; suspended accounts get none. Link:
  `{console}/reset-password?token=…&email=…`, single use, 60 minutes. Rate-limited (`throttle:password-reset`, 429).
- `POST /auth/reset-password` `{ email, token, password, password_confirmation }` →
  `200 { data: { reset: true }, message: "Your password has been reset. You can sign in now." }`.
  422 `token`: `This password reset link is invalid or has expired.`; `password`: confirmed, min 8 (production: 10,
  letters + numbers, not in a breach). Audit: `Reset their password` (Security).
- **Invitations** (`POST /staff/invitations`, resend) email `{console}/reset-password?token&email&invite=1`, valid
  7 days. Setting the password activates the invited member (status `Invited` → `Active`). The page shows
  "Accept your invitation" copy for `invite=1`.

## Account security (signed in) — `/account`

Reached from the account menu. Two-factor and recovery-code changes need a password confirmed in the last 15 minutes
(423 → the step-up prompt above, then one retry).

| Endpoint                               | Body → response                                                                         | Errors                                                                  | Audit (Security)                        |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `PUT /auth/password`                   | `{ current_password, password, password_confirmation }` → `{ data: { updated: true } }` | 422 `current_password` "The current password is incorrect.", `password` | `Changed their password`                |
| `POST /auth/two-factor`                | — → `{ data: { secret, otpauth_url } }` (unconfirmed; shown as a QR code + key)         | 409 already on · 423                                                    | —                                       |
| `POST /auth/two-factor/confirm`        | `{ code }` → `{ data: { recovery_codes: [10] } }` (shown once)                          | 422 `code` · 409 "Start two-factor setup first."                        | `Enabled two-factor authentication`     |
| `POST /auth/two-factor/recovery-codes` | — → `{ data: { recovery_codes } }`                                                      | 409 off · 423                                                           | `Regenerated two-factor recovery codes` |
| `DELETE /auth/two-factor`              | — → `204`                                                                               | 423                                                                     | `Disabled two-factor authentication`    |

Changing the password ends every other session of the member; this one stays signed in.

## `POST /auth/logout`

`204`. Audit: `Signed out` (Auth).
