# Platform staff

Types: `src/features/staff/types.ts` · Mock: `src/features/staff/mock.ts` · Tests: `src/features/staff/staff.test.tsx`

Staff members are the console's login users (the `staff` table used by [`/auth/login`](auth.md)).
Per-member access metadata (tenant scope, elevation, reviews, invites) lives in a `staff_access` table keyed by staff id.

Permissions: every `GET` needs `staff.view`; every write needs `staff.manage`. All audit entries are category **Security**.

**Self-protection:** nobody can change their own role or scope, suspend/reinstate/elevate themselves, sign themselves out of all
sessions, or confirm their own access review (422). **Owner** accounts can't be changed from these endpoints (422).

## Members

### `GET /staff`

Paginated `StaffMember[]`, sorted by role (Owner first) unless `sort` (`name`, `role`, `last_seen_at`, `-…`) is given.

| Param    | Values                                                  |
| -------- | ------------------------------------------------------- |
| `search` | name or email (contains, case-insensitive)              |
| `role`   | `Owner` · `Admin` · `Support` · `Finance` · `Read-only` |
| `status` | `Active` · `Invited` · `Suspended`                      |

`StaffMember`: `id, name, email, role, two_factor_enabled, status, last_seen_at, location, actions_30d, scope (all|assigned|enterprise),
elevated_until (null unless currently elevated), last_reviewed_at, review_due (> 90 days or never), invite_sent_at, is_self`.

The console links to a member with `/staff?member={id}` (global search uses it); the row is highlighted and focused.

### `GET /staff/summary`

`{ data: { total, active, invited, suspended, two_factor_coverage (0–100, excludes invited), without_two_factor: [{ id, name }],
elevated_now, impersonations_7d, reviews_due, require_staff_two_factor } }` — `require_staff_two_factor` mirrors
[`/settings`](settings.md) so the 2FA warning can say what happens next.

### `GET /staff/activity`

Paginated recent audit entries whose actor is a staff member (System entries excluded):
`[{ id, created_at, actor_id, actor_name, action, category }]`. Needs only `staff.view` (not `audit.view`).

### `POST /staff/invitations`

Body `{ email, role }` → `201 { data: StaffMember }` with `status: "Invited"`. The invitee can't sign in until they accept
(`/auth/login` returns 422). Name is derived from the email until the invite is accepted.
422: `email` (`Enter a valid work email address.` · `{email} is already on the platform team.`),
`role` (`Admin`, `Support`, `Finance` or `Read-only` — Owner is not assignable).
Audit: `Invited {email} to the platform team as {role}`.

### `PATCH /staff/{id}`

Body: any of `{ role, scope }` → `{ data: StaffMember }`.
422 `role` (own role, Owner target, not assignable) · `scope` (own scope, Owner target, invalid).
Audit: `Changed {name}’s staff role from {a} to {b}` · `Scoped {name} to {scope}`.

### Member actions

Each returns `{ data: StaffMember }`; failures are `422 { errors: { staff: [...] } }`.

| Endpoint                           | Allowed when                                                                            | Audit                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `POST /staff/{id}/suspend`         | target Active, not self, not Owner. Revokes sessions and elevation; sign-in is blocked. | `Suspended staff member {name} — sessions revoked`           |
| `POST /staff/{id}/reinstate`       | target Suspended                                                                        | `Reinstated staff member {name}`                             |
| `POST /staff/{id}/resend-invite`   | target Invited                                                                          | `Re-sent the staff invite to {email}`                        |
| `POST /staff/{id}/revoke-sessions` | target Active, not self                                                                 | `Signed {name} out of all sessions`                          |
| `POST /staff/{id}/elevate`         | body `{ minutes: 15–240 }` (default 60); target Active, not self, not Owner             | `Elevated {name} to Owner for {n} minutes (just-in-time)`    |
| `DELETE /staff/{id}/elevation`     | —                                                                                       | `Revoked just-in-time Owner elevation for {name}`            |
| `POST /staff/{id}/review`          | target not Invited, not self                                                            | `Confirmed {name}’s access ({role}) in the quarterly review` |

Elevation expires on its own at `elevated_until`. **Backend note:** effective permissions (`/auth/me` and every `authorize()`)
must treat an elevated member as Owner until then — see the handover notes; the mock records elevation but does not yet grant it.

## Role permissions

### `GET /staff/roles`

`{ data: [{ role, permissions: [], locked, members }] }` for every role. Owner is `locked` and always has every permission.
`members` counts non-suspended staff in the role. Permission keys and labels: `src/features/auth/permissions.ts`.

### `PUT /staff/roles/{role}`

`role` is the role name, URL-encoded (e.g. `Read-only`). Body `{ permissions: [] }` replaces the role's list → `{ data: RolePermissions[] }`.
422 `permissions`: Owner is locked · unknown permission · removing `staff.manage` from **your own** role.
Changes apply to every member of the role on their next request; the client refetches `/auth/me`.
Audit, one entry per change: `Granted “{label}” to the {role} role` · `Removed “{label}” from the {role} role`.
