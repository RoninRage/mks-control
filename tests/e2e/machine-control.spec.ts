import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import {
  deleteDocumentsByType,
  getTestDatabaseConnection,
  getTestUsageDatabase,
} from '../helpers/database';
import { createTestUser } from '../helpers/factories';
import { startMockShelly, type MockShelly, type MockShellyOptions } from '../helpers/mockShelly';
import { ADMIN_HEADERS, MEMBER_HEADERS, VORSTAND_HEADERS } from '../helpers/machines';

// Phase 3 of docs/shelly-plan.md: releasing machines at their terminal.
//
// Timings from .env.test (scripts/setup-test-env.js): one configured "minute" lasts one second
// (TERMINAL_MINUTE_MS=1000), a Pi counts as offline after 5 s without calling in, the safety
// timer defaults to 3 "minutes" = 3 s.

const API = 'http://localhost:3000/api';
const SHELLY_PASSWORD = 'test-shelly-secret';
const WATCHDOG_S = 3;

const LASER = { id: 'mc-eq-laser', name: 'MC Lasercutter', isAvailable: true };
const LATHE = { id: 'mc-eq-lathe', name: 'MC Drehbank', isAvailable: true };

const PERMITTED = createTestUser({
  member: {
    id: 'mc-member-permitted',
    firstName: 'Paula',
    lastName: 'Laser',
    equipmentPermissions: { [LASER.id]: true },
  },
  tag: { tagUid: 'mc-tag-permitted' },
});
const NOT_PERMITTED = createTestUser({
  member: { id: 'mc-member-other', firstName: 'Otto', lastName: 'Ohne' },
  tag: { tagUid: 'mc-tag-other' },
});

interface Machine {
  shelly: MockShelly;
  deviceId: string;
  terminalId: string;
  token: string;
  headers: Record<string, string>;
}

interface UsageDoc {
  memberId: string | null;
  memberName: string;
  adminOverride: boolean;
  endedAt?: string;
  durationSec?: number;
  endReason?: string;
}

const mocks: MockShelly[] = [];
const machines: Machine[] = [];
const keepAlives: Array<() => void> = [];

const resetEquipment = async (): Promise<void> => {
  const { membersDb } = getTestDatabaseConnection();
  const existing = await membersDb.find({
    selector: { id: { $in: [LASER.id, LATHE.id] } },
    limit: 10,
  });
  await membersDb.bulk({
    docs: [
      ...existing.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
      ...[LASER, LATHE].map((e) => ({ ...e, type: 'equipment', isActive: true })),
    ],
  });
};

const setupMachine = async (
  request: APIRequestContext,
  options: {
    equipmentId?: string;
    shelly?: Partial<MockShellyOptions>;
    terminal?: Record<string, unknown>;
    configure?: boolean;
  } = {}
): Promise<Machine> => {
  const equipmentId = options.equipmentId ?? LASER.id;
  const shelly = await startMockShelly({
    gen: 2,
    switches: 1,
    metered: true,
    password: SHELLY_PASSWORD,
    ...options.shelly,
  });
  mocks.push(shelly);

  const device = await request.post(`${API}/shelly/devices`, {
    headers: ADMIN_HEADERS,
    data: { host: shelly.host },
  });
  expect(device.status()).toBe(201);
  const deviceId = (await device.json()).id as string;

  if (options.configure !== false) {
    const control = await request.put(`${API}/equipment/${equipmentId}/control`, {
      headers: ADMIN_HEADERS,
      data: { deviceId, kind: 'switch', index: 0 },
    });
    expect(control.status(), await control.text()).toBe(200);
  }

  const terminal = await request.post(`${API}/terminals`, {
    headers: ADMIN_HEADERS,
    data: { name: 'MC Pi', equipmentId, ...options.terminal },
  });
  expect(terminal.status()).toBe(201);
  const { terminal: t, token } = await terminal.json();
  const machine: Machine = {
    shelly,
    deviceId,
    terminalId: t.id,
    token,
    headers: { authorization: `Bearer ${token}` },
  };
  machines.push(machine);
  return machine;
};

const scan = (request: APIRequestContext, machine: Machine, uid: string) =>
  request.post(`${API}/auth/tag`, {
    headers: machine.headers,
    data: { type: 'tag', uid, source: 'acr122u' },
  });

const state = async (request: APIRequestContext, machine: Machine) =>
  (await request.get(`${API}/terminal/state`, { headers: machine.headers })).json();

const release = (request: APIRequestContext, machine: Machine) =>
  request.post(`${API}/terminal/release`, { headers: machine.headers });

// Polls the state like the kiosk does, so the backend sees the Pi as online.
const keepPiOnline = (request: APIRequestContext, machine: Machine): (() => void) => {
  const timer = setInterval(() => {
    void request.get(`${API}/terminal/state`, { headers: machine.headers }).catch(() => undefined);
  }, 1000);
  const stop = (): void => clearInterval(timer);
  keepAlives.push(stop);
  return stop;
};

const usagesFor = async (terminalId: string): Promise<UsageDoc[]> => {
  const result = await getTestUsageDatabase().find({
    selector: { type: 'equipmentUsage', terminalId },
    limit: 100,
  });
  return result.docs as UsageDoc[];
};

const switchSetCalls = (shelly: MockShelly): number =>
  shelly.calls.filter((c) => c.rpcMethod === 'Switch.Set' && c.params?.on === true).length;

test.describe('Machine control', () => {
  test.beforeAll(async () => {
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await membersDb.bulk({ docs: [PERMITTED.member, NOT_PERMITTED.member] });
    await tagsDb.bulk({ docs: [PERMITTED.tag, NOT_PERMITTED.tag] });
  });

  test.beforeEach(async () => {
    const { membersDb } = getTestDatabaseConnection();
    await deleteDocumentsByType(membersDb, 'terminal');
    await deleteDocumentsByType(membersDb, 'shellyDevice');
    await resetEquipment();
  });

  test.afterEach(async ({ request }) => {
    keepAlives.splice(0).forEach((stop) => stop());
    // Delete terminals through the API so running releases end in the backend too.
    for (const machine of machines.splice(0)) {
      await request.delete(`${API}/terminals/${machine.terminalId}`, { headers: ADMIN_HEADERS });
    }
    await Promise.all(mocks.splice(0).map((m) => m.close()));
  });

  test.afterAll(async () => {
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await deleteDocumentsByType(membersDb, 'terminal');
    await deleteDocumentsByType(membersDb, 'shellyDevice');
    const docs = await membersDb.find({
      selector: { id: { $in: [LASER.id, LATHE.id, PERMITTED.member.id, NOT_PERMITTED.member.id] } },
      limit: 20,
    });
    await membersDb.bulk({
      docs: docs.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
    });
    const tags = await tagsDb.find({
      selector: { tagUid: { $in: [PERMITTED.tag.tagUid, NOT_PERMITTED.tag.tagUid] } },
      limit: 20,
    });
    await tagsDb.bulk({
      docs: tags.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
    });
  });

  test.describe('Control configuration', () => {
    test('validates the Shelly output', async ({ request }) => {
      const shelly = await startMockShelly({ gen: 2, switches: 1, inputs: 1 });
      mocks.push(shelly);
      const device = await (
        await request.post(`${API}/shelly/devices`, {
          headers: ADMIN_HEADERS,
          data: { host: shelly.host },
        })
      ).json();
      const put = (equipmentId: string, data: Record<string, unknown>, headers = ADMIN_HEADERS) =>
        request.put(`${API}/equipment/${equipmentId}/control`, { headers, data });

      expect(
        (
          await put(LASER.id, { deviceId: device.id, kind: 'switch', index: 0 }, VORSTAND_HEADERS)
        ).status()
      ).toBe(403);
      expect((await put(LASER.id, { deviceId: 'nope', kind: 'switch', index: 0 })).status()).toBe(
        400
      );
      expect(
        (await put(LASER.id, { deviceId: device.id, kind: 'switch', index: 5 })).status()
      ).toBe(400);
      expect((await put(LASER.id, { deviceId: device.id, kind: 'input', index: 0 })).status()).toBe(
        400
      );
      expect(
        (
          await put(LASER.id, { deviceId: device.id, kind: 'switch', index: 0, watchdogMinutes: 0 })
        ).status()
      ).toBe(400);

      const ok = await put(LASER.id, { deviceId: device.id, kind: 'switch', index: 0 });
      expect(ok.status()).toBe(200);
      expect((await ok.json()).control).toMatchObject({
        deviceId: device.id,
        kind: 'switch',
        index: 0,
        watchdogMinutes: 3,
        shutdown: { mode: 'immediate' },
      });

      // One output powers one machine.
      expect(
        (await put(LATHE.id, { deviceId: device.id, kind: 'switch', index: 0 })).status()
      ).toBe(409);

      // An assigned device cannot be retired.
      const retire = await request.delete(`${API}/shelly/devices/${device.id}`, {
        headers: ADMIN_HEADERS,
      });
      expect(retire.status()).toBe(409);

      const removed = await request.delete(`${API}/equipment/${LASER.id}/control`, {
        headers: ADMIN_HEADERS,
      });
      expect((await removed.json()).control).toBeUndefined();
    });
  });

  test.describe('Release', () => {
    test('requires login, permission and a configured Shelly', async ({ request }) => {
      const machine = await setupMachine(request);
      expect((await release(request, machine)).status()).toBe(409);

      await scan(request, machine, NOT_PERMITTED.tag.tagUid);
      const denied = await release(request, machine);
      expect(denied.status()).toBe(403);
      expect(machine.shelly.switches[0].on).toBe(false);
      await scan(request, machine, NOT_PERMITTED.tag.tagUid);

      const unconfigured = await setupMachine(request, {
        equipmentId: LATHE.id,
        configure: false,
      });
      await scan(request, unconfigured, 'test-admin-tag-001');
      const s = await state(request, unconfigured);
      expect(s.machine).toMatchObject({ configured: false, blockReason: 'not-configured' });
      const notConfigured = await release(request, unconfigured);
      expect(notConfigured.status()).toBe(409);
      expect((await notConfigured.json()).code).toBe('not-configured');
    });

    test('switches the machine on with a safety timer and records the usage', async ({
      request,
    }) => {
      const machine = await setupMachine(request);
      await scan(request, machine, PERMITTED.tag.tagUid);

      const response = await release(request, machine);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.machine.release).toMatchObject({
        memberName: 'Paula Laser',
        adminOverride: false,
      });
      expect(machine.shelly.switches[0].on).toBe(true);
      expect(
        machine.shelly.calls.some(
          (c) => c.rpcMethod === 'Switch.Set' && c.params?.toggle_after === WATCHDOG_S
        )
      ).toBe(true);

      // Releasing twice does not start a second usage.
      expect((await release(request, machine)).status()).toBe(200);
      const usages = await usagesFor(machine.terminalId);
      expect(usages).toHaveLength(1);
      expect(usages[0]).toMatchObject({ memberId: PERMITTED.member.id, adminOverride: false });
      expect(usages[0].endedAt).toBeUndefined();
    });

    test('logging out switches off and closes the usage', async ({ request }) => {
      const machine = await setupMachine(request);

      await scan(request, machine, PERMITTED.tag.tagUid);
      await release(request, machine);
      await scan(request, machine, PERMITTED.tag.tagUid);
      expect(machine.shelly.switches[0].on).toBe(false);

      await scan(request, machine, PERMITTED.tag.tagUid);
      await release(request, machine);
      await request.post(`${API}/terminal/logout`, { headers: machine.headers });
      expect(machine.shelly.switches[0].on).toBe(false);

      const usages = await usagesFor(machine.terminalId);
      expect(usages).toHaveLength(2);
      usages.forEach((u) => {
        expect(u.endReason).toBe('logout');
        expect(u.durationSec).toBeGreaterThanOrEqual(0);
      });
    });

    test('admins can release machines without own permission', async ({ request }) => {
      const machine = await setupMachine(request, { equipmentId: LATHE.id });
      await scan(request, machine, 'test-admin-tag-001');
      expect((await release(request, machine)).status()).toBe(200);
      const [usage] = await usagesFor(machine.terminalId);
      expect(usage.adminOverride).toBe(true);
    });

    test('works with Gen1 devices', async ({ request }) => {
      const machine = await setupMachine(request, { shelly: { gen: 1 } });
      await scan(request, machine, PERMITTED.tag.tagUid);
      expect((await release(request, machine)).status()).toBe(200);
      expect(machine.shelly.switches[0].on).toBe(true);
      expect(
        machine.shelly.calls.some((c) => c.path === `/relay/0?turn=on&timer=${WATCHDOG_S}`)
      ).toBe(true);
    });

    test('identify is refused while the machine is released', async ({ request }) => {
      const machine = await setupMachine(request);
      await scan(request, machine, PERMITTED.tag.tagUid);
      await release(request, machine);
      const identify = await request.post(`${API}/shelly/devices/${machine.deviceId}/identify`, {
        headers: ADMIN_HEADERS,
      });
      expect(identify.status()).toBe(409);
      expect(machine.shelly.switches[0].on).toBe(true);
    });
  });

  test.describe('Safety timer', () => {
    test('keeps running while the Pi is online, past the idle logout', async ({ request }) => {
      test.slow();
      const machine = await setupMachine(request);
      await scan(request, machine, PERMITTED.tag.tagUid);
      await release(request, machine);
      keepPiOnline(request, machine);

      // Longer than the safety timer (3 s) and the idle logout (10 s).
      await new Promise((resolve) => setTimeout(resolve, 11_500));
      expect(machine.shelly.switches[0].on).toBe(true);
      expect(switchSetCalls(machine.shelly)).toBeGreaterThan(3);
      const s = await state(request, machine);
      expect(s.session).not.toBeNull();
      expect(s.machine.release).not.toBeNull();
    });

    test('switches off when the Pi stops calling in', async ({ request }) => {
      const machine = await setupMachine(request);
      await scan(request, machine, PERMITTED.tag.tagUid);
      await release(request, machine);

      // No polling: offline after 5 s, then the Shelly timer runs out.
      await expect
        .poll(async () => (await usagesFor(machine.terminalId))[0]?.endReason, {
          timeout: 20_000,
          intervals: [500],
        })
        .toBe('terminal-offline');
      expect(machine.shelly.switches[0].on).toBe(false);
      expect((await state(request, machine)).session).toBeNull();
    });

    test('ends the release when the Shelly is unreachable', async ({ request }) => {
      const machine = await setupMachine(request);
      await scan(request, machine, PERMITTED.tag.tagUid);
      await release(request, machine);
      keepPiOnline(request, machine);

      machine.shelly.setOffline(true);
      await expect
        .poll(async () => (await usagesFor(machine.terminalId))[0]?.endReason, {
          timeout: 15_000,
          intervals: [500],
        })
        .toBe('device-offline');

      const s = await state(request, machine);
      expect(s.machine).toMatchObject({
        online: false,
        blockReason: 'device-offline',
        release: null,
      });
      expect(s.session).not.toBeNull();
      expect((await release(request, machine)).status()).toBe(502);
    });
  });

  test.describe('"Noch da?"', () => {
    test('asks after the maximum time and switches off without an answer', async ({ request }) => {
      test.slow();
      const machine = await setupMachine(request, {
        terminal: { maxSessionMinutes: 2, stillThereTimeoutMinutes: 2 },
      });
      await scan(request, machine, PERMITTED.tag.tagUid);
      await release(request, machine);
      keepPiOnline(request, machine);

      await expect
        .poll(async () => (await state(request, machine)).machine.release?.stillThere, {
          timeout: 6000,
          intervals: [250],
        })
        .toBeTruthy();

      const confirmed = await request.post(`${API}/terminal/still-there`, {
        headers: machine.headers,
      });
      expect((await confirmed.json()).machine.release.stillThere).toBeUndefined();
      expect(machine.shelly.switches[0].on).toBe(true);

      // Asked again after the next period; no answer this time.
      await expect
        .poll(async () => (await usagesFor(machine.terminalId))[0]?.endReason, {
          timeout: 12_000,
          intervals: [500],
        })
        .toBe('timeout');
      expect(machine.shelly.switches[0].on).toBe(false);
      expect((await state(request, machine)).session).toBeNull();
    });
  });

  test.describe('UI', () => {
    test('admin assigns the Shelly output on the equipment page', async ({ page, request }) => {
      const shelly = await startMockShelly({ gen: 2, switches: 2, password: SHELLY_PASSWORD });
      mocks.push(shelly);
      await request.post(`${API}/shelly/devices`, {
        headers: ADMIN_HEADERS,
        data: { host: shelly.host, name: 'MC Shelly' },
      });

      await loginAsAdmin(page);
      await page.goto(`/equipment/${LASER.id}/edit`);
      await page.getByTestId('equipment-control-device').click();
      await page.getByRole('option', { name: /MC Shelly/ }).click();
      await page.getByTestId('equipment-control-output').click();
      await page.getByRole('option', { name: 'Relais 2' }).click();
      await page.getByTestId('equipment-control-save').click();
      await expect(page.getByTestId('equipment-control-remove')).toBeVisible();

      const equipment = await (
        await request.get(`${API}/equipment/${LASER.id}`, { headers: ADMIN_HEADERS })
      ).json();
      expect(equipment.control).toMatchObject({ kind: 'switch', index: 1 });
    });

    test('kiosk: release, see it running, log out', async ({ page, request }) => {
      const machine = await setupMachine(request);
      await page.goto('/terminal');
      await page.getByTestId('terminal-setup-token').fill(machine.token);
      await page.getByTestId('terminal-setup-connect').click();
      await expect(page.getByTestId('terminal-ready')).toBeVisible();

      await scan(request, machine, PERMITTED.tag.tagUid);
      await page.getByTestId('terminal-release').click();
      await expect(page.getByTestId('terminal-released')).toBeVisible();
      expect(machine.shelly.switches[0].on).toBe(true);
      await expect(page.getByTestId('terminal-auto-logout')).toHaveCount(0);

      await page.getByTestId('terminal-logout').click();
      await expect(page.getByTestId('terminal-ready')).toBeVisible();
      expect(machine.shelly.switches[0].on).toBe(false);
    });

    test('kiosk explains why a machine cannot be released', async ({ page, request }) => {
      const machine = await setupMachine(request, { configure: false });
      await page.goto('/terminal');
      await page.getByTestId('terminal-setup-token').fill(machine.token);
      await page.getByTestId('terminal-setup-connect').click();

      await scan(request, machine, PERMITTED.tag.tagUid);
      await expect(page.getByTestId('terminal-machine-blocked')).toHaveAttribute(
        'data-reason',
        'not-configured'
      );
      await expect(page.getByTestId('terminal-release')).toBeDisabled();
    });

    test('kiosk asks "Noch da?" and continues after confirming', async ({ page, request }) => {
      const machine = await setupMachine(request, {
        terminal: { maxSessionMinutes: 2, stillThereTimeoutMinutes: 5 },
      });
      await page.goto('/terminal');
      await page.getByTestId('terminal-setup-token').fill(machine.token);
      await page.getByTestId('terminal-setup-connect').click();

      await scan(request, machine, PERMITTED.tag.tagUid);
      await page.getByTestId('terminal-release').click();
      await expect(page.getByTestId('terminal-still-there')).toBeVisible({ timeout: 8000 });
      await page.getByTestId('terminal-still-there-confirm').click();
      await expect(page.getByTestId('terminal-still-there')).toBeHidden();
      await expect(page.getByTestId('terminal-released')).toBeVisible();
      expect(machine.shelly.switches[0].on).toBe(true);
    });
  });
});
