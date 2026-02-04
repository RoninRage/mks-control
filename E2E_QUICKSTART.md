# Playwright E2E Testing - Quick Start

## ✅ Installation Complete

Playwright E2E testing has been successfully set up for MKS Control!

## 🚀 Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run with visible browser
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug
```

## 📁 What Was Added

### Test Infrastructure

- `playwright.config.ts` - Main Playwright configuration
- `tests/global-setup.ts` - Creates ephemeral test databases
- `tests/global-teardown.ts` - Cleans up test databases

### Test Helpers

- `tests/helpers/auth.ts` - Authentication helpers (loginAs, logout, etc.)
- `tests/helpers/database.ts` - CouchDB database utilities
- `tests/helpers/factories.ts` - Test data factories with German names

### Test Suites

- `tests/e2e/auth.spec.ts` - Authentication flow tests
- `tests/e2e/members.spec.ts` - Member CRUD operation tests

### CI/CD

- `.github/workflows/e2e.yml` - GitHub Actions workflow

### Documentation

- `TESTING.md` - Complete E2E testing guide

## 🔒 Security Features

### Production Safety

Backend rejects test tags in production (`/^test-/` pattern):

```typescript
// apps/backend/src/routes/authRoutes.ts
if (process.env.NODE_ENV === 'production' && /^test-/.test(event.uid)) {
  res.status(403).json({ error: 'Test tags not allowed in production' });
}
```

### Test Tag Examples

- ✅ `test-admin-tag-001` - Admin user
- ✅ `test-member-tag-001` - Regular member
- ✅ `test-inactive-tag-001` - Inactive user
- ❌ Never use test tags in production!

## 🗄️ Database Isolation

Each test run creates unique databases:

```
mks_members_test_1738454123456_12345
mks_tags_test_1738454123456_12345
```

Automatically cleaned up after tests complete.

## 🔌 WebSocket Integration

Frontend exposes connection state for tests:

```typescript
// apps/frontend/src/services/authEventSource.ts
(window as any).__WS_CONNECTED__ = status === 'connected';
```

Auth helpers verify connection with fail-fast timeout (500ms).

## 🔄 Test Environment Auto-Detection

Backend automatically detects test mode when `.env.test` exists:

```typescript
// apps/backend/src/server.ts
if (existsSync('.env.test')) {
  dotenv.config({ path: '.env.test' });
  process.env.NODE_ENV = 'test';
} else {
  dotenv.config(); // Production/dev mode
}
```

**No production code changes needed** - detection is file-based.

## 📝 Example Test

```typescript
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';

test('admin can access dashboard', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page).toHaveURL(/\/dashboard/);
});
```

## 🏭 Factory Pattern

Create realistic test data:

```typescript
import { createTestUser, createTestAdmin } from '../helpers/factories';

// Auto-generates German names and emails
const user = createTestUser({
  member: {
    roles: ['vorstand', 'mitglied'],
  },
});

// Seed database
const { membersDb, tagsDb } = getTestDatabaseConnection();
await seedDatabase(membersDb, [user.member]);
await seedDatabase(tagsDb, [user.tag]);

// Login with this user
await loginAs(page, 'member', user.tag.tagUid);
```

## ⚡ Key Features

1. **Secure RFID Bypass** - Uses existing `source: 'manual'` tag events
2. **Production Safety** - Test tags rejected in production environment
3. **Ephemeral Databases** - Isolated test data per run
4. **Fail-Fast WebSocket** - 500ms connection timeout with helpful errors
5. **Retry Logic** - Exponential backoff for WebSocket propagation (5s max)
6. **Realistic Test Data** - German names (Max Müller, Anna Schmidt, etc.)
7. **Test Isolation** - Unique IDs per factory invocation

## 📖 Documentation

See [TESTING.md](TESTING.md) for complete documentation including:

- Environment requirements
- WebSocket timing & retry behavior
- Factory pattern usage
- Database isolation strategy
- Troubleshooting guide
- CI/CD integration

## 🐛 Debugging

```bash
# View test report
npx playwright show-report

# View trace for failed test
npx playwright show-trace test-results/*/trace.zip

# Debug single test
npx playwright test --debug -g "test name"
```

## 🎯 Next Steps

1. **Start services**: `npm run dev` (backend, frontend, CouchDB)
2. **Run tests**: `npm run test:e2e`
3. **View report**: `npx playwright show-report`
4. **Write more tests**: Add to `tests/e2e/`

## ⚠️ Important Notes

- Tests run **sequentially** (`fullyParallel: false`)
- Frontend must run on **port 9000** (enforced)
- Backend must run on **port 3000**
- CouchDB must run on **port 5984**
- Set `NODE_ENV=test` for test environment
- Set `NODE_ENV=production` in production

## 🎭 Test Coverage

Current test suites:

### Authentication (`auth.spec.ts`)

- ✅ Admin login
- ✅ Member login
- ✅ Unauthenticated redirect
- ✅ Logout functionality
- ✅ Session persistence
- ✅ Inactive user handling
- ✅ Unknown tag handling
- ✅ WebSocket connection
- ✅ Production safety

### Members CRUD (`members.spec.ts`)

- ✅ View members list
- ✅ Create member
- ✅ Edit member
- ✅ View member details
- ✅ Filter/search members
- ✅ Role management
- ✅ Tag assignment

## 🔗 Related Files

**Modified Files:**

- [package.json](package.json) - Added test scripts
- [authRoutes.ts](apps/backend/src/routes/authRoutes.ts) - Production safety
- [authEventSource.ts](apps/frontend/src/services/authEventSource.ts) - WebSocket state
- [.gitignore](.gitignore) - Ignored test artifacts

**New Files:**

- [playwright.config.ts](playwright.config.ts)
- [tests/global-setup.ts](tests/global-setup.ts)
- [tests/global-teardown.ts](tests/global-teardown.ts)
- [tests/helpers/auth.ts](tests/helpers/auth.ts)
- [tests/helpers/database.ts](tests/helpers/database.ts)
- [tests/helpers/factories.ts](tests/helpers/factories.ts)
- [tests/e2e/auth.spec.ts](tests/e2e/auth.spec.ts)
- [tests/e2e/members.spec.ts](tests/e2e/members.spec.ts)
- [.github/workflows/e2e.yml](.github/workflows/e2e.yml)
- [TESTING.md](TESTING.md)

---

**Happy Testing! 🎉**
