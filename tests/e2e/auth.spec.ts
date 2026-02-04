import { test, expect } from '@playwright/test';
import {
  loginAs,
  loginAsAdmin,
  loginAsMember,
  logout,
  isLoggedIn,
  getCurrentRole,
  clearAuthState,
  WebSocketConnectionError,
} from '../helpers/auth';
import { getTestDatabaseConnection, seedDatabase } from '../helpers/database';
import { createTestUser } from '../helpers/factories';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await clearAuthState(page);
  });

  test('admin can login and access dashboard', async ({ page }) => {
    await loginAsAdmin(page);

    // Verify we're on the dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify user header shows admin name
    await expect(page.locator('text=Test Admin')).toBeVisible({ timeout: 3000 });

    // Verify authentication state
    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);

    const role = await getCurrentRole(page);
    expect(role).toBe('admin');
  });

  test('member can login and access dashboard', async ({ page }) => {
    await loginAsMember(page);

    // Verify we're on the dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Verify user header shows member name
    await expect(page.locator('text=Test Member')).toBeVisible({ timeout: 3000 });

    // Verify authentication state
    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);

    const role = await getCurrentRole(page);
    expect(role).toBe('mitglied');
  });

  test('unauthenticated user redirected to login page', async ({ page }) => {
    // Try to access protected route
    await page.goto('/dashboard');

    // Should be redirected to login
    await expect(page).toHaveURL('/');
  });

  test('unauthenticated user cannot access members page', async ({ page }) => {
    await page.goto('/members');
    await expect(page).toHaveURL('/');
  });

  test('unauthenticated user cannot access areas page', async ({ page }) => {
    await page.goto('/areas');
    await expect(page).toHaveURL('/');
  });

  test('scanning second tag logs out current user', async ({ page }) => {
    // Login as admin
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // Scan different tag (simulating logout)
    await logout(page);

    // Should be back at login page
    await expect(page).toHaveURL('/');

    // Verify logged out
    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(false);
  });

  test('session persists after page reload', async ({ page }) => {
    // Login
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // Reload page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL(/\/dashboard/);

    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);
  });

  test('logout clears session', async ({ page }) => {
    // Login
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/dashboard/);

    // Logout
    await logout(page);

    // Reload page
    await page.reload();

    // Should still be logged out
    await expect(page).toHaveURL('/');

    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(false);
  });

  test('inactive user cannot login', async ({ page }) => {
    // Try to login with inactive user tag
    await page.goto('/');

    // Post inactive user tag event
    const response = await page.request.post('http://localhost:3000/api/auth/tag', {
      data: {
        type: 'tag',
        uid: 'test-inactive-tag-001',
        source: 'manual',
        device: 'playwright-test',
        ts: new Date().toISOString(),
      },
    });

    expect(response.ok()).toBe(true);

    // Should still be on login page (not logged in)
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL('/');

    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(false);
  });

  test('unknown tag shows appropriate message', async ({ page }) => {
    await page.goto('/');

    // Post unknown tag event
    const response = await page.request.post('http://localhost:3000/api/auth/tag', {
      data: {
        type: 'tag',
        uid: 'unknown-tag-uid-12345',
        source: 'manual',
        device: 'playwright-test',
        ts: new Date().toISOString(),
      },
    });

    expect(response.ok()).toBe(true);

    // Should still be on login page
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL('/');

    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(false);
  });

  test('test tag rejected in production environment', async ({ page }) => {
    // Skip this test if not testing production mode
    test.skip(process.env.NODE_ENV !== 'production', 'Only runs in production mode');

    await page.goto('/');

    // Try to use test tag in production
    const response = await page.request.post('http://localhost:3000/api/auth/tag', {
      data: {
        type: 'tag',
        uid: 'test-admin-tag-001',
        source: 'manual',
        device: 'playwright-test',
        ts: new Date().toISOString(),
      },
    });

    // Should be rejected
    expect(response.status()).toBe(403);

    const body = await response.json();
    expect(body.error).toContain('not allowed in production');
  });

  test('custom user login with factory', async ({ page }) => {
    // Create a custom test user
    const customUser = createTestUser({
      member: {
        roles: ['vorstand', 'mitglied'],
      },
    });

    // Seed database with custom user
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await seedDatabase(membersDb, [customUser.member]);
    await seedDatabase(tagsDb, [customUser.tag]);

    // Login with custom user
    await loginAs(page, 'member', customUser.tag.tagUid);

    // Verify logged in
    await expect(page).toHaveURL(/\/dashboard/);

    const role = await getCurrentRole(page);
    expect(role).toBe('vorstand');
  });
});

test.describe('Navigation Guards', () => {
  test('authenticated admin can access all pages', async ({ page }) => {
    await loginAsAdmin(page);

    // Test various protected routes
    await page.goto('/members');
    await expect(page).toHaveURL('/members');

    await page.goto('/areas');
    await expect(page).toHaveURL('/areas');

    await page.goto('/equipment');
    await expect(page).toHaveURL('/equipment');
  });

  test('authenticated member can access basic pages', async ({ page }) => {
    await loginAsMember(page);

    // Member should be able to access their profile
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');
  });

  test('navigation preserves authentication', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate through several pages
    await page.goto('/members');
    await page.goto('/areas');
    await page.goto('/dashboard');

    // Should still be authenticated
    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);
  });
});

test.describe('WebSocket Connection', () => {
  test('WebSocket connection established on page load', async ({ page }) => {
    await page.goto('/');

    // Wait for WebSocket connection
    await page.waitForFunction('window.__WS_CONNECTED__ === true', { timeout: 5000 });

    // Verify connection flag is set
    const connected = await page.evaluate('window.__WS_CONNECTED__');
    expect(connected).toBe(true);
  });

  test('login fails gracefully if WebSocket not connected', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__WS_FORCE_DISCONNECTED__ = true;
    });

    await page.goto('/');

    // Try to login (should fail with WebSocketConnectionError)
    await expect(async () => {
      await loginAsAdmin(page);
    }).rejects.toThrow(WebSocketConnectionError);
  });
});
