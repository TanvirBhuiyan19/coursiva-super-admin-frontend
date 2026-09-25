# Support

Types: `src/features/support/types.ts` · Mock: `src/features/support/mock.ts` · Tests: `src/features/support/support.test.tsx`

Tickets live in the shared `tickets` table. Ticket ids are opaque strings (`tk_…`); `number` is the human ticket number (`#1041`).
**SLA fields are computed server-side** so the inbox, KPIs and view counts always agree.

## SLA rules

| Priority | First-reply target |
| -------- | ------------------ |
| High     | 60 min             |
| Medium   | 240 min            |
| Low      | 480 min            |

Resolution target: 24 h (1,440 min) from `created_at`. The first reply is the first **public** staff message (internal notes don't count).

| `sla_state` | When                                                | `sla_due_at`         |
| ----------- | --------------------------------------------------- | -------------------- |
| `on_track`  | Open, unanswered, ≥ 60 min left                     | first-reply deadline |
| `at_risk`   | Open, unanswered, < 60 min left                     | first-reply deadline |
| `breached`  | Open, unanswered, deadline passed                   | first-reply deadline |
| `responded` | Open, replied, within resolution target             | resolution deadline  |
| `overdue`   | Open, replied, resolution target passed             | resolution deadline  |
| `paused`    | `Pending` (waiting on the tenant — the clock stops) | `null`               |
| `resolved`  | `Resolved`                                          | `null`               |

## Resources

`Ticket`: `id, number, subject, priority (High|Medium|Low), status (Open|Pending|Resolved), channel (Email|In-app chat), requester_name,
tenant { id, name, plan }, assignee { id, name } | null, tags[], escalated, created_at, updated_at (latest message), first_reply_at,
sla_state, sla_due_at, sla_target_minutes`.

`TicketDetail` = `Ticket` plus:

| Field            | Notes                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages`       | `[{ id, author (tenant\|staff), author_name, body, created_at, internal }]`, oldest first. `internal: true` = staff-only note, **never** exposed to the tenant-facing API.                                                                                                                                                                                                                   |
| `tenant_context` | `{ id, name, plan, status, owner_name, mrr, health, health_reason, signals: [{ label, value, tone }], past_tickets: [{ id \| null, number, subject, status, created_at, csat \| null }] }` — `mrr`/`health` use the same rules as `/tenants`. `past_tickets` (max 5, newest first) includes archived tickets with `id: null` (not openable). `tone` ∈ `good\|warn\|bad\|info\|flat\|accent`. |

Every ticket mutation below returns the updated `{ data: TicketDetail }`.

## Endpoints

### `GET /support/tickets`

Permission `support.view`. Paginated `Ticket[]`. Breached tickets first, then newest first.

| Param              | Values                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `view`             | `open` (default — not Resolved) · `breaching` (`sla_state = breached`) · `unanswered` (not Resolved, no public staff reply) · `pending` · `resolved` · `all` |
| `search`           | subject, requester name, tenant name, ticket number (contains, case-insensitive)                                                                             |
| `page`, `per_page` | standard                                                                                                                                                     |

### `GET /support/summary`

Permission `support.view`.
`{ data: { open, unanswered, breaching, oldest_breach_at, median_first_reply_minutes, csat: { score, responses } | null, views: [{ view, count }] } }`.
`views` covers every value of `view` (unfiltered by search). CSAT is the mean of survey responses over the last 180 days.

### `GET /support/options`

Permission `support.view`. `{ data: { assignees: [{ id, name }], tags: [], canned_replies: [{ id, title, body }] } }`.
`assignees` = staff with status `Active`.

### `GET /support/tickets/{id}`

Permission `support.view`. `TicketDetail`. 404 `Ticket not found.`

### Mutations

| Endpoint                                      | Permission       | Body                                                                                                                                           | Audit (category `Tenants`, with `tenant_id`)                                                                                  |
| --------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /support/tickets/{id}/messages` → `201` | `support.manage` | `{ body, internal }` — 422 `body` (required, max 5,000)                                                                                        | reply: `Replied to ticket #{n} ({tenant})` · note: `Added an internal note to ticket #{n} ({tenant})`                         |
| `PATCH /support/tickets/{id}`                 | `support.manage` | any of `{ assignee_id: string\|null, status, tags: [] }` — 422 `assignee_id` (active staff), `status` (enum), `tags` (from `/support/options`) | assign: `Assigned ticket #{n} to {name}` / `Unassigned ticket #{n}` · status: `Changed ticket #{n} from {a} to {b}` · tags: — |
| `POST /support/tickets/{id}/escalate`         | `support.manage` | — (422 if already escalated; reopens a resolved ticket)                                                                                        | `Escalated ticket #{n} to engineering`                                                                                        |
| `POST /support/tickets/{id}/resolve`          | `support.manage` | — (sets `Resolved` and emails the requester a CSAT survey; 422 if already resolved)                                                            | `Resolved ticket #{n} and sent a CSAT survey to {requester}`                                                                  |

"Snooze" in the UI is `PATCH { status: "Pending" }` (the SLA clock pauses until the ticket is reopened).

Status changes affect `GET /badges` (`support` = tickets not Resolved) and `/overview` ticket counts; the client invalidates both.
