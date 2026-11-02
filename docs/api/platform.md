# Platform settings

Types: `src/features/platform/types.ts` · Mock: `src/features/platform/mock.ts` · Tests: `src/features/platform/platform.test.tsx`

Screens: Flags & system status (`/platform/flags`), Email deliverability (`/platform/deliverability`),
Certificate authority (`/platform/certificates`), Standards & conformance (`/platform/standards`), API & webhooks (`/platform/api`).

Every read needs `platform.view`. Writes need the permission listed per endpoint. Every write records an audit entry server-side.

## Feature flags

### `GET /platform/flags`

`{ data: FeatureFlag[] }` — `FeatureFlag`: `key, name, description, enabled, rollout, tenant_overrides` (number of tenants overriding the flag individually).
`rollout`: `All tenants` · `Scale only` · `Growth and Scale` · `Beta list` · `10% of tenants`.

### `PATCH /platform/flags/{key}`

Permission `flags.manage`. Body: any of `{ enabled: bool, rollout }` → `{ data: FeatureFlag }`. 404 unknown key; 422 `enabled`, `rollout`.
A flag switches the feature for every school in its rollout at once, so every change needs a password confirmed in the last 15 minutes (`423 password_confirmation_required`, see [auth.md](auth.md)). The console
asks for the flag name typed back before turning a flag off or widening a live flag to `All tenants`.
Tenant detail (`GET /tenants/{id}` → `flags[]`) reports this platform value for tenants without an override.

| Change    | Audit (Flags)                                                            |
| --------- | ------------------------------------------------------------------------ |
| `enabled` | `Enabled "{name}" for {rollout, lower-case}` / `Disabled "{name}" for …` |
| `rollout` | `Set "{name}" rollout to {rollout, lower-case}`                          |

## System status & incidents

The incident is the same record the header reads from `GET /status` (see [shell.md](shell.md)): posting or resolving one flips
`operational` there immediately.

### `GET /platform/system`

```
{ data: {
  incident: { title, posted_at, service_ids: [] } | null,
  status_page_url: "https://status.{primary_domain}",
  services: [{ id, name, uptime_90d, status: Operational|Degraded }]
} }
```

A service is `Degraded` while an open incident lists it in `service_ids`.

### `POST /platform/incident`

Permission `flags.manage`. Body `{ title, service_ids: [] }` → `201 { data: SystemStatus }`.
422: `title` (5–120 chars; also "An incident is already posted — resolve it before posting another."), `service_ids` (≥ 1, known ids).
Audit: `Posted incident: {title}` (Flags).

### `DELETE /platform/incident`

Permission `flags.manage`. Resolves the open incident → `{ data: SystemStatus }`. 422 `incident` when none is open.
Audit: `Resolved incident: {title}` (Flags).

## Broadcast announcements

A dismissible banner in tenant admin dashboards.

### `GET /platform/broadcasts`

Paginated `Broadcast[]`, newest first: `id, message, audience, recipients, sent_by, sent_at`.

### `POST /platform/broadcasts`

Permission `announcements.send`. Body `{ message, audience }` → `201 { data: Broadcast }`.
`audience`: `All tenants` (not suspended) · `Growth & Scale` (not suspended) · `Trials only`. `recipients` = matching tenants at send time.
422: `message` (required, ≤ 200 chars), `audience`. Audit: `Broadcast to {audience}: "{message}"` (Tenants).

## Email deliverability

### `GET /platform/deliverability`

```
{ data: {
  summary: { sent_30d, bounce_rate, complaint_rate, domains_at_risk,
             thresholds: { bounce_watch: 2, bounce_max: 5, complaint_watch: 0.1, complaint_max: 0.3 } },
  domains: SenderDomain[],
  suppression: [{ list, count, note }]
} }
```

`SenderDomain`: `id, tenant_id, tenant_name, domain, spf, dkim (Pass|Fail|Not set), dmarc (policy string or "none"), sent_30d,
bounce_rate, complaint_rate (percent), risk, paused, paused_at, dns_checked_at`.

**Not measured = null, never 0.** The summary `bounce_rate` / `complaint_rate` are the bounces (hard + soft) and spam
complaints the providers' webhooks reported in 30 days, as a percent of `sent_30d` — measured once the Postmark
connection has a webhook password (or `POSTMARK_WEBHOOK_PASSWORD`) or any bounce/complaint arrived, and mail was sent;
`null` before that. Per-domain `sent_30d`, `bounce_rate`, `complaint_rate` and every `suppression[].count` stay `null`
(suppressions live in each school's database). The console shows "—" and "Not measured yet" for nulls. Webhook setup:
backend docs/communications.md → Bounces and complaints.

Rates are percentages; summary rates are weighted by volume. **`risk` is computed server-side** from provider thresholds:
`Over threshold` when complaints ≥ 0.3% or bounces ≥ 5%; `Watch` when complaints ≥ 0.1% or bounces ≥ 2%; otherwise `Healthy`.
`domains_at_risk` counts domains over threshold or failing SPF/DKIM.

### Sender actions

Permission `platform.manage`. All return `{ data: SenderDomain }`; 404 unknown domain.

| Endpoint                                       | Effect                                                             | Audit (Tenants, with `tenant_id`)    |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| `POST /platform/sender-domains/{id}/pause`     | Stops all sending from the tenant's domain (422 if already paused) | `Paused email sending for {tenant}`  |
| `POST /platform/sender-domains/{id}/resume`    | Resumes sending (422 if not paused)                                | `Resumed email sending for {tenant}` |
| `POST /platform/sender-domains/{id}/dns-check` | Re-reads SPF/DKIM/DMARC, updates `dns_checked_at`                  | `Re-checked DNS for {domain}`        |

## Certificate authority

Certificates are held in the platform registry (`verify.coursiva.io`) and stay verifiable after a tenant is suspended or closed.

### `GET /platform/certificates/summary`

`{ data: { issued, verified_30d, revoked, orphaned } }`

### `GET /platform/certificates`

Paginated `Certificate[]`, newest issued first. `search` matches certificate id, learner, course or school (contains, case-insensitive).
`Certificate`: `id` (public id, e.g. `AC-2026-0341`), `learner_name, tenant_id, tenant_name, course, issued_at, status (Valid|Revoked), revoked_at, verify_url`.

### `POST /platform/certificates/{id}/revoke` · `POST /platform/certificates/{id}/reinstate`

Permission `platform.manage` → `{ data: Certificate }`. 422 when already in that state. The public verify page then reads "revoked"
and the holder and tenant are notified.
Audit (Security): `Revoked certificate {id} ({learner})` / `Reinstated certificate {id} ({learner})`.

### `GET /platform/certificate-policies`

`{ data: [{ key, label, description, enabled }] }` — keys `outlive`, `issuer`, `self_revoke`, `ob3`.

### `PUT /platform/certificate-policies/{key}`

Permission `platform.manage`. Body `{ enabled: bool }` → `{ data: RegistryPolicy }`. 422 `enabled`.
Audit: `Enabled/Disabled registry policy "{label}"` (Security).

## Standards & conformance

### `GET /platform/standards`

```
{ data: {
  summary: { scorm_packages, xapi_statements_24h, lti_launches_30d, failed_imports },   // xapi/lti: null = not measured yet ("—")
  standards: [{ id, name, direction: Import|Export|Both, packages, note, support: Supported|Partial|Not supported }],
  failed_imports: [{ id, tenant_id, tenant_name, file, reason, failed_at }],   // open queue only
  accessibility: [{ surface, level, status: Conformant|Partial|Not conformant, note }]
} }
```

### `POST /platform/imports/{id}/reprocess`

Permission `platform.manage`. Re-runs the import and removes it from the failed queue either way →
`{ data: { id, file, tenant_name, outcome: imported|rejected, message } }`. The tenant is notified of the outcome.
A package over the 2 GB limit is `rejected`; other failures are repaired and `imported` (counted in `scorm_packages`).
422 when already re-processed. Audit: `Re-processed {file} for {tenant} — {outcome}` (Tenants).

## Connections

Screen: `/platform/connections`. Operators connect the services the platform runs on by **pasting credentials**; the
server verifies them with the provider, stores them encrypted and uses them at once on every server. Storage backends
(incl. `public_assets`, the public-images bucket) and DRM providers use the same model on the Media screen ([media.md](media.md)).

Types: `PlatformConnection`, `ConnectionInput`, `ConnectionTestResult` in `src/features/platform/types.ts`. Mock:
`src/features/platform/mock.ts` (`CONNECTIONS`).

| Endpoint                                | Permission                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /platform/connections`             | `platform.view`                                    | `[{ key, name, description, role, kind, connected, verified_at, fields[], capabilities[] }]`. `capabilities`: `[{ key, label, on }]`, the [feature availability](#feature-availability) switches of the capabilities that need this connection (the card's "Available to schools" switches; same `PUT /platform/availability/{key}`). `kind`: `payments` · `cdn` · `push` · `email` · `ads` · `insights` · `ai` · `security` · `monitoring` · `video` · `oauth` (plus `storage` · `drm`, shown on Media). Field: `key, label, secret, configured, last4, value, options, default`. `last4` only for stored values of 12+ characters; `value` only for non-secret fields. `options` (`[{ value, label }]` or null): a fixed choice shown as a switch, not a text box (e.g. Cloudflare Registrar `mode`); `default`: the value in effect while none is stored. |
| `PUT /platform/connections/{key}`       | `platform.manage` (payments also `billing.manage`) | Body `{ credentials: [{ field, value }] }`. Blank or omitted fields keep their stored value; after merging every required field must be set (422 `credentials.{field}`, e.g. `Enter the Secret key.`, `The secret key should start with sk_live_ or …`). The provider refuses → 422 `credentials` (`Stripe rejected these credentials: …`), shown on the card. Needs a password confirmed in the last 15 minutes: 423 `password_confirmation_required` (see [auth.md](auth.md)).                                                                                                                                                                                                                                                                                                                                                                             |
| `DELETE /platform/connections/{key}`    | as above                                           | Deletes the stored credentials → the connection (`connected: false`). 409 for `paddle` / `lemon_squeezy` (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `POST /platform/connections/{key}/test` | `platform.manage`                                  | Re-verifies → `{ ok, latency_ms, message }`; 409 when not connected. No audit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Keys: `stripe` (secret key, publishable key, webhook signing secret, optional Connect webhook signing secret) · `paddle`, `lemon_squeezy` (below) · `cloudflare` (API token, zone ID) · `cloudflare_registrar` (below) · `expo` (access token; only
needed when the Expo project enables enhanced push security; Expo refuses → `Expo push rejected these credentials: the
access token was refused`) · `postmark` (server token, optional message stream, optional secret `webhook_password` — 24+ characters without spaces or
colons, else 422 `Use at least 24 characters without spaces or colons, e.g. from \`openssl rand -hex 24\`.`; the HTTP Basic
auth password of the bounce/complaint webhook `{API}/api/v1/webhooks/postmark`, backend docs/communications.md) · `smtp`(host, port, security`STARTTLS`/`SSL/TLS`, username, password;
Postmark wins when both are connected) · `google_ads`, `microsoft_ads`, `google_crux`(below) ·`anthropic`, `assemblyai`(below) ·`clamav`, `metrics`(below) ·`daily`(below) ·`oauth_{provider}` (below).

Screen sections, in this order: Payments · Custom domains · Push notifications · Platform email · Ads & channels ·
Insights · AI studio · Security · Monitoring · Live video · Sign-in apps
(`?section=payments|cdn|push|email|ads|insights|ai|security|monitoring|video|oauth`).

**Cloudflare token permissions.** The `cloudflare` token issues SSL for custom hostnames ("SSL and Certificates:
Edit") and also drives the edge: CDN purge by hostname after publishes (**Cache Purge: Purge**), the `redirect_www` /
`force_https` single-redirect rules (**Single Redirect: Edit**, Zone → Dynamic Redirect) and the delivery figures
(**Analytics: Read**). The connection check only proves the SSL permission (refused → `… (the token needs SSL and
Certificates: Edit on this zone)`); a missing extra permission shows up as a logged 403 (backend
`docs/custom-domains.md` → Edge rules and CDN). The Custom domains section says so.

### Domain registrar (`kind: cdn`)

Key `cloudflare_registrar`, name `Cloudflare Registrar`, shown in the Custom domains section. Description: `Domain
sales to schools (search, registration, DNS of bought domains) · an account API token with Registrar and DNS
permissions`. Fields:

- `account_id` ("Account ID", non-secret): 32 hex characters — `The account ID is 32 hexadecimal characters
(Cloudflare dashboard → Account home → Account ID).`
- `api_token` (secret, "API token"): at least 20 characters — `The API token is at least 20 characters.`
- `mode` (non-secret, optional, "Mode", placeholder `sandbox`): `live` or `sandbox` — `The mode must be live or
sandbox.` **Blank means `sandbox`** (the safe default). `sandbox` uses Cloudflare's Registrar Sandbox
  (`/accounts/{id}/registrar-sandbox/…`): free test registrations that aren't on the internet, `com`/`net` only, no
  DNS zones. Bought domains are marked `environment: sandbox` and are never connected or renewed. In production,
  readiness fails while the active registrar is in sandbox mode, and Domains → Settings shows a warning.

**Verified live** with a read-only call on the mode's own base path (the registrar's extension list): a refused token
→ `Cloudflare Registrar rejected these credentials: … (the token needs Registrar: Edit on this account)` (sandbox:
`… needs Registrar Sandbox Domains Admin …`). Token permissions: **Account →
Registrar: Edit** (search, check, register, auto-renew) plus **Zone → DNS: Edit** and **Zone → Zone: Read** on the
account's zones (DNS of bought domains). Registrations are billed to the account's default payment method. Without the
connection (or the `CLOUDFLARE_REGISTRAR_ACCOUNT_ID` / `CLOUDFLARE_REGISTRAR_API_TOKEN` / `CLOUDFLARE_REGISTRAR_MODE`
fallback), schools see
`registrar_unavailable` ([domains.md](domains.md)).

### Ad networks (`kind: ads`) and insights (`kind: insights`)

Neither ad network has a call that proves a developer token without a school's OAuth grant, and a wrong CrUX key only
shows in the first nightly refresh, so these are **format checks only** (422 `credentials.{field}`):

| Key             | Name                      | Field                      | Check (message)                                                                                                                    |
| --------------- | ------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `google_ads`    | Google Ads API            | `developer_token` (secret) | `^[A-Za-z0-9_-]{22}$` — `The developer token is 22 letters, digits, - or _ (Google Ads → Tools → API Center).`                     |
| `microsoft_ads` | Microsoft Advertising API | `developer_token` (secret) | `^[A-Za-z0-9]{8,64}$` — `The developer token is 8–64 letters and digits (Microsoft Advertising Developer Portal → Account).`       |
| `google_crux`   | Chrome UX Report API      | `api_key` (secret)         | `^AIza[0-9A-Za-z_-]{35}$` — `A Google API key is 39 characters starting with AIza (Google Cloud → APIs & Services → Credentials).` |

`google_crux` feeds Core Web Vitals (LCP, INP, CLS at p75) of every school site from real Chrome users.

### AI studio (`kind: ai`)

Every AI studio generation for every school (outlines, quizzes, grading, copy, caption translation, tutor) goes
through the platform's Claude key, metered as AI credits on the school's plan (see [analytics.md](analytics.md));
caption audio is transcribed by AssemblyAI. Each key is format-checked (422 `credentials.{field}`), then **verified
live** with the provider (refused → 422 `credentials`):

| Key          | Name       | Field              | Check (message)                                                                                            |
| ------------ | ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `anthropic`  | Anthropic  | `api_key` (secret) | `^sk-ant-[A-Za-z0-9_-]{20,}$` — `An Anthropic API key starts with sk-ant- (Claude Console → API keys).`    |
| `assemblyai` | AssemblyAI | `api_key` (secret) | `^[a-f0-9]{32}$` — `An AssemblyAI API key is 32 hexadecimal characters (AssemblyAI dashboard → API keys).` |

Descriptions: `Claude for the AI studio (outlines, quizzes, grading, copy, captions translation, tutor) · an API key from
the Claude Console` · `Speech-to-text for AI captions and lesson transcripts`.

### Security (`kind: security`) and monitoring (`kind: monitoring`)

| Key       | Name               | Fields                           | Check (message)                                                                                                                                                    |
| --------- | ------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clamav`  | ClamAV             | `host`, `port` (both non-secret) | host: an IP address or a hostname — `The host must be a hostname or an IP address, e.g. clamav.internal.`; port: 1–65535 — `The port must be between 1 and 65535.` |
| `metrics` | Prometheus metrics | `token` (secret, "Scrape token") | `^[A-Za-z0-9._~+/=-]{32,256}$` — `Use a random token of at least 32 characters (for example: openssl rand -hex 32).`                                               |

- `clamav` scans every upload (media library, assignment files, SCORM packages) with a clamd daemon reachable over
  TCP, usually on the private network (the address is not SSRF-filtered; only platform staff enter it). It is
  **verified live** with `PING` → `PONG`; no answer → 422 `credentials`:
  `ClamAV rejected these credentials: no clamd answered PING at {host}:{port}` (the mock's clamd never answers on
  `clamav.down.internal`). Description: `Virus scanning of every upload (media library, assignment files, SCORM
packages) · a clamd daemon reachable over TCP`.
- `metrics` is the bearer token Prometheus scrapes `GET /api/metrics` with. Nothing is called: the operator generates
  it (`openssl rand -hex 32`) and puts the same value in the scrape config, so it is **format-checked only**.

### Live video (`kind: video`)

Key `daily`, name `Daily`. Fields and checks:

- `api_key` (secret, "API key"): `^[A-Za-z0-9]{32,128}$` — `A Daily API key is letters and digits (Daily dashboard →
Developers → API key).`
- `domain` (optional, non-secret, "Domain", placeholder `yourcompany.daily.co`): `{name}.daily.co`, with or without
  `https://` — `The domain looks like yourcompany.daily.co.`
- `webhook_secret` (optional, secret, "Webhook HMAC secret (base64)"): base64 of at least 16 bytes — `The webhook
secret is the base64 HMAC secret the webhook was created with.`

- The schools' built-in live rooms run on this account: a private Daily room per built-in session, joined with
  short-lived meeting tokens; cloud recordings are imported into the school's Media library. **Verified live** by
  reading the account (`GET https://api.daily.co/v1/`): a refused key →
  `Daily rejected these credentials: the API key was refused`; a pasted domain that isn't the account's →
  `… the API key belongs to {domain}, not {pasted}`.
- Until it is connected (or `DAILY_API_KEY` is set as a fallback), schools can't schedule, start or join built-in
  rooms (`409 video_not_configured` on the tenant and learner APIs).
- **Webhook.** With a webhook HMAC secret saved (e.g. `openssl rand -base64 32`), run `php artisan live:daily-webhook`
  (optionally `--url=https://api.example.com/api/v1/webhooks/daily`): it creates or updates the account's webhook with
  that secret for `participant.joined`, `participant.left`, `recording.ready-to-download` and `meeting.ended`.
  Description: `Video for the built-in live rooms (Daily Prebuilt, private rooms, meeting tokens, cloud recording) · an
API key from the Daily dashboard → Developers`.
  Description: `Bearer token for scraping GET /api/metrics · without it (or METRICS_TOKEN) the endpoint answers 404`.

### OAuth apps (`kind: oauth`)

One `oauth_{provider}` per provider family, sorted by key (the backend's `OAuthProviders::names()`): Canva, Discord,
Google, HubSpot, Intercom, LinkedIn, Meta, Microsoft, Notion, PayPal, Pinterest, Intuit QuickBooks, Salesforce, Slack,
Stripe, TikTok for Business, Vimeo, X, Xero, Yandex, Zendesk, Zoom. Named `{name} OAuth app`. Fields:

- default: `client_id`, `client_secret` (secret);
- `oauth_stripe` (Connect): `client_id` only, starting `ca_` (it signs with the Stripe secret key);
- `oauth_meta`: plus optional `config_id` (Login for Business configuration ID) and `pages_config_id` (Login for
  Business configuration ID for Page and Instagram posting);
- `oauth_x` (OAuth 1.0a): `consumer_key` (API key (consumer key)), `consumer_secret` (secret);
- `oauth_discord`: plus optional `bot_token` (secret, `Bot token (Bot → Reset Token in the Discord developer portal)`,
  at most 200 characters, `^[A-Za-z0-9_.-]{50,200}$` — `A Discord bot token is 50–200 letters, digits, dots, - or _.`).
  Discord role sync (adding students to a school's server, roles by course) calls Discord as this bot. When given it is
  **verified live** with `GET https://discord.com/api/v10/users/@me` as `Authorization: Bot <token>`; refusals → 422
  `credentials`: `Discord OAuth app rejected these credentials: Discord refused the bot token` (401/403) ·
  `… the token is not a bot token` (the user is not a bot). The client ID and secret are not checked (as for every
  OAuth app). The mock refuses `DISCORD_REFUSED_BOT_TOKEN` and answers `DISCORD_USER_TOKEN` as a user (`mock.ts`).

Each card's description names the redirect URI to register (`Register this redirect URI with {name}: …`; for X,
`Register this callback URL in the X app: …`). Discord's ends `· The bot token (same application) lets Coursiva add
students to a school’s server and sync their roles by course.`

Audit (Security): `Connected {name}` · `Updated credentials for {name}` · `Disconnected {name}`.

### Payment providers (`kind: payments`)

Listed in this order: Stripe, Paddle, Lemon Squeezy. **Writing any of them (PUT, DELETE) needs `platform.manage` and
`billing.manage`**; the screen shows them read-only otherwise. Which one bills new checkouts is the
`billing_provider` setting ([settings.md](settings.md#billing_provider)); Paddle and Lemon Squeezy are merchants of record.

**`paddle`** — `School subscriptions through Paddle Billing (merchant of record: Paddle collects, handles tax and issues the invoices)`

| Field            | Label              | Secret | Check (422 `credentials.{field}`)                                            |
| ---------------- | ------------------ | ------ | ---------------------------------------------------------------------------- |
| `api_key`        | API key            | yes    | ≥ 20 characters, no spaces (`That API key looks too short.`)                 |
| `client_token`   | Client-side token  | no     | starts with `live_` or `test_` (`test_` = sandbox)                           |
| `webhook_secret` | Webhook secret key | yes    | starts with `pdl_ntfset_`                                                    |
| `product_id`     | Product ID         | no     | `pro_` + 26 lowercase letters/digits (`The product ID looks like pro_01h….`) |

Verification: the API key and the client-side token must be one environment (keys prefixed `pdl_sdbx_` / `pdl_live_`
are checked against the token), then the product is read with the key on the token's environment. Refusals → 422
`credentials`: `Paddle rejected these credentials: the API key and the client-side token are from different environments (sandbox and live)` ·
`… there is no product pro_… in this sandbox account` · `… the product pro_… is archived` · the provider's own message for a refused key.

**`lemon_squeezy`** — `School subscriptions through Lemon Squeezy (merchant of record) · plans only: one subscription variant per plan and cycle`

| Field                                                                                        | Label                                                         | Secret | Check                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| `api_key`                                                                                    | API key                                                       | yes    | ≥ 40 characters                                                   |
| `store_id`                                                                                   | Store ID                                                      | no     | digits (`The store ID is a number, e.g. 12345.`)                  |
| `webhook_secret`                                                                             | Webhook signing secret                                        | yes    | 6–40 characters                                                   |
| `variant_{launch,growth,scale}_{monthly,annual}` (six fields, e.g. `variant_growth_monthly`) | `{Plan} {cycle} variant ID`, e.g. `Growth monthly variant ID` | no     | digits (`The Growth monthly variant ID is a number, e.g. 12345.`) |

Verification: the key must read the store; each variant must exist, belong to that store, be a subscription billed
every month (monthly) / year (annual), and cost exactly the console price book's price for that plan and cycle
(annual = 12 × the discounted monthly price). Refusals → 422 `credentials`, e.g.
`Lemon Squeezy rejected these credentials: variant 13 (Growth monthly) costs $299, but the price book says $399`.

Disconnecting (`DELETE`) `paddle` or `lemon_squeezy` → **409**:

- while it is the billing provider: `Paddle is the billing provider. Choose another one in Settings → Billing & dunning first.`
- while schools are still billed through it: `1 school is still billed through Lemon Squeezy. Disconnecting would stop their renewals from being recorded.`
  (`{n} schools are …`).

Webhook endpoints to register with each provider (shown in the Payments card's subtitle):

| Provider      | Endpoint                                   | Events                                                                  |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Stripe        | `{API base}/api/v1/webhooks/stripe`        | as configured for Stripe                                                |
| Paddle        | `{API base}/api/v1/webhooks/paddle`        | `subscription.*`, `transaction.completed`, `transaction.payment_failed` |
| Lemon Squeezy | `{API base}/api/v1/webhooks/lemon-squeezy` | subscription and subscription payment events                            |

## Feature availability

Screen: `/platform/availability` (also the "Available to schools" switches on each connection card). One platform-level
switch per **capability** — a module, an extension, a live provider, an ad network, a sign-in provider, a marketplace
app — above plans, extensions and per-school overrides. A capability is **available** when its switch is on (a missing
switch is on) and its `requires` connections are connected (all of them; any one when `requires_any`). An unavailable
capability is hidden everywhere — dashboard nav and screens, student site (404), API (`403 feature_unavailable`,
`reason: platform_disabled`, `capability`), jobs — never shown disabled. Extensions in `extensions[]` leave the store,
trials and marketing pricing; schools already paying keep their billing (comp or cancel them from Billing).
Schools learn it from `/auth/me` `unavailable: string[]` (dashboard) and the public site payload `unavailable`.
Storage: `platform_settings` `availability.switches` (`{key: bool}`), cached and shared by both backends. Mock:
`CAPABILITIES` in `src/features/platform/mock.ts` (per-network, per-provider and per-app entries are generated from
those catalogues).

| Endpoint                           | Permission        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /platform/availability`       | `platform.view`   | `{ capabilities: [{ key, label, group, description, surfaces[], modules[], extensions[], requires: [{ key, label, connected }], requires_any, on, available, schools_using, paying_schools }], groups: [{ key, label }] }` in display order. `schools_using`: schools using it now (cached 5 minutes; null = not counted). `paying_schools`: schools paying for one of its `extensions` (null = not counted / no extension). `requires_any` is true only for `drm` (`ezdrm`, `keyos` or `mux`). Generated keys: `app_{integration key}` (e.g. `app_slack`, `app_google-sheets`; live-provider and ad apps are covered by `live_*` / `ads_*`), `ads_{network}` (`google`, `microsoft`, `meta`, `tiktok`, `linkedin`, `pinterest`, `x`), `signin_{provider}` (`signin_google`). `push` needs no connection (the Expo token is optional). |
| `PUT /platform/availability/{key}` | `platform.manage` | Body `{ on: bool }` (422 `on`) → the capability. 404 for an unknown key. Switching **off** needs a password confirmed in the last 15 minutes (423 `password_confirmation_required`); switching on doesn't. Audit (Flags): `Turned off {label} for all schools` / `Turned on {label} for all schools` (only when it changes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Groups: `video` Video & live · `ai` AI · `messaging` Messaging · `marketing` Marketing & growth · `learning` Learning ·
`commerce` Commerce · `signin` Sign-in & security · `integrations` Integrations · `other` Other modules.
Turning a capability off in the console asks first: it lists `surfaces`, the schools using it and the paying-schools
note, and is confirmed by typing the capability's name; then the step-up prompt asks for the password when needed.
The old Media → Live rooms policies `built_in_rooms` / `byo_providers` are replaced by `live_rooms` and
`live_zoom` / `live_meet` / `live_teams` (a stored `false` was migrated into the switches).

## API keys

Platform (staff) API keys. **The full secret is returned exactly once, in the create response.** The server stores only a hash
and the last four characters; every other response carries the masked `prefix`.

### `GET /platform/api-keys`

Paginated `ApiKey[]`, newest first: `id, name, prefix` (e.g. `sk_live_••••4f2a`), `scope (Full access|Read only), created_at, last_used_at, revoked_at`.
Revoked keys stay listed. The console asks for 25 a page (`?keysPage=` in its URL) with a pager.

### `POST /platform/api-keys`

Permission `platform.manage`. Body `{ name, scope }` → `201 { data: ApiKey & { secret } }` (`secret` = `sk_live_` + 40 hex chars).
422: `name` (2–60 chars, unique among active keys), `scope`.
Needs a password confirmed in the last 15 minutes (`423 password_confirmation_required`, see [auth.md](auth.md)): a key acts as its creator and outlives the session. A request authenticated with an API key has no
session, so a key can never mint another key. For `Full access` the console's dialog says what the key can do and asks
for `FULL ACCESS` typed back.
Audit: `Created API key "{name}" ({prefix}, {scope, lower-case})` (Security).

### `POST /platform/api-keys/{id}/revoke`

Permission `platform.manage` → `{ data: ApiKey }`. Requests with the key are rejected from then on. 422 if already revoked.
Audit: `Revoked API key "{name}" ({prefix})` (Security).

## Webhooks

### `GET /platform/webhooks`

```
{ data: {
  endpoints: [{ id, tenant_id (null = platform-level), url, events: string[] ("*" = all events), success_rate_7d, status: Healthy|Failing }],
  failed_deliveries: [{ id, event, url, error, attempts, last_attempt_at }]    // last 24 h, newest first
} }
```

### `POST /platform/webhook-deliveries/{id}/retry`

Permission `platform.manage` → `{ data: { delivered: bool, status: int|null, delivery: WebhookDelivery|null } }`.
Delivered: removed from the failed list (`delivery: null`). Failed again: `attempts` + 1 and the updated `delivery` is returned.
The attempt runs through the school's own webhook pipeline: signed with the school's secret, pinned to the vetted public
address (a host resolving to a private/loopback address is refused, `status: null`, error "Couldn't connect to the
endpoint."), redirects are never followed (a 3xx counts as a failed answer), and it is recorded in the school's delivery
log and endpoint health as well as the console copy. `404` when the delivery or its school is gone.
Audit (Tenants): `Retried webhook {event} to {url} — delivered (HTTP 200)` / `— failed again (HTTP {status})`.
