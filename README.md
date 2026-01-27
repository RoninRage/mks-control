# MKS Control Monorepo

This is a monorepo managed with npm workspaces containing the MKS Control application suite.

## Structure

- `packages/` - Shared packages and libraries
- `apps/` - Applications and services
  - `frontend/` - Quasar Framework web application (Vue 3 + TypeScript)

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
