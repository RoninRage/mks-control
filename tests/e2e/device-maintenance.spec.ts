import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { deleteDocumentsByType, getTestDatabaseConnection } from '../helpers/database';
import { createTestUser } from '../helpers/factories';
import {
  ADMIN_HEADERS,
  MEMBER_HEADERS,
  API,
  SHELLY_PASSWORD,
  addShellyDevice,
  cleanupMachines,
  releaseAt,
  scanAt,
  setupMachine,
  startTrackedShelly,
  terminalState,
} from '../helpers/machines';

// Phase 7 of docs/shelly-plan.md: discovery reports, maintenance mode, firmware updates.
// .env.test sets SHELLY_DISCOVERY_TOKEN=test-discovery-token.

const DISCOVERY_TOKEN = 'test-discovery-token';
const LASER = { id: 'dm-eq-laser', name: 'DM Lasercutter', isAvailable: true };

const PAULA = createTestUser({
  member: {
    id: 'dm-member-paula',
    firstName: 'Paula',
    lastName: 'Wartung',
    equipmentPermissions: { [LASER.id]: true },
  },
  tag: { tagUid: 'dm-tag-paula' },
});

interface DeviceJson {
  id: string;
  host: string;
  maintenance?: boolean;
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

test.describe('Device discovery, maintenance and firmware', () => {
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

  test.describe('Discovery', () => {
    const report = (
      request: Parameters<typeof addShellyDevice>[0],
      token: string | null,
      devices: unknown
    ) =>
      request.post(`${API}/shelly/discovered`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        data: { devices },
      });

    test('accepts reports from the relay and lists new devices for admins', async ({ request }) => {
      const known = await startTrackedShelly({ gen: 2, switches: 1 });
      await addShellyDevice(request, known);

      expect((await report(request, null, [])).status()).toBe(401);
      expect((await report(request, 'wrong', [])).status()).toBe(401);

      const accepted = await report(request, DISCOVERY_TOKEN, [
        { host: '192.168.50.21', name: 'shellyplus1pm-aaaa' },
        { host: '8.8.8.8', name: 'shelly-outside' }, // not a local address
        { host: known.host, name: 'already registered' },
      ]);
      expect(await accepted.json()).toEqual({ accepted: 2 });

      expect(
        (await request.get(`${API}/shelly/discovered`, { headers: MEMBER_HEADERS })).status()
      ).toBe(403);
      const list = await (
        await request.get(`${API}/shelly/discovered`, { headers: ADMIN_HEADERS })
      ).json();
      const hosts = list.map((d: { host: string }) => d.host);
      expect(hosts).toContain('192.168.50.21');
      expect(hosts).not.toContain('8.8.8.8');
      expect(hosts).not.toContain(known.host);
    });

    test('found devices can be added with one click', async ({ page, request }) => {
      const shelly = await startTrackedShelly({
        gen: 2,
        switches: 1,
        password: SHELLY_PASSWORD,
        name: 'Gefundener Shelly',
      });
      await report(request, DISCOVERY_TOKEN, [{ host: shelly.host, name: shelly.shellyId }]);

      await loginAsAdmin(page);
      await page.goto('/devices');
      await page.getByTestId('devices-empty-add').click();
      const item = page.locator(
        `[data-testid="devices-discovered-item"][data-host="${shelly.host}"]`
      );
      await expect(item).toBeVisible();
      await item.click();
      await expect(page.getByTestId('devices-add-model')).toContainText('Gen2');
      await expect(page.getByTestId('devices-add-name')).toHaveValue('Gefundener Shelly');
    });
  });

  test.describe('Maintenance mode', () => {
    test('blocks releases and cannot start while a machine runs', async ({ request }) => {
      const machine = await setupMachine(request, { equipmentId: LASER.id });
      const setMaintenance = (enabled: boolean) =>
        request.put(`${API}/shelly/devices/${machine.deviceId}/maintenance`, {
          headers: ADMIN_HEADERS,
          data: { enabled },
        });

      // Not while the machine is released.
      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      expect((await setMaintenance(true)).status()).toBe(409);
      await scanAt(request, machine, PAULA.tag.tagUid); // logout, machine off

      const on = await setMaintenance(true);
      expect(on.status()).toBe(200);
      expect((await on.json()).maintenance).toBe(true);

      await scanAt(request, machine, PAULA.tag.tagUid);
      expect((await terminalState(request, machine)).machine.blockReason).toBe('maintenance');
      const refused = await releaseAt(request, machine);
      expect(refused.status()).toBe(409);
      expect((await refused.json()).code).toBe('maintenance');
      expect(machine.shelly.switches[0].on).toBe(false);

      expect((await setMaintenance(false)).status()).toBe(200);
      expect((await releaseAt(request, machine)).status()).toBe(200);
    });

    test('the health monitor leaves devices in maintenance alone', async ({ request }) => {
      const shelly = await startTrackedShelly({ gen: 2, switches: 1 });
      const deviceId = await addShellyDevice(request, shelly);
      await request.put(`${API}/shelly/devices/${deviceId}/maintenance`, {
        headers: ADMIN_HEADERS,
        data: { enabled: true },
      });

      shelly.setOffline(true); // e.g. rebooting for an update
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const list = (await (
        await request.get(`${API}/shelly/devices`, { headers: ADMIN_HEADERS })
      ).json()) as Array<DeviceJson & { health: string }>;
      expect(list.find((d) => d.id === deviceId)?.health).toBe('online');
    });
  });

  test.describe('Firmware', () => {
    test('Gen2: check and update only in maintenance mode', async ({ request }) => {
      const shelly = await startTrackedShelly({ gen: 2, switches: 1, availableFirmware: '1.5.0' });
      const deviceId = await addShellyDevice(request, shelly);

      const check = await request.get(`${API}/shelly/devices/${deviceId}/firmware`, {
        headers: ADMIN_HEADERS,
      });
      expect(await check.json()).toMatchObject({ current: '1.4.4', available: '1.5.0' });

      const update = () =>
        request.post(`${API}/shelly/devices/${deviceId}/firmware/update`, {
          headers: ADMIN_HEADERS,
        });
      const refused = await update();
      expect(refused.status()).toBe(409);
      expect((await refused.json()).error).toContain('Wartungsmodus');

      await request.put(`${API}/shelly/devices/${deviceId}/maintenance`, {
        headers: ADMIN_HEADERS,
        data: { enabled: true },
      });
      const started = await update();
      expect(started.status()).toBe(200);
      expect(await started.json()).toMatchObject({ started: true, from: '1.4.4', to: '1.5.0' });
      expect(shelly.firmware).toMatchObject({ current: '1.5.0', updates: 1 });

      // Nothing newer left.
      expect((await update()).status()).toBe(409);
    });

    test('Gen1: check and update', async ({ request }) => {
      const shelly = await startTrackedShelly({
        gen: 1,
        switches: 1,
        availableFirmware: 'v1.14.1',
      });
      const deviceId = await addShellyDevice(request, shelly);
      const check = await (
        await request.get(`${API}/shelly/devices/${deviceId}/firmware`, { headers: ADMIN_HEADERS })
      ).json();
      expect(check).toMatchObject({ current: 'v1.14.0', available: 'v1.14.1' });

      await request.put(`${API}/shelly/devices/${deviceId}/maintenance`, {
        headers: ADMIN_HEADERS,
        data: { enabled: true },
      });
      const started = await request.post(`${API}/shelly/devices/${deviceId}/firmware/update`, {
        headers: ADMIN_HEADERS,
      });
      expect(started.status()).toBe(200);
      expect(shelly.firmware.updates).toBe(1);
      expect(shelly.calls.some((c) => c.path === '/ota?update=true')).toBe(true);
    });

    test('device page: maintenance and firmware update', async ({ page, request }) => {
      const shelly = await startTrackedShelly({
        gen: 2,
        switches: 1,
        availableFirmware: '1.6.0',
      });
      await addShellyDevice(request, shelly, 'DM Shelly');

      await loginAsAdmin(page);
      await page.goto('/devices');
      const card = page.getByTestId('device-card').filter({ hasText: 'DM Shelly' });

      await card.getByTestId('device-firmware-check').click();
      await expect(card.getByTestId('device-firmware-available')).toContainText('1.6.0');
      await expect(card.getByTestId('device-firmware-update')).toBeDisabled();

      await card.getByTestId('device-maintenance-toggle').click();
      await expect(card.getByTestId('device-maintenance')).toBeVisible();
      await card.getByTestId('device-firmware-update').click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Installieren', exact: true })
        .click();
      await expect.poll(() => shelly.firmware.updates).toBe(1);

      await card.getByTestId('device-maintenance-toggle').click();
      await expect(card.getByTestId('device-maintenance')).toHaveCount(0);
    });
  });
});
