import { Page } from '@playwright/test';

/**
 * Custom error for WebSocket connection failures
 */
export class WebSocketConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSocketConnectionError';
  }
}

/**
 * Wait for WebSocket connection to be established
 * Fails fast with custom error if connection not ready within timeout
 *
 * @param page Playwright page
 * @param timeout Maximum wait time in milliseconds (default: 500ms)
 */
async function waitForWebSocketConnection(page: Page, timeout: number = 500): Promise<void> {
  const startTime = Date.now();

  try {
    const isForcedDisconnected = await page.evaluate(() => {
      return (window as any).__WS_FORCE_DISCONNECTED__ === true;
    });

    if (isForcedDisconnected) {
      throw new WebSocketConnectionError('WebSocket forced disconnected for test');
    }

    await page.waitForFunction('window.__WS_CONNECTED__ === true', { timeout });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    throw new WebSocketConnectionError(
      `WebSocket not connected after ${elapsed}ms. ` +
        `Ensure dev server is running on port 9000 and WebSocket endpoint is available at ws://localhost:3000.`
    );
  }
}

/**
 * Post a tag event to the backend auth endpoint
 *
 * @param page Playwright page
 * @param tagUid RFID tag UID
 * @param source Event source type
 */
async function postTagEvent(
  page: Page,
  tagUid: string,
  source: 'manual' | 'acr122u' | 'webnfc' = 'manual'
): Promise<void> {
  const response = await page.request.post('http://localhost:3000/api/auth/tag', {
    data: {
      type: 'tag',
      uid: tagUid,
      source,
      device: 'playwright-test',
      ts: new Date().toISOString(),
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to post tag event: ${response.status()} ${body}`);
  }
}

/**
 * Wait for navigation to target URL with exponential backoff retry
 *
 * @param page Playwright page
 * @param targetUrl Target URL pattern to wait for
 * @param maxTimeout Maximum total wait time in milliseconds (default: 5000ms)
 */
async function waitForNavigationWithRetry(
  page: Page,
  targetUrl: string | RegExp,
  maxTimeout: number = 5000
): Promise<void> {
  const startTime = Date.now();
  const delays = [50, 100, 200, 400]; // Exponential backoff intervals
  let delayIndex = 0;

  while (Date.now() - startTime < maxTimeout) {
    const currentUrl = page.url();

    // Check if we've reached the target
    if (typeof targetUrl === 'string') {
      if (currentUrl.includes(targetUrl)) {
        return;
      }
    } else {
      if (targetUrl.test(currentUrl)) {
        return;
      }
    }

    // Wait with exponential backoff
    const delay = delays[Math.min(delayIndex, delays.length - 1)];
    await page.waitForTimeout(delay);
    delayIndex++;
  }

  // Timeout reached
  const elapsed = Date.now() - startTime;
  throw new Error(
    `Navigation timeout after ${elapsed}ms. Expected URL matching "${targetUrl}", got "${page.url()}". ` +
      `WebSocket event may not have propagated correctly.`
  );
}

/**
 * Log in as a test user by simulating RFID tag scan
 *
 * @param page Playwright page
 * @param role User role ('admin' or 'member')
 * @param tagUid Optional custom tag UID (uses predefined test tags if not provided)
 */
export async function loginAs(
  page: Page,
  role: 'admin' | 'member',
  tagUid?: string
): Promise<void> {
  // Use predefined test tag UIDs if not provided
  const testTagUids = {
    admin: 'test-admin-tag-001',
    member: 'test-member-tag-001',
  };

  const uid = tagUid || testTagUids[role];

  // Navigate to app if not already there
  if (!page.url().includes('localhost:9000')) {
    await page.goto('/');
  }

  // Wait for WebSocket connection (fail fast if not ready)
  await waitForWebSocketConnection(page, 500);

  // Post tag event to backend
  await postTagEvent(page, uid, 'manual');

  // Wait for WebSocket to propagate and navigation to complete
  await waitForNavigationWithRetry(page, '/dashboard', 5000);

  // Additional wait for page to stabilize
  await page.waitForLoadState('networkidle');
}

/**
 * Log in as admin user
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAs(page, 'admin');
}

/**
 * Log in as regular member
 */
export async function loginAsMember(page: Page): Promise<void> {
  await loginAs(page, 'member');
}

/**
 * Log out current user by simulating a second tag scan
 * (scanning any tag when already logged in triggers logout)
 */
export async function logout(page: Page): Promise<void> {
  // Post a different tag event to trigger logout
  await postTagEvent(page, 'logout-trigger-tag', 'manual');

  // Wait for navigation back to login page
  await waitForNavigationWithRetry(page, '/', 3000);

  // Wait for page to stabilize
  await page.waitForLoadState('networkidle');
}

/**
 * Check if user is currently logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const isAuthenticated = await page.evaluate(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  return isAuthenticated;
}

/**
 * Get current user's role from localStorage
 */
export async function getCurrentRole(page: Page): Promise<string | null> {
  const roleJson = await page.evaluate(() => {
    return localStorage.getItem('userRole');
  });

  if (!roleJson) return null;

  try {
    const role = JSON.parse(roleJson);
    return role.id || null;
  } catch {
    return null;
  }
}

/**
 * Clear authentication state (for test cleanup)
 */
export async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userRole');
    localStorage.removeItem('memberId');
    localStorage.removeItem('firstName');
    localStorage.removeItem('lastName');
    localStorage.removeItem('preferredTheme');
  });
}
