# E2E Testing Guide - MKS Control

This document describes the End-to-End (E2E) testing setup for MKS Control using Playwright with a secure RFID authentication bypass mechanism.

## Overview

The testing infrastructure provides:

- **Isolated test environment** with ephemeral CouchDB databases
- **Secure RFID bypass** using test tags that only work in test/development mode
- **Production safety** preventing test tags from working in production
- **Realistic test data** generated with German names and proper structure
- **Fail-fast WebSocket verification** with helpful error messages
- **Retry logic** for handling WebSocket propagation timing

## Architecture

### Test Infrastructure

```
tests/
├── e2e/                          # E2E test suites
│   ├── auth.spec.ts              # Authentication flow tests
│   └── members.spec.ts           # Member CRUD tests
├── helpers/                      # Test utilities
│   ├── auth.ts                   # Authentication helpers
│   ├── database.ts               # CouchDB test database utilities
│   └── factories.ts              # Test data factory functions
├── global-setup.ts               # Playwright global setup
└── global-teardown.ts            # Playwright global teardown
```

## Requirements

### Environment Variables

#### Test Environment (NODE_ENV=test)

```bash
NODE_ENV=test
ADMIN_TAG_UIDS=test-admin-tag-001
COUCHDB_URL=http://localhost:5984
COUCHDB_USER=admin
COUCHDB_PASSWORD=password
```

The following are set automatically by `global-setup.ts`:

```bash
TEST_MEMBERS_DB_NAME=mks_members_test_${timestamp}_${pid}
TEST_TAGS_DB_NAME=mks_tags_test_${timestamp}_${pid}
COUCHDB_DB_NAME=${TEST_MEMBERS_DB_NAME}
COUCHDB_TAGS_DB_NAME=${TEST_TAGS_DB_NAME}
```

### Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0"
  }
}
```

### Running Services

Tests require these services to be running:

1. **CouchDB** on port 5984 (via Docker Compose)
2. **Backend API** on port 3000 (started automatically by Playwright)
3. **Frontend** on port 9000 (started automatically by Playwright)

## Test Tag Security Policy

### Test Tag Pattern

All test tags must follow the pattern: `^test-`

Examples:

- ✅ `test-admin-tag-001`
- ✅ `test-member-tag-001`
- ✅ `test-inactive-tag-001`
- ❌ `admin-test-tag` (doesn't start with "test-")
- ❌ `production-tag-123` (not a test tag)

### Production Safety

**Backend validation** ([authRoutes.ts](apps/backend/src/routes/authRoutes.ts)):

```typescript
// Reject test tags in production
if (process.env.NODE_ENV === 'production' && /^test-/.test(event.uid)) {
  res.status(403).json({
    ok: false,
    error: 'Test tags are not allowed in production environment',
  });
  return;
}
```

This ensures:

- Test tags are **rejected with 403 Forbidden** in production
- Even if accidentally included in `ADMIN_TAG_UIDS`, they won't work
- No database queries are performed for test tags in production

## Database Isolation Strategy

### Ephemeral Test Databases

Each test run creates unique databases:

```
mks_members_test_1738454123456_12345
mks_tags_test_1738454123456_12345
```

Where:

- `1738454123456` = timestamp (milliseconds since epoch)
- `12345` = process ID

### Lifecycle

1. **Pre-Test Script** (`scripts/setup-test-env.js`):
   - Generates unique database names with timestamp and PID
   - Creates `.env.test` file with test configuration
   - Runs automatically via `pretest:e2e` npm hook

2. **Playwright Startup**:
   - Reads `playwright.config.ts`
   - Starts webServer with `NODE_ENV=test` environment variable
   - Backend auto-detects `.env.test` file and loads it

3. **Global Setup** (`global-setup.ts`):
   - Reads database names from `.env.test`
   - Creates ephemeral databases with indexes
   - Seeds initial test data (admin, member, inactive users)

4. **Test Execution**:
   - Tests run sequentially (`fullyParallel: false`)
   - Each test can seed additional data using factories
   - Test isolation via unique IDs per factory invocation

5. **Global Teardown** (`global-teardown.ts`):
   - Deletes ephemeral test databases
   - Removes `.env.test` file
   - Cleans up resources

### Database Structure

**Members Database** (`mks_members_test_*`):

```typescript
{
  id: 'test-member-uuid',
  firstName: 'Max',
  lastName: 'Müller',
  email: 'max.mueller@example.com',
  roles: ['mitglied'],
  isActive: true,
  joinDate: '2024-01-01T00:00:00.000Z',
  preferredTheme: 'auto',
  equipmentPermissions: {}
}
```

**Tags Database** (`mks_tags_test_*`):

```typescript
{
  id: 'tag-test-tag-uuid',
  tagUid: 'test-tag-uuid',
  memberId: 'test-member-uuid',
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z'
}
```

## WebSocket Timing & Retry Behavior

### Authentication Flow

1. **WebSocket Connection Check** (500ms timeout):

   ```typescript
   // Fail fast if WebSocket not connected
   await waitForWebSocketConnection(page, 500);
   ```

   - Checks `window.__WS_CONNECTED__` flag
   - Throws `WebSocketConnectionError` with helpful message if timeout

2. **Post Tag Event**:

   ```typescript
   POST http://localhost:3000/api/auth/tag
   {
     type: 'tag',
     uid: 'test-admin-tag-001',
     source: 'manual',
     device: 'playwright-test',
     ts: '2024-01-01T00:00:00.000Z'
   }
   ```

3. **Wait for Navigation** (5000ms max, exponential backoff):

   ```typescript
   // Retry intervals: 50ms, 100ms, 200ms, 400ms
   await waitForNavigationWithRetry(page, '/dashboard', 5000);
   ```

   - Polls for URL change
   - Uses exponential backoff to reduce CPU usage
   - Throws descriptive error on timeout

### WebSocket Connection State

The frontend exposes connection state globally for tests:

**Frontend** ([authEventSource.ts](apps/frontend/src/services/authEventSource.ts)):

```typescript
private setStatus(status: ConnectionStatus): void {
  this.status = status;

  // Expose for E2E tests
  if (typeof window !== 'undefined') {
    (window as any).__WS_CONNECTED__ = (status === 'connected');
  }

  // ... notify listeners
}
```

### Error Handling

**WebSocket Connection Failure**:

```
WebSocketConnectionError: WebSocket not connected after 500ms.
Ensure dev server is running on port 9000 and WebSocket endpoint is available at ws://localhost:3000.
```

**Navigation Timeout**:

```
Error: Navigation timeout after 5000ms. Expected URL matching "/dashboard", got "http://localhost:9000/".
WebSocket event may not have propagated correctly.
```

## Factory Pattern for Test Data

### Available Factories

**Create Test Member**:

```typescript
import { createTestMember } from '../helpers/factories';

const member = createTestMember({
  firstName: 'Max', // Optional override
  lastName: 'Müller', // Optional override
  roles: ['admin', 'mitglied'],
  email: 'custom@example.com',
});
```

**Create Test User (Member + Tag)**:

```typescript
import { createTestUser } from '../helpers/factories';

const user = createTestUser({
  member: {
    roles: ['vorstand', 'mitglied'],
  },
  tag: {
    tagUid: 'custom-tag-uid',
  },
});

// Access:
user.member; // Member object
user.tag; // Tag object
```

**Create Admin User**:

```typescript
import { createTestAdminUser } from '../helpers/factories';

const admin = createTestAdminUser(); // Has admin role automatically
```

**Create Multiple Users**:

```typescript
import { createTestUsers } from '../helpers/factories';

const users = createTestUsers(5, {
  member: { roles: ['mitglied'] },
});
```

### Realistic German Test Data

Factories generate realistic German names and emails:

- **First names**: Max, Anna, Lukas, Emma, Leon, Mia, Felix, Sophie, etc.
- **Last names**: Müller, Schmidt, Schneider, Fischer, Weber, Meyer, etc.
- **Emails**: `max.mueller@example.com` (with proper umlaut conversion)

### Unique IDs for Test Isolation

Each factory invocation generates unique IDs:

```typescript
// Automatic unique ID generation
const user1 = createTestUser(); // id: 'test-member-uuid-1'
const user2 = createTestUser(); // id: 'test-member-uuid-2'

// Custom ID (manual isolation)
const user3 = createTestUser({
  member: { id: 'my-custom-id' },
});
```

## Running Tests

### Local Development

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI (interactive mode)
npm run test:e2e:ui

# Run with browser visible (headed mode)
npm run test:e2e:headed

# Debug mode (step through tests)
npm run test:e2e:debug
```

### Run Specific Tests

```bash
# Run authentication tests only
npx playwright test auth.spec.ts

# Run members tests only
npx playwright test members.spec.ts

# Run single test by name
npx playwright test -g "admin can login"
```

### CI/CD Environment

Tests run automatically in GitHub Actions with:

- Docker Compose for CouchDB
- Isolated test database per run
- Trace artifacts on failure
- HTML report generation

## Authentication Helpers

### Login Functions

```typescript
import { loginAs, loginAsAdmin, loginAsMember } from '../helpers/auth';

// Login as admin
await loginAsAdmin(page);

// Login as regular member
await loginAsMember(page);

// Login with custom tag
await loginAs(page, 'admin', 'custom-tag-uid');
```

### Logout

```typescript
import { logout } from '../helpers/auth';

await logout(page); // Simulates scanning second tag
```

### Check Auth State

```typescript
import { isLoggedIn, getCurrentRole } from '../helpers/auth';

const loggedIn = await isLoggedIn(page);
const role = await getCurrentRole(page); // 'admin', 'mitglied', etc.
```

### Clear Auth State

```typescript
import { clearAuthState } from '../helpers/auth';

await clearAuthState(page); // Clears localStorage
```

## Database Helpers

### Seed Test Data

```typescript
import { getTestDatabaseConnection, seedDatabase } from '../helpers/database';
import { createTestUsers } from '../helpers/factories';

// Get connection to test databases
const { membersDb, tagsDb } = getTestDatabaseConnection();

// Create test data
const users = createTestUsers(3);

// Seed databases
await seedDatabase(
  membersDb,
  users.map((u) => u.member)
);
await seedDatabase(
  tagsDb,
  users.map((u) => u.tag)
);
```

## Test Isolation Best Practices

### Each Test Should:

1. **Start with clean state**:

   ```typescript
   test.beforeEach(async ({ page }) => {
     await page.goto('/');
     await clearAuthState(page);
   });
   ```

2. **Use unique test data**:

   ```typescript
   // Good: Each test gets unique user
   const user = createTestUser();

   // Bad: Hardcoded ID may conflict
   const user = createTestUser({
     member: { id: 'shared-id' },
   });
   ```

3. **Seed only required data**:

   ```typescript
   // Only seed data needed for this specific test
   const { membersDb } = getTestDatabaseConnection();
   await seedDatabase(membersDb, [testUser.member]);
   ```

4. **Not depend on other tests**:
   - Each test should be runnable in isolation
   - Use `test.only()` during development to verify

5. **Clean up properly**:
   - Global teardown handles database cleanup
   - Clear page state in `beforeEach`

## Debugging Tests

### View Test Reports

```bash
# Generate and open HTML report
npx playwright show-report
```

### Inspect Test Traces

```bash
# Traces are captured on first retry
# Open trace viewer for failed test
npx playwright show-trace test-results/*/trace.zip
```

### Debug Single Test

```bash
# Run test in debug mode (step through)
npx playwright test --debug -g "specific test name"
```

### Check WebSocket Connection

```typescript
// In test, verify WebSocket state
const wsConnected = await page.evaluate(() => {
  return (window as any).__WS_CONNECTED__;
});
console.log('WebSocket connected:', wsConnected);
```

### View Test Database Contents

```bash
# Connect to CouchDB Fauxton UI
open http://localhost:5984/_utils

# Or query via curl
curl http://admin:password@localhost:5984/mks_members_test_<timestamp>_<pid>/_all_docs?include_docs=true
```

## Known Limitations

1. **Sequential Test Execution**:
   - Tests run sequentially (`fullyParallel: false`)
   - Ensures database consistency
   - Slower than parallel execution

2. **WebSocket Timing**:
   - 500ms timeout for connection check
   - May be too fast for very slow CI environments
   - Adjust timeout in `auth.ts` if needed

3. **Port Requirements**:
   - Frontend must run on port 9000 (hardcoded check)
   - Backend must run on port 3000
   - CouchDB must run on port 5984

4. **Test Tag Security**:
   - Relies on `NODE_ENV` check
   - Ensure production environment always sets `NODE_ENV=production`

## Troubleshooting

### Tests Fail with "WebSocket not connected"

**Cause**: Frontend WebSocket not establishing connection

**Solutions**:

1. Ensure backend is running on port 3000
2. Check WebSocket endpoint: `ws://localhost:3000/ws/auth`
3. Increase timeout in `waitForWebSocketConnection()`
4. Check browser console for WebSocket errors

### Tests Fail with "Navigation timeout"

**Cause**: WebSocket event not propagating or backend not responding

**Solutions**:

1. Verify test user exists in database
2. Check backend logs for errors
3. Verify tag UID matches test data
4. Increase navigation timeout

### Database Already Exists Error

**Cause**: Previous test run didn't clean up

**Solutions**:

```bash
# Manually delete test databases
curl -X DELETE http://admin:password@localhost:5984/mks_members_test_<timestamp>_<pid>
curl -X DELETE http://admin:password@localhost:5984/mks_tags_test_<timestamp>_<pid>

# Or restart CouchDB container
docker-compose restart couchdb
```

### Test Tags Work in Production

**Cause**: Production safety not enabled

**Solutions**:

1. Ensure `NODE_ENV=production` is set
2. Verify backend validation in `authRoutes.ts`
3. Test with production-like environment

## CI/CD Integration

### GitHub Actions Workflow

See [.github/workflows/e2e.yml](.github/workflows/e2e.yml) for full CI configuration.

**Key steps**:

1. Start Docker Compose (CouchDB)
2. Set environment variables
3. Install dependencies
4. Run Playwright tests
5. Upload trace artifacts on failure

### Required Secrets

None - all configuration via environment variables

### Artifacts

On test failure:

- Playwright traces (`.zip` files)
- Screenshots
- Videos
- HTML report

## Future Enhancements

1. **Parallel Test Execution**:
   - Use separate database per worker
   - Requires coordination in global setup

2. **Visual Regression Testing**:
   - Add screenshot comparison
   - Use Playwright's visual testing features

3. **API-Level Testing**:
   - Test backend API endpoints directly
   - Bypass WebSocket for faster tests

4. **Mobile Device Testing**:
   - Add mobile device configurations
   - Test touchscreen interactions

5. **Accessibility Testing**:
   - Add axe-core integration
   - Verify WCAG compliance

## References

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [GitHub Actions Integration](https://playwright.dev/docs/ci-intro)
- [MKS Control Architecture](DEVELOPMENT.md)
