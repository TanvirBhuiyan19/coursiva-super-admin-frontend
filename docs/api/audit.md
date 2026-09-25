# Audit log

Types: `src/features/audit/types.ts` · Mock: `src/features/audit/mock.ts`

Entries are written by the server as a side effect of other endpoints. There is no create endpoint.

## `GET /audit`

Permission: `audit.view`. Paginated, newest first.
Filters: `search` (actor or action text), `category` (`Tenants|Billing|Flags|Security|Auth`), `tenant_id`.

```json
{ "data": [{ "id": "au_…", "created_at": "…", "actor_id": "st_sam", "actor_name": "Sam Ortega",
  "action": "Suspended Silva Culinary Arts", "category": "Tenants", "tenant_id": "tn_silva", "ip": "203.0.113.10" }],
  "meta": { … } }
```

## `GET /audit/export`

Same filters, no pagination. `text/csv` attachment `audit-log.csv`.
Audit: `Exported {n} audit entries` (Security).

Retention: entries are immutable (append-only table, no update/delete routes). Retention period is a governance setting.
