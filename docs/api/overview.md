# Overview (dashboard)

Types: `src/features/overview/types.ts` · Mock: `src/features/overview/mock.ts`

## `GET /overview?range=30d|90d|12mo`

Permission: signed in. Numbers only — the client builds labels and colour bands.

```json
{
  "data": {
    "range": "30d",
    "mrr": { "value": 4491, "delta_pct": 9.6 },
    "tenants": { "value": 10, "delta": 1 },
    "students": { "value": 19610, "delta": 1204 },
    "revenue_churn": { "value_pct": 1.8, "delta_pts": -0.4 },
    "mrr_series": [{ "month": "2025-10-01", "mrr": 2780 }],
    "plan_distribution": [{ "plan": "Launch", "tenants": 3, "mrr": 198 }],
    "queue": {
      "dunning": { "count": 1, "amount": 99 },
      "tickets": { "high": 1, "open": 3 },
      "trials": { "count": 1, "names": ["Ledger Finance Academy"] },
      "overages": { "count": 4, "amount": 210 },
      "privacy": { "due_soon": 3, "overdue": 1, "soonest_days": 4 }
    },
    "mrr_at_risk": { "amount": 99, "tenants": 1 },
    "entitlement_overrides": 0,
    "watchlist": [
      { "tenant_id": "tn_bloom", "name": "Bloom Floristry Courses", "health": "At risk", "reason": "Payment failing · 2 retries left" }
    ]
  }
}
```

Business rules (must match `/tenants`):

- **MRR** = sum of each tenant's locked-in monthly price, excluding `Trial` and `Suspended` tenants.
- `mrr_series`: 12 months, oldest first, `month` = first day of month.
- `mrr_at_risk`: tenants whose health is `At risk` or status is `Past due`.
- `privacy.due_soon`: unfulfilled DSARs due within 10 days; `overdue` ≤ 0 days; `soonest_days` smallest positive.
