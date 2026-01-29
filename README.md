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

# Start the frontend development server
cd apps/frontend
npm run dev

# Build all packages
npm run build

# Run tests
npm run test

# Run linting
npm run lint
```

## Auth Gateway (Backend)

The backend provides the tag ingest endpoint and WebSocket broadcast.

### Run the backend

```bash
cd apps/backend
npm install
npm run dev
```

### Test a tag event

```bash
curl -X POST http://localhost:3000/api/auth/tag \
  -H "Content-Type: application/json" \
  -H "x-device-id: dev-reader-01" \
  -d '{"type":"tag","uid":"04A224B1C8","source":"acr122u"}'
```

Open the frontend in a browser and navigate to /lock to see events.

## Tag Unlock (Frontend)

### Run the Quasar PWA

```bash
cd apps/frontend
npm install
npm run dev
```

### Deployment notes (Raspberry Pi)

- Set AUTH_WS_URL to the backend WebSocket endpoint (for example, wss://pi-host/ws/auth).
- Ensure the backend listens on the Pi and forwards tag events to /api/auth/tag.
- Update the x-device-id header from your NFC bridge to identify the reader.

## End-to-End (Gateway + PWA + NFC Bridge)

1. Start the backend:

```bash
cd apps/backend
npm install
npm run dev
```

2. Start the Quasar PWA:

```bash
cd apps/frontend
npm install
npm run dev
```

3. Start the NFC bridge:

```bash
cd nfc-bridge
npm install
cp .env.example .env
npm run dev
```

4. Tap a NFC tag: the bridge posts to the gateway, and the PWA unlocks via WS.

### Raspberry Pi deployment notes

- Set GATEWAY_URL to the Pi-accessible Auth Gateway base URL.
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
