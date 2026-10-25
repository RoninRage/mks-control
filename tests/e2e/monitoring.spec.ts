import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { deleteDocumentsByType, getTestDatabaseConnection } from '../helpers/database';
import { createTestUser } from '../helpers/factories';
import {
  ADMIN_HEADERS,
  MEMBER_HEADERS,
  VORSTAND_HEADERS,
  API,
  addShellyDevice,
  cleanupMachines,
  keepPiOnline,
  releaseAt,
  scanAt,
  setupMachine,
  startTrackedShelly,
  terminalState,
  usagesAt,
} from '../helpers/machines';

// Phase 6 of docs/shelly-plan.md: admin remote switch-off, terminal overview, Shelly health
// monitor and push from the Shelly (Gen2 webhooks). .env.test runs the health monitor every
// second and points the webhooks at SHELLY_CALLBACK_URL=http://127.0.0.1:3000.

const LASER = { id: 'mo-eq-laser', name: 'MO Lasercutter', isAvailable: true };

const PAULA = createTestUser({
  member: {
    id: 'mo-member-paula',
    firstName: 'Paula',
    lastName: 'Monitor',
    equipmentPermissions: { [LASER.id]: true },
  },
  tag: { tagUid: 'mo-tag-paula' },
});

interface DeviceJson {
  id: string;
  health: string;
  eventKey?: string;
  push?: { state: string };
}

const resetEquipment = async (): Promise<void> => {
  const { membersDb } = getTestDatabaseConnection();
  const existing = await membersDb.find({ selector: { id: LASER.id }, limit: 5 });
  await membersDb.bulk({
    docs: [
      ...existing.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
      { ...LASER, type: 'equipment', isActive: true },
    ],
  });
};

test.describe('Monitoring', () => {
  test.beforeAll(async () => {
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await membersDb.bulk({ docs: [PAULA.member] });
    await tagsDb.bulk({ docs: [PAULA.tag] });
  });

  test.beforeEach(async () => {
    const { membersDb } = getTestDatabaseConnection();
    await deleteDocumentsByType(membersDb, 'terminal');
    await deleteDocumentsByType(membersDb, 'shellyDevice');
    await resetEquipment();
  });

  test.afterEach(async ({ request }) => {
    await cleanupMachines(request);
  });

  test.afterAll(async () => {
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await deleteDocumentsByType(membersDb, 'terminal');
    await deleteDocumentsByType(membersDb, 'shellyDevice');
    const docs = await membersDb.find({
      selector: { id: { $in: [LASER.id, PAULA.member.id] } },
      limit: 5,
    });
    await membersDb.bulk({
      docs: docs.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
    });
    const tags = await tagsDb.find({ selector: { tagUid: PAULA.tag.tagUid }, limit: 5 });
    await tagsDb.bulk({
      docs: tags.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
    });
  });

  test.describe('Terminal overview and remote switch-off', () => {
    test('shows Pi, login and running machine', async ({ request }) => {
      const machine = await setupMachine(request, { equipmentId: LASER.id });
      const statusOf = async () => {
        const list = await (
          await request.get(`${API}/terminals/status`, { headers: ADMIN_HEADERS })
        ).json();
        return list.find((s: { terminalId: string }) => s.terminalId === machine.terminalId);
      };

      expect(
        (await request.get(`${API}/terminals/status`, { headers: MEMBER_HEADERS })).status()
      ).toBe(403);
      expect(await statusOf()).toMatchObject({ piOnline: false, loggedIn: null, release: null });

      await terminalState(request, machine); // the Pi calls in
      await scanAt(request, machine, PAULA.tag.tagUid);
      expect(await statusOf()).toMatchObject({
        piOnline: true,
        loggedIn: { name: 'Paula Monitor' },
        release: null,
      });

      await releaseAt(request, machine);
      expect((await statusOf()).release).toMatchObject({
        memberName: 'Paula Monitor',
        shuttingDown: false,
        adminOverride: false,
      });
    });

    test('admins can switch a running machine off', async ({ request }) => {
      const machine = await setupMachine(request, { equipmentId: LASER.id });
      const forceOff = (headers: Record<string, string>) =>
        request.post(`${API}/equipment/${LASER.id}/force-off`, { headers });

      expect((await forceOff(ADMIN_HEADERS)).status()).toBe(409);

      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      expect((await forceOff(VORSTAND_HEADERS)).status()).toBe(403);
      expect(machine.shelly.switches[0].on).toBe(true);

      expect((await forceOff(ADMIN_HEADERS)).status()).toBe(200);
      expect(machine.shelly.switches[0].on).toBe(false);
      const [usage] = await usagesAt(machine.terminalId);
      expect(usage.endReason).toBe('admin');
      // The member stays logged in at the Pi.
      expect((await terminalState(request, machine)).session).not.toBeNull();
    });
  });

  test.describe('Health monitor', () => {
    test('notices devices going offline and coming back', async ({ request }) => {
      const shelly = await startTrackedShelly({ gen: 2, switches: 1 });
      const deviceId = await addShellyDevice(request, shelly);
      const health = async (): Promise<string | undefined> => {
        const list = (await (
          await request.get(`${API}/shelly/devices`, { headers: ADMIN_HEADERS })
        ).json()) as DeviceJson[];
        return list.find((d) => d.id === deviceId)?.health;
      };

      shelly.setOffline(true);
      await expect.poll(health, { timeout: 6000 }).toBe('offline');
      shelly.setOffline(false);
      await expect.poll(health, { timeout: 6000 }).toBe('online');
    });
  });

  test.describe('Push from the Shelly', () => {
    test('sets up webhooks for safety inputs and reacts to them', async ({ request }) => {
      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        shelly: { inputs: 1 },
      });
      await machine.shelly.setInput(0, true);
      const control = await request.put(`${API}/equipment/${LASER.id}/control`, {
        headers: ADMIN_HEADERS,
        data: {
          deviceId: machine.deviceId,
          kind: 'switch',
          index: 0,
          interlocks: [{ deviceId: machine.deviceId, index: 0, label: 'Haube', okWhen: 'closed' }],
        },
      });
      expect(control.status()).toBe(200);

      // Two webhooks (toggle on/off) for input 0, pointing at the backend.
      await expect.poll(() => machine.shelly.webhooks.length, { timeout: 5000 }).toBe(2);
      expect(machine.shelly.webhooks.map((h) => h.event).sort()).toEqual([
        'input.toggle_off',
        'input.toggle_on',
      ]);
      expect(machine.shelly.webhooks[0].urls[0]).toContain(
        `http://127.0.0.1:3000/api/shelly/events/${machine.deviceId}?key=`
      );

      // The key stays on the server; the push state is visible.
      const devices = (await (
        await request.get(`${API}/shelly/devices`, { headers: ADMIN_HEADERS })
      ).json()) as DeviceJson[];
      const device = devices.find((d) => d.id === machine.deviceId);
      expect(device?.eventKey).toBeUndefined();
      expect(device?.push?.state).toBe('active');

      // Wrong key is refused.
      const forged = await request.get(`${API}/shelly/events/${machine.deviceId}?key=wrong`);
      expect(forged.status()).toBe(403);

      keepPiOnline(request, machine);
      await scanAt(request, machine, PAULA.tag.tagUid);
      expect((await releaseAt(request, machine)).status()).toBe(200);

      // Opening the lid calls the webhook; the backend switches off.
      await machine.shelly.setInput(0, false);
      expect(machine.shelly.webhookDeliveries.at(-1)?.status).toBe(200);
      await expect
        .poll(async () => (await usagesAt(machine.terminalId))[0]?.endReason, { timeout: 3000 })
        .toBe('interlock');
      expect(machine.shelly.switches[0].on).toBe(false);

      // Removing the safety input removes the webhooks again.
      await request.put(`${API}/equipment/${LASER.id}/control`, {
        headers: ADMIN_HEADERS,
        data: { deviceId: machine.deviceId, kind: 'switch', index: 0, interlocks: [] },
      });
      await expect.poll(() => machine.shelly.webhooks.length, { timeout: 5000 }).toBe(0);
    });

    test('Gen1 devices are marked as polling only', async ({ request }) => {
      const shelly = await startTrackedShelly({
        gen: 1,
        switches: 1,
        inputs: 1,
        password: 'test-shelly-secret',
      });
      shelly.inputs[0] = true;
      const deviceId = await addShellyDevice(request, shelly);
      const response = await request.put(`${API}/equipment/${LASER.id}/control`, {
        headers: ADMIN_HEADERS,
        data: {
          deviceId,
          kind: 'switch',
          index: 0,
          interlocks: [{ deviceId, index: 0, label: 'Tür', okWhen: 'closed' }],
        },
      });
      expect(response.status()).toBe(200);
      await expect
        .poll(
          async () => {
            const list = (await (
              await request.get(`${API}/shelly/devices`, { headers: ADMIN_HEADERS })
            ).json()) as DeviceJson[];
            return list.find((d) => d.id === deviceId)?.push?.state;
          },
          { timeout: 5000 }
        )
        .toBe('unsupported');
    });
  });

  test.describe('UI', () => {
    test('admin sees the running machine and switches it off', async ({ page, request }) => {
      const machine = await setupMachine(request, { equipmentId: LASER.id });
      keepPiOnline(request, machine);
      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);

      await loginAsAdmin(page);
      await page.goto('/terminals');
      const card = page.locator(`[data-terminal-id="${machine.terminalId}"]`);
      await expect(card.getByTestId('terminal-card-pi')).toHaveAttribute('data-online', 'true');
      await expect(card.getByTestId('terminal-card-running')).toContainText('Paula Monitor');

      await card.getByTestId('terminal-card-force-off').click();
      await page.getByRole('button', { name: 'Abschalten' }).last().click();
      await expect(card.getByTestId('terminal-card-running')).toHaveCount(0);
      await expect(card.getByTestId('terminal-card-logged-in')).toContainText('Paula Monitor');
      expect(machine.shelly.switches[0].on).toBe(false);
    });

    test('device page updates health live', async ({ page, request }) => {
      const shelly = await startTrackedShelly({ gen: 2, switches: 1 });
      await addShellyDevice(request, shelly, 'MO Live');

      await loginAsAdmin(page);
      await page.goto('/devices');
      const card = page.getByTestId('device-card').filter({ hasText: 'MO Live' });
      await expect(card.getByTestId('device-health')).toHaveAttribute('data-health', 'online');

      shelly.setOffline(true);
      // Faster than the page's own 10 s polling: the WebSocket event updates it.
      await expect(card.getByTestId('device-health')).toHaveAttribute('data-health', 'offline', {
        timeout: 6000,
      });
    });
  });
});
