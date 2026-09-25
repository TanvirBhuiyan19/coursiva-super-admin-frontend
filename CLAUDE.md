# Coursiva Super Admin (platform console)

React 19 · TypeScript (strict) · Vite · React Router 7 · TanStack Query 5 · Zustand 5 (UI state only) · react-hook-form + zod · MSW (mock API) · Vitest + Testing Library · Playwright.
Plain CSS on design tokens — no UI kit. Design reference: `../design_handoff_coursiva_lms/designs/Super Admin Console.dc.html` (+ handoff `README.md`).
The backend will be Laravel (Sanctum SPA auth). Until then the browser runs the API from MSW (`VITE_ENABLE_MOCKS=true`).

```
npm run dev          # http://localhost:5173 — sign in as sam@coursiva.io / password, 2FA 123456
npm run check        # typecheck + lint (0 warnings) + prettier + unit tests — must pass before you finish
npm run build        # tsc -b && vite build
npm run e2e          # Playwright (needs `npm run dev` or runs its own server)
npm run size         # after a build: bundle budgets (brotli) — CI fails above them
npm run preview:prod # after a build: production bundle + nginx-like serving + server-side mock API (:4174)
```

## Architecture

```
src/
  app/            router.tsx (routes, auto-discovers pages), screens.ts (id/path/title/permission + NAV), guards.tsx, providers.tsx
  config/env.ts   typed env (never read import.meta.env elsewhere)
  lib/api/        client.ts (fetch wrapper: Sanctum CSRF, snake↔camel, ApiError), errors.ts, types.ts (Resource, Paginated)
  lib/            format.ts (money/num/timeAgo/tones), domain.ts (Plan, TenantStatus, Tone…), useUrlState, useDebounced, useForm (zod), queryClient
  components/ui/  primitives (import from '@/components/ui')
  components/shell/ AppShell, Sidebar, Header, CommandPalette, Toasts, RouteErrorBoundary
  features/<name>/
    types.ts      API resource types = the contract for Laravel
    api.ts        query keys + useQuery/useMutation hooks (the ONLY place that calls `api`)
    mock.ts       MSW handlers exporting `handlers` (auto-discovered) + feature-only mock tables
    components/   feature components
    pages/<screenId>.page.tsx   default-exported page, auto-routed by screen id (see app/screens.ts)
    *.test.tsx    integration tests against the mock API
  mocks/          db.ts (collection/singleton registry, persisted to localStorage), collections.ts (core shared tables),
                  derive.ts (server-side business rules), reference.ts (catalogues/plan limits), http.ts (handler helpers)
  store/ui.ts     Zustand: theme, overlays, toasts. NEVER server data.
  styles/         base.css, ui.css, shell.css
docs/api/         API contract, one markdown file per feature — keep it in sync with types.ts and mock.ts
```

## Rules

### Data

- **Server state → TanStack Query. UI state → local `useState` / URL. Never put API data in Zustand.**
- Every endpoint gets: a type in `types.ts`, a hook in `api.ts`, a handler in `mock.ts`, a section in `docs/api/<feature>.md`.
- Query keys: a `<feature>Keys` factory object. After a mutation, invalidate every key it can affect (e.g. `invalidateTenantData(qc, id)` from `features/tenants/api.ts` when tenant status/plan changes; `['overview']` and `['audit']` when counts/audit change; `['platform','status']`, `['shell','badges']` where relevant).
- With `placeholderData: keepPreviousData`, give `useQuery<T>` an explicit type (TS can't infer it through `.then`).
- Toggle-style mutations use optimistic updates with rollback (see `useOptimisticDetail` in `features/tenants/api.ts`).
- Mutation errors toast automatically (queryClient). Forms that show errors inline set `meta: { errorToast: false }` and use `applyServerErrors(form, err)`.
- Anything an operator changes that should persist = an API mutation (settings, toggles, decisions, drafts that are "saved"). Pure view state (filters, tabs, open panels, unsent text) stays client-side. **Filters, search, sort and page go in the URL** via `useUrlState`.
- Money and figures derived from tenants come from the API (computed in `mocks/derive.ts`), never recomputed differently on the client.

### API contract (Laravel)

- snake_case on the wire, camelCase in code — conversion happens only in `lib/api/client.ts`.
- **Never use data values as object keys** in payloads (they'd be case-converted). Use arrays: `[{ segment: 'at_risk', count: 3 }]`.
- Resources `{ data }`; lists `{ data, meta }` via `paginate()`; 422 via `invalid({ field: 'message' })`; 403 via `authorize('perm')`; 404 via `notFound('Thing')`.
- Mock handlers: always `http.<verb>(route('/path'), handle(({ request, params }) => …))`. Validate input like a Laravel FormRequest. Register literal paths before `/:id` paths.
- **Audit entries are written server-side** with `recordAudit(text, category, tenantId?)` inside the handler. The client never logs audit events.
- Feature-only tables: `collection<Row>('name', seed)` / `singleton('name', seed)` from `@/mocks/db` inside your `mock.ts`. Shared tables live in `mocks/collections.ts` (tenants, staff, audit, tickets, invoices, overages, dsars, flags, platformStatus, platformSettings, pricing, apiRateLimits, extensionSettings, extensionInclusions, entitlementOverrides, liveRoomAllowance, rolePermissions, notifications).
- Shared rules live in `mocks/derive.ts` — use them, never re-implement: `tenantMrr`, `tenantHealth`, `tenantHealthScore`, `planLimits`/`effectiveLimits`, `extensionPlans`, `extensionPrice`, `moduleDefaultForPlan`/`moduleOnForPlan`. The ownership table is in `docs/api/README.md`; `src/test/cross-feature.test.ts` locks it in.
- Times are ISO strings; seed relative times with `ago({ h: 3 })` / `fromNow({ d: 4 })`.

### Permissions

- Permissions live in `features/auth/permissions.ts`. Screens declare one in `app/screens.ts`; the router enforces it.
- Hide or disable controls the user can't use: `const can = useCan(); can('tenants.suspend')` or `<Can permission="…">`. The mock API enforces the same rule with `authorize('…')`, and tests cover both.

### UI

- Use `@/components/ui` primitives and `styles/ui.css` classes. Inline `style` only for one-off layout. Don't add global CSS from a feature; if a primitive is missing, say so.
- **Tokens only** — never hardcode a colour that has a token; never `var(--x, fallback)`. Tones: `good | warn | bad | info | flat | accent` via `<Badge tone>`, `<Dot tone>`, `<Bar tone>`, `toneFg()`.
- Every screen handles **loading** (`Skeleton`/`SkeletonRows`), **error** (`ErrorState` with retry, or `QueryState`), and **empty** (`Empty`) states.
- Destructive actions: `<ConfirmButton confirmLabel="Confirm …">` (two-step). Pending mutations disable their button.
- Forms with a Save button track unsaved changes (Save/Discard disabled when clean) and render `<UnsavedChangesGuard when={dirty} />`. Inline settings that save on blur use `CommitNumberInput`.
- Text on accent/saturated backgrounds uses `var(--onAc)`.
- Toasts state the consequence, using the design's copy: "Refunded $249 to Priya Nair — access revoked, receipt emailed".
- Accessibility (WCAG 2.2 AA): real `<button>`/`<a>`/`<Link>` for interactions; every input has a label (`Field` or `aria-label`); toggles need `label`; headings in order (card titles are `<h2>`); lists as `ul/ol`; icons `aria-hidden`; charts get an `sr-only` table. `jsx-a11y` is enforced — a suppression needs a one-line reason.
- Responsive: `grid-kpi`, `grid-2`, `grid-3`; wide tables in `.card.table-scroll` with a `min` width.
- Dates via `timeAgo`, `formatDate`, `formatDateTime`; numbers via `num`, `money`, `moneyFine`, `moneyCompact`.

### Performance

- **Critical path is budgeted** (`scripts/check-bundle.ts`, initial JS ≤ 125 KB brotli). Anything not needed to render the first screen is lazy: overlays via `lazyWithPreload` (`@/lib/lazy`) + `whenIdle` preload; heavy feature UI exported lazily from the feature's `index.ts`.
- Vendor code is split into long-cached chunks (`vendor-react`, `vendor-router`, `vendor-data`, `vendor-forms`) in `vite.config.ts`. Never import zod / react-hook-form from the shell or login.
- **React Compiler** memoizes everything except files using react-hook-form (see `compilerSources`). Don't hand-write `useMemo`/`useCallback`/`memo` for render performance; write plain components. Avoid mutating values during render (the compiler assumes purity; `react-hooks` lint enforces it).
- **Queries are defined once** with `queryOptions` factories (`tenantQueries`, `auditQueries`, …) used by both hooks and prefetchers. A screen can ship `pages/<screenId>.prefetch.ts` exporting `prefetch(qc)`; it runs on nav hover/focus and at navigation (route loader), permission-gated. Warm with `warm(qc.query(options))` — never `prefetchQuery` (deprecated).
- Hover/focus on a row that opens detail should warm that detail query.
- Fonts are self-hosted variable fonts (`--font-body`, `--font-display`, `--font-mono`) with metric-matched fallbacks; never add third-party font/CDN requests.
- Builds emit `.br`/`.gz` (`build/precompress.ts`) and hidden source maps; serve per `deploy/nginx.conf` (immutable `/assets`, no-cache `index.html`, CSP).
- Field performance is reported by `src/lib/vitals.ts` (Web Vitals → `VITE_VITALS_ENDPOINT`, contract in `docs/api/telemetry.md`).

### Architecture boundaries (lint-enforced)

- Features import each other only via `@/features/<name>` (index), `/api`, `/types`, and auth's `Can`/`useCan`/`permissions`. Internal `components/`, `pages/`, `mock` are private.
- App code never imports `@/mocks/*` (only `mock.ts` files and tests).

### Quality

- TypeScript strict + `noUncheckedIndexedAccess`; ESLint `strictTypeChecked` + react-hooks + jsx-a11y, **0 warnings**; Prettier.
- Each feature ships integration tests (`renderApp(path)` + `signInAs(role)` from `@/test/utils`; every role has an active seeded user, incl. Read-only `noah@coursiva.io`) covering: the list renders, a key mutation persists (assert on the mock table), validation errors show, and a restricted role can't see/do the privileged action.
- No `console.log`. No `any`. No `// @ts-ignore`.
