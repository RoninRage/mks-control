# AI Development & Debugging Guide

## Single Entry Point (MANDATORY)

**There is exactly ONE way to run this application:**

```bash
npm run dev
```

### Hard Rules

1. **No partial startups** - Never start backend/frontend separately
2. **No port direct access** - Always use `npm run dev`
3. **No hardcoded service URLs** - Always use FRONTEND_URL env var
4. **No manual orchestration** - scripts/dev.js is the sole authority

### What `npm run dev` Does

```
1. Runs preflight checks (Node version, env vars, port availability)
2. Sets MONOREPO_DEV=true environment variable
3. Starts Backend (port 3000) with guardrail enforcement
4. Starts Frontend (port 9000) with guardrail enforcement
5. Waits for service health checks
6. Displays access URLs
```

**Services automatically exit if MONOREPO_DEV !== 'true'.**

## Service Startup Guardrails

### Backend Startup Check

Backend (`apps/backend/src/server.ts`):

```typescript
if (process.env.MONOREPO_DEV !== 'true') {
  console.error('❌ ERROR: Backend must be started via: npm run dev');
  console.error('Do not run backend directly');
  process.exit(1);
}
```

**Backend will refuse to start if:**

- Started with `npm run dev --workspace apps/backend`
- Started with `npm dev` in apps/backend/ directory
- Started with any method other than root `npm run dev`

### Frontend Startup Check

Frontend (`apps/frontend/src/boot/auth.ts`):

```typescript
if (typeof window !== 'undefined' && process.env.MONOREPO_DEV !== 'true') {
  console.error('❌ ERROR: Frontend must be started via: npm run dev');
  console.error('Do not run frontend directly');
  window.location.href = 'about:blank';
}
```

**Frontend will refuse to run if:**

- Accessed via hardcoded port (e.g., http://localhost:9000)
- Quasar dev server starts outside root npm run dev
- MONOREPO_DEV not set in environment

## VS Code Integration

### Debug Configuration

**File:** `.vscode/launch.json`

**Default Debug Configuration:** "Debug Full Stack"

```
Press F5 or use VS Code Debug menu → Debug Full Stack
↓
Launches: npm run dev
↓
Full stack starts with proper guardrails
```

### Build Tasks

**File:** `.vscode/tasks.json`

**Available Tasks:**

- Start Infra - Runs preflight checks
- Start API - Backend only (calls npm run dev)
- Start Frontend - Frontend only (calls npm run dev)
- Start Workers - Placeholder for future services
- Start All - **Default build task** (calls npm run dev)

**Default Build Task:** Ctrl+Shift+B → "Start All" → `npm run dev`

## Chrome MCP Alignment

Chrome MCP must connect to frontend via environment variable:

```bash
FRONTEND_URL=http://localhost:9000
```

**Do NOT:**

- Hardcode port 9000
- Use relative URLs for external connections
- Connect to different port numbers

**Do:**

- Use `FRONTEND_URL` env var from dev.js
- Connect only after health checks pass

## Environment Variables

### Required

Set in shell before running `npm run dev`:

```bash
NODE_ENV=development
```

### Seeding (Default and Mass)

Seeding is controlled by env vars and runs only when `SEED_DATA=true`.

```bash
# Default fixture seeding
SEED_DATA=true
SEED_MODE=default

# Mass seed mode (generates realistic volumes)
SEED_DATA=true
SEED_MODE=mass
SEED_MEMBERS=150
SEED_AREAS=20
SEED_EQUIPMENT=200
```

Mass mode creates deterministic IDs (e.g., `member-001`, `area-001`, `equipment-001`) so you can re-run it without duplicates.

### Automatically Set by dev.js

```bash
MONOREPO_DEV=true          # Guardrail enforcement
FRONTEND_URL=http://localhost:9000  # Chrome MCP access
NODE_ENV=development       # Default if not set
```

## Architecture Overview

### Tech Stack

- **Frontend**: Vue 3 + Quasar on port 9000
- **Backend**: Express.js + TypeScript on port 3000
- **Authentication**: Tag-based (NFC/RFID via ACR122U)
- **Build System**: npm workspaces monorepo
- **Type Safety**: TypeScript strict mode across all packages

### Monorepo Structure

```
mks-control/
├── apps/
│   ├── backend/        # Express API server
│   ├── frontend/       # Vue 3 application
├── docs/               # Documentation
├── nfc-bridge/         # NFC reader interface
├── packages/           # Shared libraries
├── scripts/            # Development infrastructure
│   ├── dev.js         # SOLE ORCHESTRATOR
│   ├── preflight.js   # Health checks
│   └── wait-for.js    # Service readiness
└── AI.md              # This file
```

## Key Features

### Admin Authentication System

**Hardcoded Admin Tags (configured via env vars):**

- Default: `2659423e`, `ab9c423e`
- Configuration: `apps/backend/.env` → `ADMIN_TAG_UIDS`

**Flow:**

1. Tag scanned → Backend validates against `ADMIN_TAG_UIDS`
2. Backend attaches `isAdmin: true` to TagEvent
3. Frontend boot detects admin tag
4. Auto-login as "admin" role
5. Redirects directly to dashboard (skips role selection)

### Members Management

**Endpoints:**

- `GET /api/members` - Returns list of organization members
- Mock data: 8 predefined members with firstName/lastName

**Frontend Pages:**

- `DashboardPage.vue` - "Mitglieder verwalten" button for Admin/Vorstand roles
- `MembersPage.vue` - Table view with edit/delete actions
  - Edit: Shows notification (future implementation)
  - Delete: Removes member locally with confirmation

## API Reference

### Authentication Routes

**Tag Received Event:**

```javascript
// Broadcast via WebSocket when tag scanned
{
  uid: "2659423e",
  isAdmin: true,  // Optional: true only for hardcoded admin tags
  timestamp: 1234567890
}
```

### Members Routes

**GET /api/members**

```javascript
Response: {
  ok: true,
  data: [
    { id: 1, firstName: "Max", lastName: "Mustermann", role: "admin" },
    // ... more members
  ]
}
```

## Type Definitions

### Core Types

**TagEvent** (`src/services/authEventSource.ts`):

```typescript
interface TagEvent {
  uid: string;
  isAdmin?: boolean; // Optional field for admin tags
  timestamp?: number;
}
```

**Member** (`src/types/members.ts`):

```typescript
interface Member {
  id: number;
  firstName: string;
  lastName: string;
  role?: string;
}
```

## Debugging Common Issues

### Issue: "Backend must be started via: npm run dev"

**Cause:** Backend started outside root orchestrator

**Fix:** Use root command only:

```bash
npm run dev    # ✅ CORRECT
npm run dev -w apps/backend  # ❌ FORBIDDEN
cd apps/backend && npm run dev  # ❌ FORBIDDEN
```

### Issue: "Frontend must be started via: npm run dev"

**Cause:** Frontend dev server started separately or direct port access

**Fix:** Always use root orchestrator:

```bash
npm run dev    # ✅ CORRECT
# Do not access http://localhost:9000 until npm run dev completes
```

### Issue: "Port 3000 already in use"

```bash
# Find process using port 3000 (Windows)
netstat -ano | findstr :3000

# Kill process by PID
taskkill /PID <PID> /F
```

### Issue: "NODE_ENV not set"

Preflight check requires `NODE_ENV` environment variable. Development startup sets this automatically to `development`, but check:

```bash
# Windows
echo %NODE_ENV%

# Should output: development
```

### Issue: "Node version mismatch"

Project requires Node 18+. Check your version:

```bash
node --version  # Should be v18.0.0 or higher
```

### Issue: "Members API returning 404"

1. Verify backend is running on port 3000: `curl http://localhost:3000/health`
2. Check CORS is enabled: `apps/backend/src/server.ts` should have `app.use(cors())`
3. Verify route is registered: Check backend startup logs for `/api/members`

### Issue: "Admin tag not triggering auto-login"

1. Verify tag UID is in `ADMIN_TAG_UIDS` environment variable
2. Check backend logs: Should show `[auth-routes] Tag received: {uid}, isAdmin: true`
3. Check frontend boot handler is active: Open DevTools, scan tag, check console

### Issue: "Dark mode table not visible"

MembersPage.vue uses CSS variables `--ms-surface` and `--ms-surface-2`. Verify:

1. CSS variables are defined in `src/css/app.scss`
2. Dark mode CSS is properly scoped: `:deep(.body--dark)` selector
3. Theme toggle working: Check `body.body--dark` class presence

## Code Patterns

### Frontend API Calls with Dynamic Port Resolution

Pattern used in `memberService.ts`:

```typescript
function resolveApiUrl(): string {
  const port = window.location.port;
  if (port !== '3000') {
    return 'http://localhost:3000/api';
  }
  return '/api';
}
```

This handles:

- Frontend on 9000, Backend on 3000 → Use full URL
- Both on same port → Use relative URL
- Production deployment → Configure via environment

### Vue Component Bootstrap Pattern

Pattern used in `boot/auth.ts`:

```typescript
// 1. Check guardrail first
if (process.env.MONOREPO_DEV !== 'true') {
  console.error('Use npm run dev');
  window.location.href = 'about:blank';
}

// 2. Get router from boot context
export default boot(({ router }) => {
  // 3. Listen for events
  authEventSource.addEventListener('tag', async (event) => {
    // 4. Update state THEN navigate
    await userStore.setRole('admin', 'Admin');

    // 5. Use setTimeout to ensure state commits
    setTimeout(() => {
      router.push('/dashboard');
    }, 0);
  });
});
```

### Type-Safe Optional Fields

Pattern used for `isAdmin?: boolean`:

```typescript
// 1. Define as optional in interface
interface TagEvent {
  uid: string;
  isAdmin?: boolean;
}

// 2. Use type guard
function isTagEvent(obj: unknown): obj is TagEvent {
  return typeof obj === 'object' && obj !== null && 'uid' in obj;
}

// 3. Safe access in code
if (event.isAdmin === true) {
  // isAdmin is definitely true here (not just truthy)
}
```

## Development Checklist

Before committing code, verify:

- [ ] Services run only via: `npm run dev`
- [ ] Backend checks `MONOREPO_DEV === 'true'`
- [ ] Frontend checks `MONOREPO_DEV === 'true'`
- [ ] Component uses `<script setup lang="ts">` with `defineOptions({ name: 'ComponentName' })`
- [ ] All function parameters have explicit type annotations
- [ ] No use of `any` type - use `unknown` with type guards
- [ ] TypeScript strict mode passes: `npm run lint`
- [ ] Dark mode CSS tested: toggle dark mode, verify readability
- [ ] Touchscreen buttons ≥48px: Minimum size for accessibility
- [ ] CORS headers present if consuming cross-port APIs
- [ ] console.log statements use consistent format: `[module-name] message`
- [ ] Environment variables documented in `.env.example`
- [ ] Routes registered in backend match frontend API calls
- [ ] Admin tag UID added to `ADMIN_TAG_UIDS` if new admin needed

## Environment Configuration

### Backend (.env)

**Required:**

```bash
NODE_ENV=development
PORT=3000
ADMIN_TAG_UIDS=2659423e,ab9c423e
```

**Optional:**

```bash
DEBUG=*  # Enable debug logging
```

### Frontend

Frontend uses environment detection to resolve backend URL automatically. No `.env` file needed for local development.

## Adding New Services to Development Stack

**RULE: All new services must be added to scripts/dev.js only.**

To add a new service:

1. Update `services` array in `/scripts/dev.js`:

```javascript
{
  name: 'NewService',
  cmd: 'npm.cmd',
  args: ['run', 'dev'],
  cwd: 'packages/new-service',
  port: 3001,  // Use unique port
  env: {}
}
```

2. Add guardrail check to service startup:

```typescript
if (process.env.MONOREPO_DEV !== 'true') {
  console.error('❌ Use npm run dev');
  process.exit(1);
}
```

3. Add health endpoint to service:

```typescript
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});
```

4. Service will be automatically started, monitored, and health-checked

**Do NOT create alternate startup paths, scripts, or documentation.**

## Performance & Core Web Vitals

**Target metrics:**

- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1

**Optimization guidelines:**

- Lazy load routes in frontend router
- Use Quasar's code splitting for components
- Minimize bundle size: ~100KB gzipped target
- API responses should be < 5KB for /members endpoint

## Security Notes

⚠️ **Current Implementation:**

- Admin tags are hardcoded in environment variables (development only)
- Members API returns mock data (no authorization check)
- WebSocket broadcasts to all connected clients

⚠️ **Before Production:**

- Implement proper authentication backend
- Add database with member records
- Implement authorization per endpoint
- Remove hardcoded credentials
- Enable HTTPS/WSS
- Implement rate limiting
- Add CSRF protection

## Testing

### Running Tests

```bash
npm run test --workspaces
```

### Manual Testing Checklist

**Admin Tag Flow:**

1. Start dev stack: `npm run dev`
2. Open http://localhost:9000
3. Scan admin tag (UID from ADMIN_TAG_UIDS)
4. Verify: Redirect to dashboard, role shows "Admin", no role selection

**Members Management:**

1. Login as Admin
2. Click "Mitglieder verwalten" button
3. Verify: Members table loads with 8 rows
4. Test: Edit button shows notification
5. Test: Delete button removes member with confirmation

**Dark Mode:**

1. Toggle dark mode in footer
2. Check: Tables readable, buttons visible, text has contrast
3. Check: Icons visible in both themes

## Useful Commands

```bash
# Start full stack (ONLY SUPPORTED WAY)
npm run dev

# Start with reset (clears temp files)
npm run dev --reset

# Build everything
npm run build

# Run linter
npm run lint

# Clean all dependencies
npm run clean

# Check health of backend
curl http://localhost:3000/health
```

## Resources

- [Vue 3 Documentation](https://vuejs.org/)
- [Quasar Framework](https://quasar.dev/)
- [Express.js](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- MKS Control Repository Guidelines: See `.github/copilot-instructions.md`
