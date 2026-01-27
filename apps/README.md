# Apps

This directory contains applications and services that may depend on packages from the `packages/` directory.

## Creating a New App

1. Create a new directory for your app
2. Initialize with `npm init` or create a `package.json` manually
3. Add dependencies (including local packages from `packages/`)
4. Build your application

Example app structure:
```
apps/
  my-app/
    src/
      index.ts
    package.json
    tsconfig.json
    README.md
```
