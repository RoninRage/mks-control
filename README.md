# MKS Control Monorepo

This is a monorepo managed with npm workspaces.

## Structure

- `packages/` - Shared packages and libraries
- `apps/` - Applications and services

## Getting Started

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm run test

# Run linting
npm run lint

# Start development mode
npm run dev
```

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
