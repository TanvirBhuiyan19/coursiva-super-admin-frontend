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
      "nps": null,
      "nps_delta": null,
      "logo_churn_pct": 2.1,
      "logo_churn_delta_pts": -0.4
    },
    "funnel": [
      { "stage": "visitors", "count": null, "rate_pct": null },
      { "stage": "signups", "count": 13, "rate_pct": null },
      { "stage": "activated", "count": 6, "rate_pct": 46.2 }
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
- `nps` / `nps_delta` are **null** (not tracked): Coursiva runs no NPS survey of its schools, so the UI shows "Not
  tracked", never a number.
- `funnel.stage`: `visitors · signups · activated · trials · converted`, in order, over the schools that **signed up in the last
  90 days**; every count is real, never estimated. `signups` = schools created; `activated` = published a course (the activation
  definition, `tenant_metrics`); `trials` = started a free trial (`subscriptions.trial_ends_at`); `converted` = has a paid, non-zero
  Coursiva invoice. `visitors` is **`count: null`** (coursiva.com records no visits): the UI shows "Not tracked", never a number.
  `rate_pct` = share of signups, one decimal (null for visitors and signups). The UI draws bars on a log scale.
- `cohorts`: the last six signup months, oldest first; `retention[i]` = % of that cohort still active _i_ months after signup.
- `health_scores`: the **top 10** tenants, best first (score desc, then name). `score` is the same score as `GET /tenants/{id}`
  `health_score.score`. `total_tenants` says how many are ranked; the whole ranking pages through
  `GET /analytics/growth/health-scores` (the Growth screen's "View all").
- `onboarding.stage`: `provisioned · branding · first_course · first_sale · paid`, over the same 90-day signups (`provisioned` =
  all of them). Facts come from the hourly tenant measurement: `branding` = staff published brand changes
  (`tenant_metrics.branded_at`), `first_course` = a published course, `first_sale` = a paid, non-zero order
  (`tenant_metrics.first_sale_at`), `paid` = a paying subscription. `stuck` lists up to five schools (any age) not yet paying and idle
  at their first unreached stage for 10+ days (trials first, then fewest students).

## `GET /analytics/growth/health-scores`

Permission `analytics.view`. Paginated `HealthScore[]` (`{ tenant_id, name, score, driver }`): every listed (not deleted)
school's health score, ranked and paginated in SQL. `page`, `per_page` (max 100, default 25), `sort` from `score`, `name`
(comma-separated, `-` = descending; default `-score,name`, best first). 422 `sort` for any other field. The Growth
screen keeps the full list's page in `?healthPage=` (open while `?health=all`).

## `GET /analytics/usage`

```json
{
  "data": {
    "period": "2026-09-01",
    "capacity": [
      { "meter": "storage", "used": 62400, "capacity": 100000, "used_pct": 62, "near_limit": false, "updated_at": "2026-09-14T09:15:00Z" }
    ],
    "top_consumers": [
      {
        "tenant_id": "tn_peak",
        "name": "Peak Fitness Cert Co",
        "storage_gb": 18200,
        "bandwidth_gb": 41000,
        "video_minutes": 640000,
        "api_requests": 21000000,
        "video_delivery_minutes": 3840000,
        "share_pct": 29,
        "overage": { "meter": "SMS credits", "amount": 63 }
      }
    ]
  }
}
```

- `meter` (five cards):
  - `storage`: GB, point in time (`tenant_metrics.storage_bytes`, measured hourly);
  - `bandwidth`: GB this month = Cloudflare edge response bytes for the school's hosts, month to date (`usage_records.bandwidth_gb`, a daily
    snapshot: `usage:snapshot-bandwidth` / Go `usage.snapshot_bandwidth`, 06:30 UTC; a failed query keeps the last snapshot);
  - `transcode`: minutes transcoded this month (`video_minutes`, counted once when a Mux transcode turns ready);
  - `api_requests`: school API-key requests this month (`api_requests`: both stacks increment the shared hourly cache counter
    `usage-api:{tenant}:{YmdH}`; the hourly `usage:drain-api` / `usage.drain_api` moves closed hours with an atomic get-and-delete);
  - `video_delivery`: minutes of video Mux delivered to learners this month (`video_delivery_minutes`, daily from Mux delivery usage).
    These meters are **display-only**: none is billed as an overage (billable meters are only `billing.overage`: AI credits, live-room
    minutes, SMS credits).
- `capacity[].used` = sum of every tenant's usage. `near_limit` when `used_pct ≥ 80`. `updated_at`: the newest write of the meter (null
  when never measured); the screen shows it as "Updated …" with one line on each card's source.
- `top_consumers`: top 5 by `share_pct` = mean of the tenant's share of each of the five meters.
  `overage` is the tenant's first **unbilled** overage (same table as Revenue), else `null`.

## `GET /analytics/live`

Analytics → **Live usage** (`/analytics/live`). Query: `period` = `YYYY-MM`, one of the last 12 months (default this
month; `422` otherwise).

```json
{
  "data": {
    "period": "2026-11-01",
    "periods": ["2026-11-01", "2026-10-01"],
    "totals": {
      "room_minutes": 18400,
      "sessions": 42,
      "attendees": 960,
      "participant_minutes": 37100,
      "peak_concurrency": 86,
      "schools": 7
    },
    "trend": [{ "period": "2026-06-01", "room_minutes": 9100, "sessions": 20, "attendees": 410 }],
    "daily": [{ "date": "2026-11-01", "sessions": 3, "peak_concurrency": 40 }],
    "tenants": [
      {
        "tenant_id": "tn_amplify",
        "name": "Amplify Coaching",
        "room_minutes": 5200,
        "allowance": 10000,
        "used_pct": 52,
        "sessions": 12,
        "attendees": 300,
        "participant_minutes": 11000,
        "peak_concurrency": 86
      }
    ]
  }
}
```

- `room_minutes`: the `live_room_minutes` billing meter (participant-minutes in built-in rooms, learners and hosts);
  `allowance` is the plan's included minutes (0 = none, then `used_pct` is `null`).
- `sessions`, `attendees`, `participant_minutes`, `peak_concurrency` (most learners in one school's rooms in one minute)
  come from the schools' daily live rollup, measured hourly.
- `trend`: six months ending with `period`; `daily`: each day of the month up to today (sessions, busiest school's
  peak); `tenants`: top 20 by room minutes.

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

`status`: `Operational · Degraded · Outage`. Uptime is over 90 days; deliverability over 7 days. The bounce and
complaint percentages are of the mail sent in those 7 days, counted from the providers' bounce/complaint webhooks
(Postmark, SendGrid — backend docs/communications.md → Bounces and complaints); 0 until any arrive.
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
    "pricing": { "cost_per_1k": 0.42, "billed_per_1k": 0.6, "allowances": [{ "plan": "Launch", "tokens_k": 50 }] },
    "totals": {
      "spend": 1808.94,
      "tokens_k": 4307,
      "tenants": 7,
      "throttled": 0,
      "model_cost": 1335.17,
      "cap_used_pct": 53,
      "cap_reached": false
    },
    "tenants": [
      {
        "tenant_id": "tn_devpath",
        "name": "DevPath Bootcamp",
        "plan": "Scale",
        "tokens_k": 2480,
        "allowance_k": 2000,
        "cost": 1041.6,
        "billed": 288,
        "model_cost": 768.8,
        "margin_pct": 30,
        "top_feature": "summaries",
        "throttled": false
      }
    ],
    "by_feature": [{ "feature": "summaries", "cost": 695.1, "share_pct": 38 }]
  }
}
```

Units: the backend meters AI as **credits** on the school's `ai_credits` meter (1 credit ≈ 1 token-equivalent at
fixed per-task rates), so every `tokens_k` / `allowance_k` / `*_per_1k` here is in **thousands of credits** — the field
names are kept for compatibility. Plan allowances (`pricing.allowances`, the `ai_credits` plan limits): Launch 50,000 ·
Growth 600,000 · Scale 2,000,000 credits (`tokens_k` 50 · 600 · 2,000).

Rules (per tenant, this month):

- `allowance_k` comes from the tenant's plan (`pricing.allowances`). `cost = tokens_k × cost_per_1k`.
- `billed = max(0, tokens_k − allowance_k) × billed_per_1k`.
- `model_cost` is what the model calls **really** cost in USD (the backend sums `cost_micros` of every AI studio
  charge in `ai_usage` this month, ÷ 1,000,000, rounded to cents), shown beside `cost` (the credit cost at
  `cost_per_1k`); `totals.model_cost` is the sum of the tenant rows, rounded to cents. It does not feed `margin_pct`.
  The mock has no per-call rows, so it uses one blended rate: `model_cost = tokens_k × 0.31`
  (`AI_MODEL_COST_PER_1K` in `src/features/analytics/mock.ts`). The screen shows it as the "Model cost · MTD" KPI and
  the "Model cost" column (next to "Credit cost").
- `margin_pct = (MRR + billed − cost) ÷ (MRR + billed)`, using the tenant's paying MRR (`tenantMrr`). `null` when revenue is 0 (trial or suspended).
- `feature`: `outlines · quizzes · summaries · chat`. `by_feature` splits each tenant's credits 55 % to their `top_feature` and the rest 20/15/10 %.
- `routing_policy`: `cost_first · balanced · quality_first` (default `balanced`). It sets the Claude tier of schools that haven't picked one
  for a task: `cost_first` → fastest (Haiku), `quality_first` → best (Opus), `balanced` → the task's recommended tier.
- **Enforcement** (every AI studio call, both stacks: Laravel `Platform/Analytics/AiRouting` from `AiSettings::model`, Go
  `aiusage.Router` from `Studio.ModelFor`), in order: a throttled school → fastest; this month's platform **model cost**
  (`ai_usage.cost_micros`, cached 60 s under `platform:ai-mtd`) at or over `monthly_cap` → fastest for every school and one console
  notification per month (`/analytics/ai`); else the school's own tier; else the routing policy. Never a hard block.
- `cap_used_pct` = `model_cost ÷ monthly_cap`; `cap_reached` when `model_cost ≥ monthly_cap` (the screen shows a red notice).
- `tenants` is the **top 10** by `tokens_k` (heaviest first); `totals` and `by_feature` cover every tenant with usage
  (`totals.tenants` counts them). The whole list pages through `GET /analytics/ai/tenants`.

### `GET /analytics/ai/tenants`

Permission `analytics.view`. Paginated `AiTenantUsage[]` (rows exactly as in `tenants` above): every tenant with AI usage
this month, ranked and paginated in SQL. `page`, `per_page` (max 100, default 25), `sort` from `tokens_k`, `name`
(`-` = descending; default `-tokens_k`, heaviest first; ties by tenant id). 422 `sort` for any other field. The AI screen
keeps the full list's page in `?tenantsPage=` (open while `?tenants=all`).

### `PUT /analytics/ai/settings`

Permission `billing.manage`. Body: any of `{ monthly_cap: int, routing_policy }`. Returns the full `AiUsage`.
422: `monthly_cap` (whole dollars, 100–100,000), `routing_policy` (enum). An empty body is a 422 on `monthly_cap`.
Audit (Billing): `Set the AI monthly cost cap to ${n}` · `Changed AI model routing to {Cost-first|Balanced|Quality-first}`. Only written when the value changes.
The routing copy names Claude tiers: Cost-first · Claude Haiku for every task · Balanced · the recommended Claude tier per task ·
Quality-first · Claude Opus for every task.

### `POST /analytics/ai/tenants/{id}/throttle` · `DELETE /analytics/ai/tenants/{id}/throttle`

Permission `billing.manage`. Routes the tenant to the low-cost model (POST) or restores full speed (DELETE). Idempotent. Returns the full `AiUsage`.
404 when the tenant doesn't exist or has no AI usage.
Audit (Billing, with `tenant_id`): `Throttled {name} to the low-cost AI model` · `Restored full AI speed for {name}`.

## Experiments

Experiments run **over schools, through feature flags** (decision 13). An experiment owns one catalogue flag while it runs:

- a school without its own override of the flag is in the **variant** (flag on) when `crc32("exp:{id}:{tenant}") % 100 < allocation_pct`,
  else in **control** (flag off). The arm is stable. Schools with an override are excluded (never exposed);
- the first evaluation of the flag for a school inserts its assignment (`experiment_assignments`, its **exposure**), write-once and
  guarded by the shared cache key `exp-exposed:{id}:{tenant}` for a day, so there is no write per request. Console views of a school
  don't expose it;
- the hourly `experiments:measure` (Go `experiments.measure`) stamps `converted_at` once per school from the metric, then stores
  `exposed`, `control_pct`, `variant_pct` and `confidence_pct` (two-proportion z-test, `App\Support\Stats\Proportions` / Go
  `internal/stats`). `confidence_pct` stays 0 and the verdict is `Collecting data` until **each arm has 30 schools** (`min_tenants`).

Metrics (all from platform data after the school's exposure): `trial_converted` (a paid Coursiva invoice), `activated_14d` (a
published course seen within 14 days), `active_30d` (activity within 30 days), `addon_purchased` (an add-on that became active).

### `GET /analytics/experiments`

```json
{
  "data": {
    "kpis": { "running": 4, "significant": 2, "shipped90d": 7, "avg_winning_lift_pct": 33.6 },
    "experiments": [
      {
        "id": "exa_01jd…",
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
        "ended_at": null,
        "metric": "trial_converted",
        "metric_label": "Trial converted to paid",
        "allocation_pct": 20,
        "hypothesis": "The new builder lifts conversion.",
        "control_n": 3856,
        "variant_n": 964,
        "started_at": "2026-10-20T10:00:00Z"
      }
    ]
  }
}
```

Rules:

- `lift_pct = (variant − control) ÷ control × 100`, one decimal. `significant` when confidence ≥ 95 % (never while collecting).
- `verdict`: `Collecting data` while an arm has fewer than 30 exposed schools · `Winning` when confidence ≥ 90 % and lift > 0 ·
  `Losing` when confidence ≥ 90 % and lift < 0 · otherwise `Inconclusive`. Experiments archived before measurement existed (no
  assignments) keep their stored figures.
- `status`: `running · shipped · stopped`. The list is ordered running first, then finished (newest first).
- KPIs count **running** experiments. `shipped90d` includes experiments archived before this table existed. `avg_winning_lift_pct` is the
  mean lift of running `Winning` experiments (`null` if none).
- The wire key is `shipped90d` (the case converter does not split digits), and the code uses the same name.

### `POST /analytics/experiments`

Permission `platform.manage`. Body `{ name (≤120), surface (≤80), flag_key, metric, allocation_pct (1–50), hypothesis? (≤300) }` →
201 `{ data: ExperimentDetail }`. The flag must be in the catalogue (422 `flag_key`) and not owned by another running experiment
(**422 `experiment_flag_busy`**, `flag_key` in the body). The flag's current platform state is saved as `previous_flag`.
**Only flags that reach no school yet:** while an experiment runs, schools in the control arm have the flag off, so a flag
that is on for all tenants or on with a partial rollout (`Scale only`, `Growth and Scale`, `10% of tenants`) is refused
with **422 `experiment_flag_already_live`** (`flag_key`, `rollout` in the body; message "This feature is already on for
every school; an experiment would switch it off for the control group."). Eligible: off, or on for the `Beta list` only
(overridden schools, which experiments exclude). The form annotates live flags ("already live"), explains why inline and
disables Start; a server refusal shows under the flag field.
**Only flags that gate something:** a flag whose `gates` is null (`GET /platform/flags`; nothing in the product reads it) is refused
with **422 `experiment_flag_no_effect`** (`flag_key` in the body), checked first: both arms would get the same product. The form
lists such flags disabled, tagged "gates nothing yet". Today `advanced_reports` (the dashboard's cohort completion report),
`certificates`, `custom_domains` and `advanced_quizzes` gate behaviour; `site_builder_v2` and `multi_currency` gate nothing.
All four gating flags are on for every school by default, so they show as "already live" until staff turn one off (or
to the Beta list) in Flags.
Audit (Flags): `Started experiment "{name}" on {flag_key} ({n}% of schools in the variant)`.

### `GET /analytics/experiments/{id}`

Permission `analytics.view`. The row above plus `arms` (`[{ arm: control|variant, exposed, converted, rate_pct }]`), `previous_flag`
(`{ enabled, rollout }` or null) and `min_tenants` (30). 404.

### `PATCH /analytics/experiments/{id}`

Permission `platform.manage`. Body: any of `{ name, hypothesis }` → `{ data: ExperimentDetail }`. Audit (Flags): `Edited experiment "{name}"`.

### `POST /analytics/experiments/{id}/promote`

Permission `platform.manage`. Measures once more, then ships the variant to everyone: `status → shipped`, `ended_at → now`. If `flag_key`
names a feature flag, that flag is set to `enabled: true`, `rollout: "All tenants"` and stays, so a rollback is one switch on Flags & status.
The UI asks for confirmation first. Returns the full `Experiments` resource. 404 · 422 `status` unless running.
Audit (Flags): `Promoted experiment "{name}" to 100%`.

### `POST /analytics/experiments/{id}/stop`

Permission `platform.manage`. Measures once more, ends the experiment (`status → stopped`) and **restores the flag to `previous_flag`**
(the state saved at creation), so every school is back where it was. Returns the full `Experiments` resource. 404 · 422 `status` unless running.
Audit (Flags): `Stopped experiment "{name}" — traffic returned to control`.

### `DELETE /analytics/experiments/{id}`

Permission `platform.manage`. Deletes a **stopped or shipped** experiment with its assignments (test runs, obsolete
history) → 204. A running experiment answers **409 `conflict`** (stop it first, so its flag is restored). 404 unknown id.
Audit (Flags): `Deleted experiment "{name}" and its results`. The screen shows Delete (two-step confirm) on finished rows.

The screen: "New experiment" (flag picker, metric, allocation slider, hypothesis), a detail drawer per experiment (arms, collecting
notice, the flag state Stop restores, editable hypothesis), and an honest note on how assignment and measurement work.
