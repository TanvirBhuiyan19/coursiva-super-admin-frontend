# Coursiva — Super Admin Console

The platform console Coursiva staff use to run the platform above the tenants: provisioning, revenue,
support, trust & safety, infrastructure and policy. Built from the high-fidelity design in
`../design_handoff_coursiva_lms/designs/Super Admin Console.dc.html`.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

The app runs against a **mock API** in the browser (Mock Service Worker) until the Laravel backend exists.
Sign in with any demo account — password `password`, two-factor code `123456`:

| Role      | Email               |
| --------- | ------------------- |
| Owner     | `sam@coursiva.io`   |
| Admin     | `priya@coursiva.io` |
| Support   | `lee@coursiva.io`   |
| Finance   | `omar@coursiva.io`  |
| Read-only | `noah@coursiva.io`  |

Mock data persists in `localStorage` (clear site data to reset).

## Scripts

| Command                              | What it does                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm run dev`                        | Dev server with the mock API                                                                   |
| `npm run check`                      | Typecheck + lint (0 warnings) + format check + unit/integration tests — the pre-merge gate     |
| `npm run build`                      | Production build (expects the real API; the mock API is not bundled)                           |
| `npm run build:demo`                 | Production build that includes the mock API, for review deployments                            |
| `npm run size`                       | Bundle budgets (Brotli) for the last build — also runs in CI                                   |
| `npm run preview:prod`               | Serves the production build like nginx (Brotli, caching) with the mock API server-side, :4174  |
| `npm test` / `npm run test:coverage` | Vitest                                                                                         |
| `npm run e2e`                        | Playwright: every screen in light + dark with axe (WCAG 2.2 AA) scans, key flows, phone widths |

Git hooks (Husky): pre-commit runs ESLint + Prettier on staged files; pre-push runs the typecheck.
CI: `.github/workflows/ci.yml` runs the check, build and e2e jobs.

## Configuration

Copy `.env.example` to `.env.local` and adjust:

| Variable            | Purpose                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| `VITE_API_URL`      | Laravel base URL, e.g. `https://api.coursiva.io` (empty = same origin) |
| `VITE_API_PREFIX`   | API prefix, default `/api/v1/admin`                                    |
| `VITE_ENABLE_MOCKS` | `true` serves the API from Mock Service Worker                         |
| `VITE_SENTRY_DSN`   | Error reporting (hook in `src/lib/reportError.ts`)                     |

## Stack

React 19 · TypeScript (strict) · Vite · React Router 7 · TanStack Query 5 (server state) · Zustand (UI state) ·
react-hook-form + zod · MSW · Vitest + Testing Library · Playwright + axe. No UI kit — plain CSS on design
tokens: six brand themes × light/dark, every colour derived from the theme hue in `oklch()`.

## Performance

Measured with Chrome at 4× CPU throttling on a throttled connection, production build served like
`deploy/nginx.conf` (median of 3 cold loads):

|                                    | Before   | After         |
| ---------------------------------- | -------- | ------------- |
| Login — first paint                | 1,384 ms | **~820 ms**   |
| Login — JavaScript downloaded      | 376 KB   | **123 KB**    |
| Login — main-thread blocking (TBT) | 188 ms   | **~85 ms**    |
| Signed-in Tenants — data on screen | 1,962 ms | **~1,450 ms** |

Techniques: critical-path diet (lazy overlays, no form libraries on login), long-cached vendor chunks,
React Compiler, self-hosted subset variable fonts with preload and metric-matched fallbacks, intent prefetching
(code + data on hover/focus and at navigation, permission-gated, with a cold-load permission hint),
Brotli/gzip pre-compression, immutable asset caching, hidden source maps, bundle budgets in CI and
real-user Web Vitals reporting. Details in `CLAUDE.md` → Performance.

## Architecture

Feature-sliced: each feature in `src/features/<name>/` owns its API types (the contract), hooks, mock
handlers, components, pages and tests. Pages are routed automatically from `pages/<screenId>.page.tsx`.
See **`CLAUDE.md`** for the full conventions and **`docs/api/`** for the API contract.

### Connecting the Laravel backend

1. Implement the endpoints in `docs/api/` (start with `README.md` — conventions, Sanctum SPA auth,
   validation and error shapes, audit rules and the table of shared business rules).
   Each feature's `mock.ts` is a working reference implementation, and the tests describe the behaviour.
2. Set `VITE_API_URL`, `VITE_ENABLE_MOCKS=false`, and configure Sanctum stateful domains + CORS with credentials.
3. Run the e2e suite against it: `E2E_BASE_URL=https://console.staging… npm run e2e`.

## Quality bar

- Strict TypeScript with `noUncheckedIndexedAccess`; ESLint `strictTypeChecked` + react-hooks + jsx-a11y.
- 180 unit/integration tests (every feature: rendering, persistence, validation, permissions) plus
  cross-feature contract tests for shared business rules.
- 90 end-to-end tests: all 28 screens in both themes with zero serious/critical axe violations, no console
  errors, no horizontal overflow at phone width; command palette, focus trapping, URL-persisted filters, sign-out.
- Role-based permissions enforced by the API and reflected in the UI; server-side audit trail;
  two-step destructive actions; unsaved-changes protection on forms.
