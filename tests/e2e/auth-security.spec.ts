import { test, expect, type APIRequestContext } from '@playwright/test';
import WebSocket from 'ws';
import { loginAsAdmin, makeEntranceKiosk } from '../helpers/auth';
import { ADMIN_HEADERS, API, MEMBER_HEADERS, VORSTAND_HEADERS } from '../helpers/machines';
import {
  bearer,
  ENTRANCE_HEADERS,
  ENTRANCE_KEY,
  loginAtEntrance,
  loginWithWebNfc,
} from '../helpers/session';

// Secure login (docs/auth-plan.md): sessions instead of role headers, entrance key, Web NFC,
// role rules per endpoint.

// Must match SESSION_IDLE_TIMEOUT_MS in .env.test.
const IDLE_TIMEOUT_MS = 30_000;

const scan = (request: APIRequestContext, uid: string, headers: Record<string, string> = {}) =>
  request.post(`${API}/auth/tag`, {
    headers,
    data: { type: 'tag', uid, source: 'manual' },
  });

const webnfc = (request: APIRequestContext, uid: string) =>
  request.post(`${API}/auth/webnfc`, { data: { uid } });

let memberSeq = 0;

/** Creates an active member with a tag through the API and returns id and tag. */
const createMember = async (
  request: APIRequestContext,
  roles: string[] = ['mitglied']
): Promise<{ id: string; tagUid: string }> => {
  memberSeq += 1;
  const created = await request.post(`${API}/members`, {
    headers: ADMIN_HEADERS,
    data: { firstName: 'Sec', lastName: `Test${memberSeq}`, roles },
  });
  expect(created.status(), await created.text()).toBe(201);
  const id = (await created.json()).data.id as string;
  const tagUid = `sec-tag-${Date.now()}-${memberSeq}`;
  const tag = await request.post(`${API}/members/${id}/tags`, {
    headers: ADMIN_HEADERS,
    data: { tagUid },
  });
  expect(tag.status(), await tag.text()).toBe(201);
  return { id, tagUid };
};

/** Opens a WebSocket; with a key it announces itself as the entrance kiosk. */
const openSocket = async (
  entranceKey?: string
): Promise<{ socket: WebSocket; messages: Array<Record<string, unknown>> }> => {
  const socket = new WebSocket('ws://localhost:3000/ws/auth');
  const messages: Array<Record<string, unknown>> = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  if (entranceKey) {
    socket.send(JSON.stringify({ type: 'hello', entranceKey }));
    await expect.poll(() => messages.some((m) => m.type === 'hello')).toBe(true);
  }
  return { socket, messages };
};

test.describe('Secure login', () => {
  test.describe('No trust in client headers', () => {
    test('role headers alone do not log anyone in', async ({ request }) => {
      const fake = { 'x-user-role': 'admin', 'x-user-id': 'test-admin-001' };
      expect((await request.get(`${API}/terminals`, { headers: fake })).status()).toBe(401);
      expect((await request.get(`${API}/members`, { headers: fake })).status()).toBe(401);
      expect(
        (await request.post(`${API}/areas`, { headers: fake, data: { name: 'X' } })).status()
      ).toBe(401);
    });

    test('a member session with admin headers stays a member', async ({ request }) => {
      const headers = { ...MEMBER_HEADERS, 'x-user-role': 'admin', 'x-user-id': 'test-admin-001' };
      expect((await request.get(`${API}/terminals`, { headers })).status()).toBe(403);
      const me = await (await request.get(`${API}/auth/me`, { headers })).json();
      expect(me.data).toMatchObject({ role: 'mitglied', member: { id: 'test-member-001' } });
    });

    test('an unknown or ended session is refused with 401', async ({ request }) => {
      const response = await request.get(`${API}/areas`, { headers: bearer('mks_not-a-session') });
      expect(response.status()).toBe(401);
      expect((await response.json()).code).toBe('session-ended');
    });
  });

  test.describe('Entrance', () => {
    test('scans need the entrance key', async ({ request }) => {
      expect((await scan(request, 'test-member-tag-001')).status()).toBe(401);
      expect((await scan(request, 'test-member-tag-001', bearer('mke_wrong-key'))).status()).toBe(
        401
      );
      expect((await scan(request, 'test-member-tag-001', ENTRANCE_HEADERS)).status()).toBe(202);
    });

    test('only the kiosk receives the scan, and its login code works once', async ({ request }) => {
      const kiosk = await openSocket(ENTRANCE_KEY);
      const other = await openSocket();
      const wrong = await openSocket('mke_wrong-key');
      try {
        expect(kiosk.messages.find((m) => m.type === 'hello')).toMatchObject({ entrance: true });
        expect(wrong.messages.find((m) => m.type === 'hello')).toMatchObject({ entrance: false });

        await scan(request, 'test-member-tag-001', ENTRANCE_HEADERS);
        await expect.poll(() => kiosk.messages.some((m) => m.type === 'tag')).toBe(true);
        const event = kiosk.messages.find((m) => m.type === 'tag') as { loginCode?: string };
        expect(event.loginCode).toBeTruthy();
        expect(other.messages.filter((m) => m.type === 'tag')).toHaveLength(0);
        expect(wrong.messages.filter((m) => m.type === 'tag')).toHaveLength(0);

        const first = await request.post(`${API}/auth/session`, {
          data: { code: event.loginCode },
        });
        expect(first.status()).toBe(201);
        expect((await first.json()).data).toMatchObject({ kind: 'entrance', role: 'mitglied' });
        const second = await request.post(`${API}/auth/session`, {
          data: { code: event.loginCode },
        });
        expect(second.status()).toBe(401);
      } finally {
        kiosk.socket.close();
        other.socket.close();
        wrong.socket.close();
      }
    });

    test('unknown and inactive tags get no login code', async ({ request }) => {
      const kiosk = await openSocket(ENTRANCE_KEY);
      try {
        await scan(request, 'sec-unknown-tag', ENTRANCE_HEADERS);
        await scan(request, 'test-inactive-tag-001', ENTRANCE_HEADERS);
        await expect.poll(() => kiosk.messages.filter((m) => m.type === 'tag').length).toBe(2);
        kiosk.messages
          .filter((m) => m.type === 'tag')
          .forEach((m) => expect(m.loginCode).toBeUndefined());
      } finally {
        kiosk.socket.close();
      }
    });

    test('emergency admin tags log in at the entrance', async ({ request }) => {
      const token = await loginAtEntrance('test-admin-tag-001');
      const me = await (await request.get(`${API}/auth/me`, { headers: bearer(token) })).json();
      expect(me.data).toMatchObject({ role: 'admin', kind: 'entrance' });
    });
  });

  test.describe('Phone (Web NFC)', () => {
    test('logs members in, but never with emergency admin tags', async ({ request }) => {
      const ok = await webnfc(request, 'test-member-tag-001');
      expect(ok.status()).toBe(201);
      expect((await ok.json()).data).toMatchObject({ kind: 'webnfc', role: 'mitglied' });
      expect((await ok.json()).data.idleTimeoutMs).toBeUndefined();

      expect((await webnfc(request, 'test-admin-tag-001')).status()).toBe(403);
      expect((await webnfc(request, 'sec-unknown-tag')).status()).toBe(401);
      expect((await webnfc(request, 'test-inactive-tag-001')).status()).toBe(403);
    });
  });

  test.describe('Sessions', () => {
    test('logout ends the session', async ({ request }) => {
      const headers = bearer(await loginWithWebNfc('test-member-tag-001', 1));
      expect((await request.get(`${API}/auth/me`, { headers })).status()).toBe(200);
      expect((await request.post(`${API}/auth/logout`, { headers })).status()).toBe(202);
      expect((await request.get(`${API}/auth/me`, { headers })).status()).toBe(401);
    });

    test('a deactivated member loses the session at once', async ({ request }) => {
      const member = await createMember(request);
      const headers = bearer(await loginWithWebNfc(member.tagUid, 1));
      expect((await request.get(`${API}/auth/me`, { headers })).status()).toBe(200);

      const off = await request.put(`${API}/members/${member.id}`, {
        headers: ADMIN_HEADERS,
        data: { isActive: false },
      });
      expect(off.status(), await off.text()).toBe(200);
      expect((await request.get(`${API}/auth/me`, { headers })).status()).toBe(401);
    });

    test('a new role applies to the running session', async ({ request }) => {
      const member = await createMember(request);
      const headers = bearer(await loginWithWebNfc(member.tagUid, 1));
      expect((await request.get(`${API}/terminals`, { headers })).status()).toBe(403);
      await request.put(`${API}/members/${member.id}`, {
        headers: ADMIN_HEADERS,
        data: { roles: ['admin', 'mitglied'] },
      });
      expect((await request.get(`${API}/terminals`, { headers })).status()).toBe(200);
    });
  });

  test.describe('Rights per endpoint', () => {
    test('members only see and edit their own profile', async ({ request }) => {
      const list = await (await request.get(`${API}/members`, { headers: MEMBER_HEADERS })).json();
      expect(list.data.map((m: { id: string }) => m.id)).toEqual(['test-member-001']);
      expect(
        (await request.get(`${API}/members/test-admin-001`, { headers: MEMBER_HEADERS })).status()
      ).toBe(403);

      const own = (data: Record<string, unknown>) =>
        request.put(`${API}/members/test-member-001`, { headers: MEMBER_HEADERS, data });
      expect((await own({ preferredTheme: 'dark' })).status()).toBe(200);
      expect((await own({ equipmentPermissions: { anything: true } })).status()).toBe(403);
      expect((await own({ isActive: true })).status()).toBe(403);
      expect((await own({ roles: ['admin', 'mitglied'] })).status()).toBe(403);
      expect(
        (
          await request.put(`${API}/members/test-vorstand-001`, {
            headers: MEMBER_HEADERS,
            data: { firstName: 'Hacked' },
          })
        ).status()
      ).toBe(403);
    });

    test('members cannot change tags, areas or equipment', async ({ request }) => {
      const headers = MEMBER_HEADERS;
      expect(
        (
          await request.post(`${API}/members/test-member-001/tags`, {
            headers,
            data: { tagUid: 'sec-own-second-tag' },
          })
        ).status()
      ).toBe(403);
      expect(
        (await request.post(`${API}/areas`, { headers, data: { name: 'Sec-Bereich' } })).status()
      ).toBe(403);
      expect(
        (await request.post(`${API}/equipment`, { headers, data: { name: 'Sec-Gerät' } })).status()
      ).toBe(403);
      expect(
        (await request.get(`${API}/tags/by-uid/test-admin-tag-001`, { headers })).status()
      ).toBe(403);
    });

    test('the board manages areas but not equipment or admins', async ({ request }) => {
      const area = await request.post(`${API}/areas`, {
        headers: VORSTAND_HEADERS,
        data: { name: `Sec-Bereich ${Date.now()}` },
      });
      expect(area.status(), await area.text()).toBe(201);
      expect(
        (
          await request.post(`${API}/equipment`, {
            headers: VORSTAND_HEADERS,
            data: { name: 'Sec-Gerät' },
          })
        ).status()
      ).toBe(403);

      // Giving a tag to an admin would let the board log in as admin.
      expect(
        (
          await request.post(`${API}/members/test-admin-001/tags`, {
            headers: VORSTAND_HEADERS,
            data: { tagUid: 'sec-board-tag-for-admin' },
          })
        ).status()
      ).toBe(403);

      const member = await createMember(request);
      expect(
        (
          await request.put(`${API}/members/${member.id}`, {
            headers: VORSTAND_HEADERS,
            data: { roles: ['admin', 'mitglied'] },
          })
        ).status()
      ).toBe(403);
      expect(
        (
          await request.put(`${API}/members/${member.id}`, {
            headers: VORSTAND_HEADERS,
            data: { roles: ['bereichsleitung', 'mitglied'] },
          })
        ).status()
      ).toBe(200);
    });
  });

  test.describe('Browser', () => {
    test('a browser that is not the kiosk is not logged in by scans', async ({ page, request }) => {
      await page.goto('/');
      await expect(page.getByTestId('login-hint')).toBeVisible();
      await page.waitForFunction('window.__WS_CONNECTED__ === true');
      await scan(request, 'test-admin-tag-001', ENTRANCE_HEADERS);
      await page.waitForTimeout(1000);
      await expect(page).not.toHaveURL(/dashboard/);
    });

    test('the kiosk is set up on the start page and logs in by scan', async ({ page, request }) => {
      await page.goto('/');
      await page.getByTestId('entrance-setup-open').click();
      await page.getByTestId('entrance-key-input').fill(ENTRANCE_KEY);
      await page.getByTestId('entrance-key-save').click();
      await page.waitForFunction('window.__WS_ENTRANCE__ === true');

      await scan(request, 'test-admin-tag-001', ENTRANCE_HEADERS);
      await expect(page).toHaveURL(/dashboard/);
      const token = await page.evaluate(() => localStorage.getItem('mks.sessionToken'));
      expect(token).toMatch(/^mks_/);

      // Scanning again logs out and ends the session in the backend.
      await scan(request, 'test-admin-tag-001', ENTRANCE_HEADERS);
      await expect(page).not.toHaveURL(/dashboard/);
      expect((await request.get(`${API}/auth/me`, { headers: bearer(token ?? '') })).status()).toBe(
        401
      );
    });

    test('a wrong entrance key is shown', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => localStorage.setItem('mks.entranceKey', 'mke_wrong-key'));
      await page.reload();
      await expect(page.getByTestId('entrance-key-rejected')).toBeVisible();
      await page.evaluate(() => localStorage.removeItem('mks.entranceKey'));
    });

    test('the kiosk logs out after the idle time', async ({ page }) => {
      test.setTimeout(IDLE_TIMEOUT_MS + 30_000);
      await page.goto('/');
      await makeEntranceKiosk(page);
      await loginAsAdmin(page);
      await expect(page).toHaveURL(/dashboard/);
      await page.waitForTimeout(IDLE_TIMEOUT_MS + 2000);
      await expect(page).not.toHaveURL(/dashboard/);
      expect(await page.evaluate(() => localStorage.getItem('mks.sessionToken'))).toBeNull();
    });

    test('an ended session sends the browser back to the start page', async ({ page, request }) => {
      await loginAsAdmin(page);
      const token = await page.evaluate(() => localStorage.getItem('mks.sessionToken'));
      await request.post(`${API}/auth/logout`, { headers: bearer(token ?? '') });
      await page.goto('/members');
      await expect(page).not.toHaveURL(/members/);
    });
  });
});
