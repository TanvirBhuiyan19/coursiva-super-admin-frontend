# Analytics (Growth · Usage · Health · AI · Experiments)

Types: `src/features/analytics/types.ts` · Mock: `src/features/analytics/mock.ts` · Tests: `src/features/analytics/analytics.test.tsx`

One read endpoint per screen. They return **numbers only**: the client adds labels, colour bands and chart geometry.
Anything derived from tenants is computed server-side from the `tenants` table with the rules in `src/mocks/derive.ts`,
so it always matches `/tenants` and `/overview`.

Every `GET` requires `analytics.view`. Mutations list their own permission.

## `GET /analytics/growth`

```json
{
  "data": {
    "kpis": {
      "revenue_per_tenant": 499,
      "paying_tenants": 9,
      "trial_conversion_pct": 38,
      "trial_conversion_delta_pts": 4,
      "net_revenue_retention_pct": 112,
      "net_revenue_retention_delta_pts": 3,
      "nps": 54,
      "nps_delta": 6,
      "logo_churn_pct": 2.1,
      "logo_churn_delta_pts": -0.4
    },
    "funnel": [
      { "stage": "visitors", "count": 325, "rate_pct": null },
      { "stage": "signups", "count": 13, "rate_pct": 4 }
    ],
    "cohorts": [{ "month": "2026-03-01", "retention": [100, 68, 54, 47, 43, 41] }],
    "health_scores": [{ "tenant_id": "tn_silva", "name": "Silva Culinary Arts", "score": 92, "driver": "All signals healthy" }],
    "onboarding": [{ "stage": "provisioned", "tenants": 10 }],
    "stuck": [{ "tenant_id": "tn_ledger", "name": "Ledger Finance Academy", "stage": "first_sale", "days": 19 }],
    "total_tenants": 10
  }
}
```

Rules:

- `revenue_per_tenant` = paying MRR ÷ paying tenants (a tenant pays when `tenantMrr > 0`: not `Trial`/`Suspended`). Same as `/tenants/summary` `arpa`.
- Deltas are vs the previous quarter. `logo_churn_delta_pts` is better when negative.
- `funnel.stage`: `visitors · signups · activated · trials · converted`, in order. `converted` = tenants created in the last 90 days (min 1);
  `trials` = converted + current trials + 2; upstream stages are scaled with benchmark rates (53 % activated→trial, 62 % signup→activated,
  4 % visitor→signup). `rate_pct` = share of the previous stage, one decimal. The UI draws bars on a log scale.
- `cohorts`: the last six signup months, oldest first; `retention[i]` = % of that cohort still active _i_ months after signup.
- `health_scores`: every tenant, best first. `score` is the same score as `GET /tenants/{id}` `health_score.score`.
- `onboarding.stage`: `provisioned · branding · first_course · first_sale · paid`. The `paid` stage equals paying tenants; earlier stages
  interpolate up to all tenants. `stuck` lists the tenants that fall out between stages (trials first, then fewest students).

## `GET /analytics/usage`

```json
{
  "data": {
    "period": "2026-09-01",
    "capacity": [{ "meter": "storage", "used": 62400, "capacity": 100000, "used_pct": 62, "near_limit": false }],
    "top_consumers": [
      {
        "tenant_id": "tn_peak",
        "name": "Peak Fitness Cert Co",
        "storage_gb": 18200,
        "bandwidth_gb": 41000,
        "video_minutes": 640000,
        "api_requests": 21000000,
        "share_pct": 29,
        "overage": { "meter": "SMS credits", "amount": 63 }
      }
    ]
  }
}
```

- `meter`: `storage` (GB, point in time) · `bandwidth` (GB this month) · `transcode` (minutes this month) · `api_requests` (this month).
- `capacity[].used` = sum of every tenant's usage. `near_limit` when `used_pct ≥ 80`.
- `top_consumers`: top 5 by `share_pct` = mean of the tenant's share of each of the four meters.
  `overage` is the tenant's first **unbilled** overage (same table as Revenue), else `null`.

## System health

### `GET /analytics/health`

```json
{
  "data": {
    "services": [{ "id": "email", "name": "Email delivery", "status": "Degraded", "uptime_pct": 99.72, "p95_ms": null, "note": "…" }],
    "queues": [{ "name": "emails", "depth": 148, "failed": 23 }],
    "deliverability": { "delivered_pct": 99.21, "soft_bounce_pct": 0.62, "hard_bounce_pct": 0.14, "complaint_pct": 0.03 }
  }
}
```

`status`: `Operational · Degraded · Outage`. Uptime is over 90 days; deliverability over 7 days.
The platform incident banner is **not** part of this resource. The page reads `GET /status` (shell), which is already cached.

### `POST /analytics/health/queues/{queue}/retry`

Permission `platform.manage`. Requeues every failed job on the queue: `failed → 0`, `depth += failed`.
→ `{ data: { requeued, queue: { name, depth, failed } } }`. 404 unknown queue · 422 `queue` when there are no failed jobs.
Audit: `Requeued {n} failed jobs on the {queue} queue`, category **Flags**. There is no separate "Operations" category, and Flags is the
category of the Flags & system status screen, which covers platform operations.

## AI usage & cost

### `GET /analytics/ai`

```json
{
  "data": {
    "settings": { "monthly_cap": 2500, "routing_policy": "cost_first" },
    "pricing": { "cost_per_1k": 0.42, "billed_per_1k": 0.6, "allowances": [{ "plan": "Launch", "tokens_k": 150 }] },
    "totals": { "spend": 1598.94, "tokens_k": 3807, "tenants": 7, "throttled": 0, "cap_used_pct": 64 },
    "tenants": [
      {
        "tenant_id": "tn_devpath",
        "name": "DevPath Bootcamp",
        "plan": "Scale",
        "tokens_k": 1980,
        "allowance_k": 1500,
        "cost": 831.6,
        "billed": 288,
        "margin_pct": 30,
        "top_feature": "summaries",
        "throttled": false
      }
    ],
    "by_feature": [{ "feature": "summaries", "cost": 579.6, "share_pct": 36 }]
  }
}
```

Rules (per tenant, this month):

- `allowance_k` comes from the tenant's plan (`pricing.allowances`). `cost = tokens_k × cost_per_1k`.
- `billed = max(0, tokens_k − allowance_k) × billed_per_1k`.
- `margin_pct = (MRR + billed − cost) ÷ (MRR + billed)`, using the tenant's paying MRR (`tenantMrr`). `null` when revenue is 0 (trial or suspended).
- `feature`: `outlines · quizzes · summaries · chat`. `by_feature` splits each tenant's tokens 55 % to their `top_feature` and the rest 20/15/10 %.
- `routing_policy`: `cost_first · balanced · quality_first`.

### `PUT /analytics/ai/settings`

Permission `billing.manage`. Body: any of `{ monthly_cap: int, routing_policy }`. Returns the full `AiUsage`.
422: `monthly_cap` (whole dollars, 100–100,000), `routing_policy` (enum). An empty body is a 422 on `monthly_cap`.
Audit (Billing): `Set the AI monthly cost cap to ${n}` · `Changed AI model routing to {Cost-first|Balanced|Quality-first}`. Only written when the value changes.

### `POST /analytics/ai/tenants/{id}/throttle` · `DELETE /analytics/ai/tenants/{id}/throttle`

Permission `billing.manage`. Routes the tenant to the low-cost model (POST) or restores full speed (DELETE). Idempotent. Returns the full `AiUsage`.
404 when the tenant doesn't exist or has no AI usage.
Audit (Billing, with `tenant_id`): `Throttled {name} to the low-cost AI model` · `Restored full AI speed for {name}`.

## Experiments

### `GET /analytics/experiments`

```json
{
  "data": {
    "kpis": { "running": 4, "significant": 2, "shipped90d": 7, "avg_winning_lift_pct": 33.6 },
    "experiments": [
      {
        "id": "ex_site_builder",
        "name": "New site builder (beta)",
        "surface": "Storefront editor",
        "flag_key": "site_builder_v2",
        "exposed": 4820,
        "control_pct": 9.2,
        "variant_pct": 11.4,
        "lift_pct": 23.9,
        "confidence_pct": 97,
        "significant": true,
        "verdict": "Winning",
        "status": "running",
        "ended_at": null
      }
    ]
  }
}
```

Rules:

- `lift_pct = (variant − control) ÷ control × 100`, one decimal. `significant` when confidence ≥ 95 %.
- `verdict`: `Winning` when confidence ≥ 90 % and lift > 0 · `Losing` when confidence ≥ 90 % and lift < 0 · otherwise `Inconclusive`.
- `status`: `running · shipped · stopped`. The list is ordered running first, then finished (newest first).
- KPIs count **running** experiments. `shipped90d` includes experiments archived before this table existed. `avg_winning_lift_pct` is the
  mean lift of running `Winning` experiments (`null` if none).
- The wire key is `shipped90d` (the case converter does not split digits), and the code uses the same name.

### `POST /analytics/experiments/{id}/promote`

Permission `platform.manage`. Ships the variant to everyone: `status → shipped`, `ended_at → now`. If `flag_key` names a feature flag,
that flag is set to `enabled: true`, `rollout: "All tenants"` and stays, so a rollback is one switch on Flags & status.
The UI asks for confirmation first. Returns the full `Experiments` resource. 404 · 422 `status` unless running.
Audit (Flags): `Promoted experiment "{name}" to 100%`.

### `POST /analytics/experiments/{id}/stop`

Permission `platform.manage`. Ends the experiment and sends all traffic back to control (`status → stopped`). Flags are not changed.
Returns the full `Experiments` resource. 404 · 422 `status` unless running.
Audit (Flags): `Stopped experiment "{name}" — traffic returned to control`.
