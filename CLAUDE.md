# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MKS Control is a Maker Space management system — NFC-based access control, equipment tracking, and member administration. It is an npm workspace monorepo with three runnable services and a shared types package.

## Commands

```bash
# Start all services (required — enforces MONOREPO_DEV=true env guard)
npm run dev

# Start with database reset
npm run dev --reset

# Build all workspaces
npm run build

# Lint all workspaces
npm run lint

# E2E tests (Playwright)
npm run test:e2e
npm run test:e2e:ui        # Interactive UI
npm run test:e2e:debug     # Debug mode

# Run a command in a single workspace
npm run <script> --workspace=apps/backend
npm run <script> --workspace=apps/frontend
npm run <script> --workspace=nfc-bridge
```

**Important:** Services enforce `MONOREPO_DEV=true` — always start via `npm run dev` from root, not directly within workspace directories. Use `npm run dev:reset` to reset the CouchDB database on startup.

### Test a Tag Event (simulates NFC scan)

```bash
curl -X POST http://localhost:3000/api/auth/tag \
  -H "Content-Type: application/json" \
  -H "x-device-id: dev-reader-01" \
  -d '{"type":"tag","uid":"04A224B1C8","source":"acr122u"}'
```

## Architecture

```
apps/frontend/     Quasar Vue 3 PWA          → port 9000 (dev)
apps/backend/      Express REST + WebSocket  → port 3000
nfc-bridge/        NFC reader bridge         → no port (pushes to backend)
packages/shared-types/  TypeScript types shared across all workspaces
```

**Data flow:** NFC reader → nfc-bridge → `POST /api/auth/tag` → backend WebSocket broadcast → frontend real-time update.

**Database:** CouchDB on port 5984 via Docker. Backend handles migrations (`src/db/migrations.ts`) and seeding (`src/db/seed*.ts`).

### Backend (`apps/backend/src/`)

- `server.ts` — Express entry point, mounts routes and WebSocket
- `routes/` — One file per domain: `authRoutes`, `memberRoutes`, `tagRoutes`, `areaRoutes`, `equipmentRoutes`, `auditRoutes`
- `ws/authWs.ts` — WebSocket server for real-time tag events
- `db/couchdb.ts` — CouchDB connection and initialization
- `db/migrations.ts` — Schema migrations
- `types/` — Re-exports from `shared-types` (don't define domain types here directly)

### Frontend (`apps/frontend/src/`)

- `boot/` — Quasar boot files: `auth.ts` (route guards), `theme.ts`, `fetch-headers.ts`
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

### Styling & Dark Mode

- SCSS with BEM naming (`.block__element--modifier`)
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
