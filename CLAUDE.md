# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MKS Control is a Maker Space management system — NFC-based access control, equipment tracking, and member administration. It is an npm workspace monorepo with three runnable services and a shared types package.

## Commands

```bash
# Start all services (required — enforces MONOREPO_DEV=true env guard)
npm run dev

# Start with database reset
npm run dev:reset

# Build all workspaces
npm run build

# Lint / test — root scripts use --if-present (only the frontend defines lint/test)
npm run lint
npm run test
npm run format --workspace=apps/frontend

# E2E tests (Playwright) — there are no unit tests
npm run test:e2e
npm run test:e2e:ui        # Interactive UI
npm run test:e2e:headed    # Headed browser
npm run test:e2e:debug     # Debug mode

# Single spec / single test (run setup-test-env first — `pretest:e2e` only fires via npm run)
node scripts/setup-test-env.js && npx playwright test tests/e2e/auth.spec.ts
npx playwright test -g "test name"

# Run a command in a single workspace
npm run <script> --workspace=apps/backend
npm run <script> --workspace=apps/frontend
npm run <script> --workspace=nfc-bridge
```

**Important:** Services enforce `MONOREPO_DEV=true` — always start via `npm run dev` from root, not directly within workspace directories. `scripts/dev.js` runs preflight checks, starts CouchDB via `docker compose`, spawns each workspace's `dev` script, and stops Docker on Ctrl+C. The root `.npmrc` sets `workspaces=false`, so workspace-wide commands need an explicit `--workspaces`/`--workspace=` flag.

### E2E Test Environment

- `scripts/setup-test-env.js` writes a repo-root `.env.test` with uniquely named, throwaway CouchDB databases and `ADMIN_TAG_UIDS=test-admin-tag-001`.
- **If `.env.test` exists, the backend auto-switches to test mode** (`server.ts` loads it instead of `.env`). Delete a leftover `.env.test` before normal dev runs.
- Playwright's `webServer` runs `scripts/dev-e2e.js` (reuses already-running servers); the NFC bridge is skipped when `NODE_ENV=test`.
- `tests/global-setup.ts` creates and seeds the test DBs via `tests/helpers/` (`database.ts`, `factories.ts`, `auth.ts`); tests run serially (1 worker, Chromium only).
- `tests/helpers/mockShelly.ts` starts fake Gen1/Gen2 Shellys on `127.0.0.1:<random port>` (relays, metering, inputs, lights, covers, auth, offline). `.env.test` sets `SHELLY_PASSWORD=test-shelly-secret` to match.
- Quasar puts `data-testid` of a `q-input` on the native `<input>`, so fill it directly (`getByTestId('x').fill(...)`).

### Environment Setup

Copy `.env.example` to `.env` in each service before first run:

- `apps/backend/.env` — `COUCHDB_URL`, `COUCHDB_USER`, `COUCHDB_PASSWORD`, `ADMIN_TAG_UIDS` (comma-separated UIDs for admin NFC tags), `SEED_DATA`, `SEED_MODE`
- `nfc-bridge/.env` — `GATEWAY_URL`, `DEVICE_ID`, `SOURCE`, `DEBOUNCE_MS`

The `npm run dev` script starts Docker (CouchDB) automatically.

### Test a Tag Event (simulates NFC scan)

```bash
curl -X POST http://localhost:3000/api/auth/tag \
  -H "Content-Type: application/json" \
  -H "x-device-id: dev-reader-01" \
  -d '{"type":"tag","uid":"04A224B1C8","source":"acr122u"}'
```

## Cloud Sessions (claude.ai/code)

Node 22 is pinned via `.nvmrc`. In cloud sessions `CLAUDE_CODE_REMOTE=true` is set (never locally).

- **Environment setup script** — `scripts/cloud-env-setup.sh` is pasted into the environment settings on claude.ai/code (not run from the repo). It runs as root before the session, and its results are cached: apt packages for the native pcsclite build, Node 22, Playwright Chromium with system deps, and the `couchdb:3.3` image. Running containers and processes are not cached.
- **SessionStart hook** — `.claude/settings.json` runs `scripts/cloud-session-start.sh` on startup/resume. It exits immediately unless `CLAUDE_CODE_REMOTE=true`. Otherwise it starts `dockerd` if needed, deletes a leftover `.env.test`, runs `npm ci --workspaces --include-workspace-root`, runs `npx playwright install chromium`, and starts CouchDB (`docker compose up -d couchdb`, waits for `/_up`). Step logs go to `$TMPDIR/mks-cloud-session/`.

**Start services individually** (e.g. in the background). `npm_config_workspaces=true` overrides the root `.npmrc`; without it `npm run` inside a workspace fails:

```bash
# Backend (port 3000)
cd apps/backend && MONOREPO_DEV=true npm_config_workspaces=true npm run dev

# Frontend (port 9000)
cd apps/frontend && MONOREPO_DEV=true npm_config_workspaces=true \
  API_BASE_URL=http://localhost:3000/api npm run dev
```

`npm run dev` from the root also works; it skips the NFC bridge when `CLAUDE_CODE_REMOTE=true` or no `pcscd` is running.

**E2E tests:** `API_BASE_URL=http://localhost:3000/api npm run test:e2e` (CouchDB must be up; Playwright starts backend and frontend through `scripts/dev-e2e.js` unless they are already running on 3000/9000). Without `API_BASE_URL` the frontend calls `localhost:9000/api`, which has no proxy, and most page tests fail.

**No NFC hardware in the cloud:** the NFC bridge does not run. Simulate tag scans with `POST /api/auth/tag` (see "Test a Tag Event" above).

**Branch rule:** never commit or push directly to `master` — Watchtower deploys every `master` push to production. Always work on a feature branch and open a PR.

## Architecture

```
apps/frontend/     Quasar Vue 3 PWA          → port 9000 (dev)
apps/backend/      Express REST + WebSocket  → port 3000
nfc-bridge/        NFC reader bridge         → no port (pushes to backend)
packages/shared-types/  TypeScript types shared across all workspaces
```

**Data flow:** NFC reader → nfc-bridge → `POST /api/auth/tag` → backend WebSocket broadcast → frontend real-time update.

**Database:** CouchDB 3.3 on port 5984 via Docker (dev creds `admin`/`password`, Fauxton at `http://localhost:5984/_utils`). Three databases, names overridable by env:

- `mks_members` (`COUCHDB_DB_NAME`) — members, areas and equipment, told apart by a `type` field (`migrateDocTypes` backfills it)
- `mks_tags` (`COUCHDB_TAGS_DB_NAME`) — NFC tags linked to members by `memberId`
- `mks_audit` (`COUCHDB_AUDIT_DB_NAME`) — audit log, with a scheduled retention cleanup

Startup order in `server.ts`: init DB → audit retention → `migrateDocTypes` → `migrateBackupAdmin` → seed (if `SEED_DATA=true`; `SEED_MODE=mass` uses `seedMass.ts`) → `migrateTagsToCollection` (moves legacy `member.tagUid` into the tags DB).

**Auth model (no tokens/sessions on the backend):** a tag scan hits `POST /api/auth/tag`, the backend resolves the member/admin and broadcasts a `TagEvent` over the WebSocket at `/ws/auth`. The frontend (`boot/auth.ts`) sets the role in `user-store` and goes to `/dashboard`. Scanning a tag while logged in logs out, unless "tag assignment mode" is active (used when assigning a tag to a member). Roles in priority order: `admin`, `vorstand`, `bereichsleitung`, `mitglied`. After login, `boot/fetch-headers.ts` patches `window.fetch` to add `X-Source`, `X-User-ID`, `X-User-Role` and `X-Device-ID`. Backend routes authorize and audit using these headers.

### Backend (`apps/backend/src/`)

- `server.ts` — Express entry point, mounts routes and WebSocket
- `routes/` — One file per domain: `authRoutes`, `memberRoutes`, `tagRoutes`, `areaRoutes`, `equipmentRoutes`, `auditRoutes`, `shellyRoutes` (admin only, `/api/shelly/devices`)
- `shelly/` — Shelly drivers: `drivers/gen1.ts` (REST, HTTP Basic) and `drivers/gen2.ts` (JSON-RPC, HTTP Digest, also Gen3/Gen4), `driver.ts` picks one via `GET /shelly`. `host.ts` only accepts local IPv4 addresses. Plan for the machine control: `docs/shelly-plan.md`
- `ws/authWs.ts` — WebSocket server for real-time tag events
- `db/couchdb.ts` — CouchDB connection and initialization
- `db/migrations.ts` — Schema migrations
- `db/seed*.ts` — Individual seeders; `seedMass.ts` seeds 150 members / 20 areas / 200 equipment
- `types/` — Re-exports from `shared-types` (don't define domain types here directly)
- `GET /health` — Backend health check endpoint

### Frontend (`apps/frontend/src/`)

- `boot/` — Quasar boot files: `ios-detect.ts`, `fetch-headers.ts`, `theme.ts`, `auth.ts` (route guards), `apply-theme.ts` — order matters
- `router/routes.ts` — All application routes
- `stores/` — Pinia stores: `auth.ts`, `user-store.ts`, `ausstattung-store.ts`
- `services/` — One file per domain, wraps `fetch` calls to the backend
- `pages/` — Route-level components
- `components/` — Reusable UI components
- `css/app.scss` — Global styles including dark mode overrides

### Shared Types (`packages/shared-types/src/index.ts`)

Single file exporting all domain interfaces: `Member`, `Area`, `Equipment`, `Tag`, `AuthEvent`, `ReaderEvent`, etc. Both backend and frontend import from this package.

## Code Standards

### Vue Components

- Use `<script setup lang="ts">` exclusively
- Always set `defineOptions({ name: 'ComponentName' })`
- Scoped styles: `<style scoped lang="scss">`
- Import with path aliases: `components/`, `layouts/`, `pages/`
- File names: PascalCase for components/pages, camelCase for utilities

### TypeScript

- Strict mode everywhere — no `any`, use `unknown` + type guards
- Interfaces over type aliases for object shapes
- Explicit parameter and return type annotations

### Formatting (Prettier)

- Single quotes, semicolons, trailing commas (`es5`), 100-char print width, 2-space indent

### Styling & Dark Mode

- SCSS with BEM naming (`.block__element--modifier`)
- Brand colors: `primary: #111111`, `secondary: #FFFFFF`, `dark background: #0B0B0C`
- Use Quasar utility classes for layout/spacing
- All custom icons use `currentColor` for dark mode compatibility
- Dark mode overrides go in `apps/frontend/src/css/app.scss` (not scoped component styles)
- Buttons/icons with `color="primary"`: must have explicit dark mode rules targeting `.q-btn.text-primary` / `.q-icon.text-primary` using `!important`

```scss
// Pattern for primary color dark mode overrides
.q-btn.text-primary, .q-icon.text-primary {
  color: #111111 !important;
}
body.body--dark {
  .q-btn.text-primary, .q-icon.text-primary {
    color: #ffffff !important;
  }
}
```

### Touchscreen Usability

- Minimum 44×44px touch targets for all interactive elements
- No hover-only interactions — use click/focus/active states
- At least 8–16px spacing between interactive elements
- Use Quasar responsive utilities (`.xs`, `.sm`, etc.) for mobile layout

### Other

- UI text and role names are German (e.g. `ausstattung` = equipment, `vorstand` = board).
