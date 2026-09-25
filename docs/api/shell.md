# Shell (console-wide)

Types: `src/features/shell/api.ts` · Mock: `src/features/shell/mock.ts`

| Endpoint                       | Permission | Response                                                                                                                                                                                                                 |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /status`                  | signed in  | `{ data: { operational: bool, incident: { title, posted_at } \| null } }` — header status pill (polled every 60 s).                                                                                                      |
| `GET /badges`                  | signed in  | `{ data: { support: int } }` — open ticket count for the sidebar (polled every 60 s).                                                                                                                                    |
| `GET /notifications`           | signed in  | `{ data: [{ id, text, tone: good\|warn\|bad, created_at, read, href }] }` newest first.                                                                                                                                  |
| `POST /notifications/read-all` | signed in  | `204`                                                                                                                                                                                                                    |
| `GET /search?q=&type=`         | signed in  | `{ data: [{ type: tenant\|invoice\|ticket\|staff, id, label, sublabel, href }] }` max 20. Only include types the user may view (`tenants.view`, `billing.view`, `support.view`, `staff.view`). `href` is a console path. |
