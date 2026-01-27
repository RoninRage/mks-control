# Quick Start Guide

## Initial Setup

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Start Development**
   ```bash
   cd apps/frontend
   npm run dev
   ```

The development server will open automatically in your browser at `http://localhost:9000`.

## Available Commands

### Frontend Application

```bash
cd apps/frontend

# Start development server
npm run dev

# Build for production (SPA)
npm run build

# Build as PWA
npm run build:pwa

# Lint code
npm run lint

# Format code
npm run format

# Generate Quasar types
npm run prepare
```

## Project Structure

```
mks-control/
├── apps/
│   └── frontend/          # Quasar web application
│       ├── src/
│       │   ├── assets/    # Static assets
│       │   ├── boot/      # App initialization
│       │   ├── components/# Vue components
│       │   ├── css/       # Global styles
│       │   ├── layouts/   # Layout components
│       │   ├── pages/     # Page components
│       │   ├── router/    # Vue Router
│       │   ├── stores/    # Pinia stores
│       │   └── App.vue    # Root component
│       ├── src-pwa/       # PWA configuration
│       └── quasar.config.ts
├── packages/              # Shared packages (future)
└── package.json          # Root workspace config
```

## Technology Stack

- **Quasar Framework 2.17+** - Vue.js framework
- **Vue 3.5+** - Progressive JavaScript framework
- **TypeScript 5.5+** - Type safety
- **Pinia 2.2+** - State management
- **Vue Router 4.5+** - Routing
- **Vite 6.0+** - Build tool
- **Material Design** - UI/UX

## Next Steps

1. Start building your components in `apps/frontend/src/components/`
2. Add pages in `apps/frontend/src/pages/`
3. Create stores in `apps/frontend/src/stores/`
4. Configure routes in `apps/frontend/src/router/routes.ts`

## Documentation

- [Quasar Documentation](https://quasar.dev)
- [Vue 3 Documentation](https://vuejs.org)
- [Pinia Documentation](https://pinia.vuejs.org)
- [TypeScript Documentation](https://www.typescriptlang.org)

## Troubleshooting

If you see TypeScript errors in your IDE:

1. Reload the VS Code window (Ctrl+Shift+P → "Reload Window")
2. Run `npm run prepare` in apps/frontend
3. Check that `.quasar/tsconfig.json` exists

For build issues:

1. Delete `node_modules` and `package-lock.json`
2. Run `npm install` again
3. Clear Quasar cache: delete `.quasar` folder
