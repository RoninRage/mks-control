# MKS Control Monorepo

This is a monorepo managed with npm workspaces containing the MKS Control application suite.

## Structure

- `packages/` - Shared packages and libraries
- `apps/` - Applications and services
  - `frontend/` - Quasar Framework web application (Vue 3 + TypeScript)
- `nfc-bridge/` - NFC reader bridge service (ACR122U -> Auth Gateway)

## Getting Started

```bash
# Install dependencies
npm install

# Start all services (frontend, backend, nfc-bridge)
npm run dev

# Build all packages
npm run build

# Run tests
npm run test

# Run linting
npm run lint
```

**Note:** `NODE_ENV` is automatically set to `development` for local development, so you don't need to configure it manually.

## Running Services

### Start All Services

```bash
# From the root directory, this starts all services:
npm run dev
```

This unified command starts:

- **Backend (Auth Gateway)** - API and WebSocket server on port 3000
- **Frontend (Quasar PWA)** - Development server on port 5173
- **NFC Bridge** - NFC reader bridge service

### Test a Tag Event

```bash
curl -X POST http://localhost:3000/api/auth/tag \
  -H "Content-Type: application/json" \
  -H "x-device-id: dev-reader-01" \
  -d '{"type":"tag","uid":"04A224B1C8","source":"acr122u"}'
```

Open the frontend in a browser (http://localhost:5173) and watch for connection status and tag events on the index page.

### Running Individual Services

If you need to run services separately:

```bash
# Backend only
cd apps/backend
npm install
npm run dev

# Frontend only
cd apps/frontend
npm install
npm run dev

# NFC Bridge only
cd nfc-bridge
npm install
cp .env.example .env
npm run dev
```

### Deployment Notes (Raspberry Pi)

- Set AUTH_WS_URL to the backend WebSocket endpoint (for example, wss://pi-host/ws/auth).
- Ensure the backend listens on the Pi and forwards tag events to /api/auth/tag.
- Update the x-device-id header from your NFC bridge to identify the reader.
- For NFC bridge: Set GATEWAY_URL to the Pi-accessible Auth Gateway base URL.
- Ensure pcscd is installed and running on the Pi.
- Use a unique DEVICE_ID per kiosk.

## Frontend Application

The frontend is built with:

- **Quasar Framework** - Enterprise-ready Vue.js framework
- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe development
- **Pinia** - Modern state management
- **Vite** - Next-generation build tool
- **PWA Support** - Progressive Web App capabilities

See [apps/frontend/README.md](apps/frontend/README.md) for more details.

## Adding a New Package

Create a new directory under `packages/` or `apps/` with its own `package.json`.

Example:

```bash
mkdir packages/my-package
cd packages/my-package
npm init -y
```

## Workspace Commands

Run a command in a specific workspace:

```bash
npm run <script> --workspace=<package-name>
```

Run a command in all workspaces:

```bash
npm run <script> --workspaces
```
