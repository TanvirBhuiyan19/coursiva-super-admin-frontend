# Announcements

Types: `src/features/announcements/types.ts` · Mock: `src/features/announcements/mock.ts` · Tests: `src/features/announcements/announcements.test.tsx`

Platform broadcasts to tenant admins. Every endpoint requires `announcements.send`.

`Announcement`: `id, message, audience, channel, recipients, sent_at, sent_by`.

| Field        | Values                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `audience`   | `All tenants` · `Launch plan` · `Growth plan` · `Scale plan`; in the list also `Growth & Scale` · `Trials only` (broadcast banners from `POST /platform/broadcasts` are stored here) |
| `channel`    | `Banner` (tenant-admin banner) · `Email` (tenant owners) · `In-app` (tenant-admin notification centre)                                                                               |
| `recipients` | Tenants reached at send time: every tenant that isn't `Suspended`, narrowed to the plan for plan audiences                                                                           |

## `GET /announcements`

Paginated `Announcement[]`, newest first (`page`, `per_page`).

## `GET /announcements/audiences`

`{ data: [{ audience, tenants }] }` — current reach per audience (shown under the audience picker).

## `POST /announcements`

Body `{ message, audience, channel }` → `201 { data: Announcement }`. Sends immediately.

Needs a password confirmed in the last 15 minutes (`423 password_confirmation_required`, see [auth.md](auth.md)): one send reaches every school in the audience and email can't be recalled. The console asks
for `SEND` typed back in a dialog that names the reach (from `GET /announcements/audiences`) and the channel first.

422: `message` (required, max 500 characters after trimming), `audience` (enum), `channel` (enum).

Audit: `Broadcast to {audience}: "{message}"` (Tenants).
