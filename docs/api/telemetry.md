# Telemetry — Web Vitals (real-user monitoring)

Source: `src/lib/vitals.ts`. Enabled when `VITE_VITALS_ENDPOINT` is set (e.g. `https://api.coursiva.io/api/v1/admin/telemetry/vitals`).

## `POST {VITE_VITALS_ENDPOINT}`

Sent with `navigator.sendBeacon` (falls back to `fetch` with `keepalive`) when the page is hidden, so it
arrives without cookies/CSRF headers guaranteed — accept it **unauthenticated**, rate-limit per IP, and
never trust it for anything but aggregates.

```json
{
  "release": "3f2c9ab",
  "metrics": [
    { "name": "LCP", "value": 1244.5, "rating": "good", "id": "v5-1727…", "path": "/tenants/:id", "navigation_type": "navigate" },
    { "name": "INP", "value": 88, "rating": "good", "id": "v5-1727…", "path": "/tenants", "navigation_type": "navigate" }
  ]
}
```

- `name`: `LCP` · `INP` · `CLS` · `FCP` · `TTFB`; `value` in ms (CLS unitless); `rating` per web.dev thresholds.
- `path` has ids replaced by `:id` so metrics aggregate per screen.
- Respond `204`. Store and chart p75 per `name` × `path` × `release`.

Targets (p75): **LCP ≤ 2.5 s · INP ≤ 200 ms · CLS ≤ 0.1**.
