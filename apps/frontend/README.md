# MKS Control Frontend

A Quasar Framework application built with Vue 3, TypeScript, and Vite.

## Features

- **Quasar Framework**: Enterprise-ready Vue.js framework
- **TypeScript**: Full TypeScript support with strict mode
- **Pinia**: Modern state management
- **Vue Router**: Official routing solution
- **ESLint & Prettier**: Code quality and formatting
- **PWA Ready**: Progressive Web App capabilities
- **Material Design**: Beautiful Material Design components

## Development Setup

```bash
# Install dependencies (from monorepo root)
npm install

# Start development server
cd apps/frontend
npm run dev
```

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run build:pwa    # Build as PWA
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run prepare      # Generate Quasar types
```

## Project Structure

```
apps/frontend/
├── public/          # Static assets
├── src/
│   ├── assets/      # Images, fonts, etc.
│   ├── boot/        # Boot files (app initialization)
│   ├── components/  # Vue components
│   ├── layouts/     # Layout components
│   ├── pages/       # Page components
│   ├── router/      # Vue Router configuration
│   ├── stores/      # Pinia stores
│   ├── css/         # Global styles
│   ├── App.vue      # Root component
│   └── main.ts      # Application entry
├── quasar.config.ts # Quasar configuration
└── tsconfig.json    # TypeScript configuration
```

## Building for Production

```bash
# SPA mode
npm run build

# PWA mode
npm run build:pwa
```

## Customize Configuration

See [Quasar Configuration Reference](https://v2.quasar.dev/quasar-cli-vite/quasar-config-js).
