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

Start everything from the monorepo root with `npm run dev` (see the root README); the dev server
refuses to start without `MONOREPO_DEV=true`. The frontend runs on http://localhost:9000.

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
│   ├── boot/        # Boot files: fetch headers (session token), login and kiosk (auth.ts)
│   ├── components/  # Vue components
│   ├── layouts/     # Layout components
│   ├── pages/       # Page components
│   ├── router/      # Vue Router configuration
│   ├── services/    # One file per backend domain (fetch wrappers)
│   ├── stores/      # Pinia stores (user-store holds the login session)
│   ├── utils/       # Entrance kiosk and machine terminal keys, API URL
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
