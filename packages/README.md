# Packages

This directory contains shared packages and libraries used across the monorepo.

## Creating a New Package

1. Create a new directory for your package
2. Initialize with `npm init` or create a `package.json` manually
3. Add your package code
4. Reference it from other packages using the package name

Example package structure:
```
packages/
  my-package/
    src/
      index.ts
    package.json
    tsconfig.json
    README.md
```
