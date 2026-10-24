import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { deleteDocumentsByType, getTestDatabaseConnection } from '../helpers/database';
import { createTestUser } from '../helpers/factories';

// Phase 2 of docs/shelly-plan.md: terminal keys and login at a machine's Pi.

const API = 'http://localhost:3000/api';
const ADMIN_HEADERS = { 'x-user-role': 'admin', 'x-user-id': 'test-admin-001' };
// Must match TERMINAL_IDLE_TIMEOUT_MS in .env.test (scripts/setup-test-env.js).
const IDLE_TIMEOUT_MS = 10_000;

const EQUIPMENT = [
  { id: 'term-eq-laser', name: 'Lasercutter', isAvailable: true },
  { id: 'term-eq-lathe', name: 'Drehbank', isAvailable: true },
  { id: 'term-eq-broken', name: 'Kaputte Fräse', isAvailable: false },
];

const PERMITTED = createTestUser({
  member: {
    id: 'term-member-permitted',
    firstName: 'Paula',
    lastName: 'Berechtigt',
    equipmentPermissions: { 'term-eq-laser': true },
  },
  tag: { tagUid: 'term-tag-permitted' },
});

const NOT_PERMITTED = createTestUser({
  member: { id: 'term-member-other', firstName: 'Otto', lastName: 'Ohne' },
  tag: { tagUid: 'term-tag-other' },
});

interface TerminalJson {
  id: string;
  name: string;
  equipmentId: string;
  tokenHash?: string;
  maxSessionMinutes?: number;
  stillThereTimeoutMinutes?: number;
}

interface StateJson {
  terminal: TerminalJson;
  equipment: { id: string; name: string } | null;
  session: {
    memberId: string;
    firstName: string;
    canRelease: boolean;
    adminOverride: boolean;
    isAdmin: boolean;
    denyReason?: string;
  } | null;
  lastScan?: { result: string };
}

const createTerminal = async (
  request: APIRequestContext,
  equipmentId: string,
  name = 'Pi Test'
): Promise<{ terminal: TerminalJson; token: string }> => {
  const response = await request.post(`${API}/terminals`, {
    headers: ADMIN_HEADERS,
    data: { name, equipmentId },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
};

const scan = async (request: APIRequestContext, token: string | null, uid: string) =>
  request.post(`${API}/auth/tag`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    data: { type: 'tag', uid, source: 'acr122u' },
  });

const getState = async (request: APIRequestContext, token: string): Promise<StateJson> => {
  const response = await request.get(`${API}/terminal/state`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  return response.json();
};

const openKiosk = async (page: Page, token: string): Promise<void> => {
  await page.goto('/terminal');
  await page.getByTestId('terminal-setup-token').fill(token);
  await page.getByTestId('terminal-setup-connect').click();
  await expect(page.getByTestId('terminal-ready')).toBeVisible();
};

test.describe('Terminals', () => {
  test.beforeAll(async () => {
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await membersDb.bulk({
      docs: [
        ...EQUIPMENT.map((e) => ({ ...e, type: 'equipment', isActive: true })),
        PERMITTED.member,
        NOT_PERMITTED.member,
      ],
    });
    await tagsDb.bulk({ docs: [PERMITTED.tag, NOT_PERMITTED.tag] });
  });

  test.afterAll(async () => {
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await deleteDocumentsByType(membersDb, 'terminal');
    const ids = [...EQUIPMENT.map((e) => e.id), PERMITTED.member.id, NOT_PERMITTED.member.id];
    const members = await membersDb.find({ selector: { id: { $in: ids } }, limit: 100 });
    const tags = await tagsDb.find({
      selector: { tagUid: { $in: [PERMITTED.tag.tagUid, NOT_PERMITTED.tag.tagUid] } },
      limit: 100,
    });
    await membersDb.bulk({ docs: members.docs.map((d) => ({ ...d, _deleted: true })) });
    await tagsDb.bulk({ docs: tags.docs.map((d) => ({ ...d, _deleted: true })) });
  });

  test.beforeEach(async () => {
    const { membersDb } = getTestDatabaseConnection();
    await deleteDocumentsByType(membersDb, 'terminal');
  });

  test.describe('Admin API', () => {
    test('rejects non-admins', async ({ request }) => {
      const response = await request.get(`${API}/terminals`, {
        headers: { 'x-user-role': 'vorstand' },
      });
      expect(response.status()).toBe(403);
    });

    test('creates a terminal and shows the key only once', async ({ request }) => {
      const missingName = await request.post(`${API}/terminals`, {
        headers: ADMIN_HEADERS,
        data: { equipmentId: 'term-eq-laser' },
      });
      expect(missingName.status()).toBe(400);

      const unknownEquipment = await request.post(`${API}/terminals`, {
        headers: ADMIN_HEADERS,
        data: { name: 'Pi', equipmentId: 'does-not-exist' },
      });
      expect(unknownEquipment.status()).toBe(400);

      const { terminal, token } = await createTerminal(request, 'term-eq-laser', 'Pi Laser');
      expect(token).toMatch(/^mkt_[A-Za-z0-9_-]{40,}$/);
      expect(terminal.tokenHash).toBeUndefined();
      expect(terminal.stillThereTimeoutMinutes).toBe(5);

      const list = (await (
        await request.get(`${API}/terminals`, { headers: ADMIN_HEADERS })
      ).json()) as TerminalJson[];
      expect(list).toHaveLength(1);
      expect(list[0].tokenHash).toBeUndefined();
      expect(JSON.stringify(list)).not.toContain(token);
    });

    test('allows only one terminal per machine', async ({ request }) => {
      await createTerminal(request, 'term-eq-laser');
      const second = await request.post(`${API}/terminals`, {
        headers: ADMIN_HEADERS,
        data: { name: 'Pi 2', equipmentId: 'term-eq-laser' },
      });
      expect(second.status()).toBe(409);
    });

    test('validates and clears the maximum release time', async ({ request }) => {
      const { terminal } = await createTerminal(request, 'term-eq-laser');

      const invalid = await request.put(`${API}/terminals/${terminal.id}`, {
        headers: ADMIN_HEADERS,
        data: { maxSessionMinutes: 0 },
      });
      expect(invalid.status()).toBe(400);

      const set = await request.put(`${API}/terminals/${terminal.id}`, {
        headers: ADMIN_HEADERS,
        data: { maxSessionMinutes: 240, stillThereTimeoutMinutes: 10 },
      });
      expect(await set.json()).toMatchObject({
        maxSessionMinutes: 240,
        stillThereTimeoutMinutes: 10,
      });

      const cleared = await request.put(`${API}/terminals/${terminal.id}`, {
        headers: ADMIN_HEADERS,
        data: { maxSessionMinutes: null },
      });
      expect((await cleared.json()).maxSessionMinutes).toBeUndefined();
    });

    test('a new key replaces the old one, deleting disables it', async ({ request }) => {
      const { terminal, token } = await createTerminal(request, 'term-eq-laser');
      expect((await getState(request, token)).equipment?.name).toBe('Lasercutter');

      const rotated = await request.post(`${API}/terminals/${terminal.id}/rotate-token`, {
        headers: ADMIN_HEADERS,
      });
      const { token: newToken } = await rotated.json();
      expect(newToken).not.toBe(token);

      const old = await request.get(`${API}/terminal/state`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(old.status()).toBe(401);
      expect((await getState(request, newToken)).terminal.id).toBe(terminal.id);

      await request.delete(`${API}/terminals/${terminal.id}`, { headers: ADMIN_HEADERS });
      const afterDelete = await request.get(`${API}/terminal/state`, {
        headers: { authorization: `Bearer ${newToken}` },
      });
      expect(afterDelete.status()).toBe(401);
    });
  });

  test.describe('Login at the terminal', () => {
    test('requires a valid key', async ({ request }) => {
      expect((await request.get(`${API}/terminal/state`)).status()).toBe(401);
      const wrong = await request.get(`${API}/terminal/state`, {
        headers: { authorization: 'Bearer mkt_wrong' },
      });
      expect(wrong.status()).toBe(401);
      expect((await scan(request, 'mkt_wrong', PERMITTED.tag.tagUid)).status()).toBe(401);
    });

    test('member with permission logs in and out by scanning', async ({ request }) => {
      const { token } = await createTerminal(request, 'term-eq-laser');

      expect((await scan(request, token, PERMITTED.tag.tagUid)).status()).toBe(202);
      let state = await getState(request, token);
      expect(state.session).toMatchObject({
        memberId: PERMITTED.member.id,
        firstName: 'Paula',
        canRelease: true,
        adminOverride: false,
      });

      await scan(request, token, PERMITTED.tag.tagUid);
      state = await getState(request, token);
      expect(state.session).toBeNull();
      expect(state.lastScan?.result).toBe('logout');
    });

    test('member without permission is logged in but may not release', async ({ request }) => {
      const { token } = await createTerminal(request, 'term-eq-laser');
      await scan(request, token, NOT_PERMITTED.tag.tagUid);
      const { session } = await getState(request, token);
      expect(session).toMatchObject({ canRelease: false, denyReason: 'no-permission' });
    });

    test('permission is per machine', async ({ request }) => {
      const { token } = await createTerminal(request, 'term-eq-lathe');
      await scan(request, token, PERMITTED.tag.tagUid);
      const { session } = await getState(request, token);
      expect(session?.canRelease).toBe(false);
    });

    test('admins may release any machine (admin override)', async ({ request }) => {
      const { token } = await createTerminal(request, 'term-eq-lathe');
      await scan(request, token, 'test-admin-tag-001');
      const { session } = await getState(request, token);
      expect(session).toMatchObject({ isAdmin: true, canRelease: true, adminOverride: true });
    });

    test('a machine marked unavailable cannot be released', async ({ request }) => {
      const { token } = await createTerminal(request, 'term-eq-broken');
      await scan(request, token, 'test-admin-tag-001');
      const { session } = await getState(request, token);
      expect(session).toMatchObject({ canRelease: false, denyReason: 'equipment-unavailable' });
    });

    test('unknown tags and deactivated members are rejected', async ({ request }) => {
      const { token } = await createTerminal(request, 'term-eq-laser');

      await scan(request, token, 'term-tag-unknown');
      let state = await getState(request, token);
      expect(state.session).toBeNull();
      expect(state.lastScan?.result).toBe('unknown-tag');

      await scan(request, token, 'test-inactive-tag-001');
      state = await getState(request, token);
      expect(state.session).toBeNull();
      expect(state.lastScan?.result).toBe('inactive-member');
    });

    test('logout button and automatic logout', async ({ request }) => {
      const { token } = await createTerminal(request, 'term-eq-laser');
      const headers = { authorization: `Bearer ${token}` };

      await scan(request, token, PERMITTED.tag.tagUid);
      await request.post(`${API}/terminal/logout`, { headers });
      expect((await getState(request, token)).session).toBeNull();

      await scan(request, token, PERMITTED.tag.tagUid);
      expect((await getState(request, token)).session).not.toBeNull();
      await expect
        .poll(async () => (await getState(request, token)).session, {
          timeout: IDLE_TIMEOUT_MS + 10_000,
          intervals: [1000],
        })
        .toBeNull();
    });

    test('terminals are independent of each other', async ({ request }) => {
      const laser = await createTerminal(request, 'term-eq-laser', 'Pi Laser');
      const lathe = await createTerminal(request, 'term-eq-lathe', 'Pi Drehbank');

      await scan(request, laser.token, PERMITTED.tag.tagUid);
      expect((await getState(request, laser.token)).session).not.toBeNull();
      expect((await getState(request, lathe.token)).session).toBeNull();
    });
  });

  test.describe('UI', () => {
    test('a scan at a terminal does not log in other browsers', async ({ page, request }) => {
      const { token } = await createTerminal(request, 'term-eq-laser');
      await page.goto('/');
      await page.waitForFunction('window.__WS_CONNECTED__ === true');

      await scan(request, token, 'test-admin-tag-001');
      await page.waitForTimeout(1500);
      await expect(page).not.toHaveURL(/dashboard/);
    });

    test('admin creates a terminal and sees its key once', async ({ page }) => {
      await loginAsAdmin(page);
      await page.getByTestId('dashboard-terminals').click();
      await expect(page).toHaveURL(/terminals/);

      await page.getByTestId('terminals-empty-add').click();
      await page.getByTestId('terminal-form-name').fill('Pi Lasercutter');
      await page.getByTestId('terminal-form-equipment').click();
      await page.getByRole('option', { name: 'Lasercutter' }).click();
      await page.getByTestId('terminal-form-submit').click();

      await expect(page.getByTestId('terminal-token-dialog')).toBeVisible();
      await expect(page.getByTestId('terminal-token-value')).toHaveValue(/^mkt_/);
      await page.getByTestId('terminal-token-done').click();

      const card = page.getByTestId('terminal-card');
      await expect(card).toHaveCount(1);
      await expect(card.getByTestId('terminal-card-equipment')).toContainText('Lasercutter');
    });

    test('kiosk: setup, login by scan, logout', async ({ page, request }) => {
      const { token } = await createTerminal(request, 'term-eq-laser', 'Pi Laser');

      await page.goto('/terminal');
      await page.getByTestId('terminal-setup-token').fill('mkt_invalid');
      await page.getByTestId('terminal-setup-connect').click();
      await expect(page.getByTestId('terminal-setup-error')).toContainText('ungültig');

      await openKiosk(page, token);
      await expect(page.getByTestId('terminal-machine')).toHaveText('Lasercutter');

      // Kiosk mode: other pages are locked.
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/terminal$/);
      await expect(page.getByTestId('terminal-ready')).toBeVisible();

      await scan(request, token, PERMITTED.tag.tagUid);
      await expect(page.getByTestId('terminal-member')).toHaveText('Paula Berechtigt');
      await expect(page.getByTestId('terminal-permission')).toHaveAttribute('data-allowed', 'true');

      await page.getByTestId('terminal-logout').click();
      await expect(page.getByTestId('terminal-ready')).toBeVisible();
      await expect(page.getByTestId('terminal-scan-message')).toHaveAttribute(
        'data-result',
        'logout'
      );
    });

    test('kiosk shows missing permission and ignores the entrance reader', async ({
      page,
      request,
    }) => {
      const { token } = await createTerminal(request, 'term-eq-laser');
      await openKiosk(page, token);

      // A scan at the entrance reader (no key) must not log in the kiosk.
      await scan(request, null, 'test-admin-tag-001');
      await page.waitForTimeout(1000);
      await expect(page.getByTestId('terminal-ready')).toBeVisible();
      await expect(page).toHaveURL(/\/terminal$/);

      await scan(request, token, NOT_PERMITTED.tag.tagUid);
      await expect(page.getByTestId('terminal-permission')).toHaveAttribute(
        'data-allowed',
        'false'
      );
      await expect(page.getByTestId('terminal-permission')).toContainText('Keine Berechtigung');
      await page.getByTestId('terminal-logout').click();

      await scan(request, token, 'term-tag-unknown');
      await expect(page.getByTestId('terminal-scan-message')).toHaveAttribute(
        'data-result',
        'unknown-tag'
      );
    });

    test('kiosk returns to setup when its key is rotated', async ({ page, request }) => {
      const { terminal, token } = await createTerminal(request, 'term-eq-laser');
      await openKiosk(page, token);

      await request.post(`${API}/terminals/${terminal.id}/rotate-token`, {
        headers: ADMIN_HEADERS,
      });
      await page.reload();
      await expect(page.getByTestId('terminal-setup')).toBeVisible();
      await expect(page.getByTestId('terminal-setup-error')).toContainText('nicht mehr gültig');
    });
  });
});
