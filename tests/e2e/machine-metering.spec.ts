import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAs, loginAsAdmin } from '../helpers/auth';
import {
  deleteDocumentsByType,
  getTestDatabaseConnection,
  getTestUsageDatabase,
} from '../helpers/database';
import { createTestUser } from '../helpers/factories';
import {
  ADMIN_HEADERS,
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

// Phase 4 of docs/shelly-plan.md: power metering, "switch off when idle", kWh per usage,
// usage list per role, retention. One configured "minute" lasts one second in tests.

const LASER = { id: 'mm-eq-laser', name: 'MM Lasercutter', isAvailable: true };
const DRILL = {
  id: 'mm-eq-drill',
  name: 'MM Standbohrmaschine',
  isAvailable: true,
  areaId: 'mm-area',
};
const AREA = {
  type: 'area',
  id: 'mm-area',
  name: 'MM Holzwerkstatt',
  description: '',
  bereichsleiterIds: ['mm-member-lead'],
  isActive: true,
};

const PAULA = createTestUser({
  member: {
    id: 'mm-member-paula',
    firstName: 'Paula',
    lastName: 'Plasma',
    equipmentPermissions: { [LASER.id]: true },
  },
  tag: { tagUid: 'mm-tag-paula' },
});
const MARIO = createTestUser({
  member: {
    id: 'mm-member-mario',
    firstName: 'Mario',
    lastName: 'Metall',
    equipmentPermissions: { [LASER.id]: true },
  },
  tag: { tagUid: 'mm-tag-mario' },
});
const LEAD = createTestUser({
  member: {
    id: 'mm-member-lead',
    firstName: 'Lena',
    lastName: 'Leitung',
    roles: ['bereichsleitung', 'mitglied'],
  },
  tag: { tagUid: 'mm-tag-lead' },
});

const WHEN_IDLE = { mode: 'when-idle', idleThresholdW: 20, idleSeconds: 1, maxWaitMinutes: 4 };

const resetEquipment = async (): Promise<void> => {
  const { membersDb } = getTestDatabaseConnection();
  const existing = await membersDb.find({
    selector: { id: { $in: [LASER.id, DRILL.id] } },
    limit: 10,
  });
  await membersDb.bulk({
    docs: [
      ...existing.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
      ...[LASER, DRILL].map((e) => ({ ...e, type: 'equipment', isActive: true })),
    ],
  });
};

test.describe('Machine metering and usages', () => {
  test.beforeAll(async () => {
    const { membersDb, tagsDb } = getTestDatabaseConnection();
    await membersDb.bulk({ docs: [AREA, PAULA.member, MARIO.member, LEAD.member] });
    await tagsDb.bulk({ docs: [PAULA.tag, MARIO.tag, LEAD.tag] });
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
    const ids = [LASER.id, DRILL.id, AREA.id, PAULA.member.id, MARIO.member.id, LEAD.member.id];
    const docs = await membersDb.find({ selector: { id: { $in: ids } }, limit: 20 });
    await membersDb.bulk({
      docs: docs.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
    });
    const tags = await tagsDb.find({
      selector: { tagUid: { $in: [PAULA.tag.tagUid, MARIO.tag.tagUid, LEAD.tag.tagUid] } },
      limit: 20,
    });
    await tagsDb.bulk({
      docs: tags.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
    });
  });

  test.describe('Configuration', () => {
    test('switching off when idle needs power metering', async ({ request }) => {
      const plain = await startTrackedShelly({ gen: 2, switches: 1, inputs: 1 });
      const plainId = await addShellyDevice(request, plain);
      const meter = await startTrackedShelly({ gen: 2, meters: 1 });
      const meterId = await addShellyDevice(request, meter);
      const put = (data: Record<string, unknown>) =>
        request.put(`${API}/equipment/${LASER.id}/control`, {
          headers: ADMIN_HEADERS,
          data: { deviceId: plainId, kind: 'switch', index: 0, ...data },
        });

      const noMeter = await put({ shutdown: WHEN_IDLE });
      expect(noMeter.status()).toBe(400);
      expect((await noMeter.json()).error).toContain('Leistungsmessung');

      // An input does not measure power.
      expect(
        (
          await put({ shutdown: WHEN_IDLE, meter: { deviceId: plainId, kind: 'input', index: 0 } })
        ).status()
      ).toBe(400);
      expect((await put({ shutdown: { ...WHEN_IDLE, idleSeconds: 0 } })).status()).toBe(400);

      const withMeter = await put({
        shutdown: WHEN_IDLE,
        meter: { deviceId: meterId, kind: 'meter', index: 0 },
      });
      expect(withMeter.status()).toBe(200);
      expect((await withMeter.json()).control).toMatchObject({
        shutdown: WHEN_IDLE,
        meter: { deviceId: meterId, kind: 'meter', index: 0 },
      });

      // A device used as meter cannot be retired either.
      const retire = await request.delete(`${API}/shelly/devices/${meterId}`, {
        headers: ADMIN_HEADERS,
      });
      expect(retire.status()).toBe(409);
    });
  });

  test.describe('Power and energy', () => {
    test('shows the power and records the energy used', async ({ request }) => {
      const machine = await setupMachine(request, { equipmentId: LASER.id });
      machine.shelly.switches[0].energyWh = 10_000;
      machine.shelly.switches[0].powerW = 1500;

      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      await expect
        .poll(async () => (await terminalState(request, machine)).machine.powerW, {
          timeout: 3000,
        })
        .toBe(1500);
      expect((await terminalState(request, machine)).machine).toMatchObject({
        metered: true,
        shutdownMode: 'immediate',
      });

      machine.shelly.switches[0].energyWh = 10_420;
      await scanAt(request, machine, PAULA.tag.tagUid);
      const [usage] = await usagesAt(machine.terminalId);
      expect(usage).toMatchObject({ endReason: 'logout', energyWh: 420 });
    });
  });

  test.describe('Switching off when idle', () => {
    test('keeps running after logout until the power drops', async ({ request }) => {
      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        control: { shutdown: WHEN_IDLE },
      });
      keepPiOnline(request, machine);
      machine.shelly.switches[0].powerW = 800;
      machine.shelly.switches[0].energyWh = 500;

      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      await scanAt(request, machine, PAULA.tag.tagUid); // logout

      const state = await terminalState(request, machine);
      expect(state.session).toBeNull();
      expect(state.machine.release.shuttingDown).toMatchObject({ idleThresholdW: 20 });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(machine.shelly.switches[0].on).toBe(true);

      // Job finished: power drops below the threshold.
      machine.shelly.switches[0].energyWh = 650;
      machine.shelly.switches[0].powerW = 4;
      await expect
        .poll(async () => (await usagesAt(machine.terminalId))[0]?.endReason, { timeout: 6000 })
        .toBe('logout');
      expect(machine.shelly.switches[0].on).toBe(false);
      expect((await usagesAt(machine.terminalId))[0].energyWh).toBe(150);
    });

    test('switches off at the maximum wait even if still busy', async ({ request }) => {
      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        control: { shutdown: { ...WHEN_IDLE, maxWaitMinutes: 2 } },
      });
      keepPiOnline(request, machine);
      machine.shelly.switches[0].powerW = 800;

      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      await request.post(`${API}/terminal/logout`, { headers: machine.headers });
      expect(machine.shelly.switches[0].on).toBe(true);

      await expect
        .poll(async () => (await usagesAt(machine.terminalId))[0]?.endReason, { timeout: 6000 })
        .toBe('logout');
      expect(machine.shelly.switches[0].on).toBe(false);
    });

    test('another permitted member can take over without interruption', async ({ request }) => {
      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        control: { shutdown: WHEN_IDLE },
      });
      keepPiOnline(request, machine);
      machine.shelly.switches[0].powerW = 800;
      machine.shelly.switches[0].energyWh = 100;

      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      await scanAt(request, machine, PAULA.tag.tagUid);

      machine.shelly.switches[0].energyWh = 130;
      await scanAt(request, machine, MARIO.tag.tagUid);
      const takeover = await releaseAt(request, machine);
      expect(takeover.status()).toBe(200);
      const body = await takeover.json();
      expect(body.machine.release).toMatchObject({ memberName: 'Mario Metall' });
      expect(body.machine.release.shuttingDown).toBeUndefined();
      expect(machine.shelly.switches[0].on).toBe(true);

      const usages = await usagesAt(machine.terminalId);
      expect(usages).toHaveLength(2);
      expect(usages[0]).toMatchObject({
        memberId: PAULA.member.id,
        endReason: 'handover',
        energyWh: 30,
      });
      expect(usages[1]).toMatchObject({ memberId: MARIO.member.id });
      expect(usages[1].endedAt).toBeUndefined();
    });

    test('uses a separate meter when the output does not measure', async ({ request }) => {
      const meter = await startTrackedShelly({ gen: 1, model: 'SHEM', meters: 1 });
      const meterId = await addShellyDevice(request, meter);
      meter.meters[0].powerW = 900;

      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        shelly: { metered: false },
        control: { shutdown: WHEN_IDLE, meter: { deviceId: meterId, kind: 'meter', index: 0 } },
      });
      keepPiOnline(request, machine);

      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      await expect
        .poll(async () => (await terminalState(request, machine)).machine.powerW, { timeout: 3000 })
        .toBe(900);

      await scanAt(request, machine, PAULA.tag.tagUid);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(machine.shelly.switches[0].on).toBe(true);

      meter.meters[0].powerW = 0;
      await expect
        .poll(async () => (await usagesAt(machine.terminalId))[0]?.endReason, { timeout: 6000 })
        .toBe('logout');
      expect(machine.shelly.switches[0].on).toBe(false);
    });
  });

  test.describe('Usage list', () => {
    const now = new Date().toISOString();
    const usage = (id: string, equipmentId: string, memberId: string, energyWh: number) => ({
      type: 'equipmentUsage',
      id,
      equipmentId,
      terminalId: 'mm-terminal',
      memberId,
      memberName: memberId,
      adminOverride: false,
      startedAt: now,
      endedAt: now,
      durationSec: 600,
      endReason: 'logout',
      energyWh,
    });
    const DOCS = [
      usage('mm-u-paula', LASER.id, PAULA.member.id, 1000),
      usage('mm-u-mario', LASER.id, MARIO.member.id, 2000),
      usage('mm-u-drill', DRILL.id, 'mm-member-someone', 500),
      usage('mm-u-lead', LASER.id, LEAD.member.id, 250),
    ];

    test.beforeAll(async () => {
      await getTestUsageDatabase().bulk({ docs: DOCS });
    });

    test.afterAll(async () => {
      const db = getTestUsageDatabase();
      const found = await db.find({
        selector: { id: { $in: DOCS.map((d) => d.id) } },
        limit: 20,
      });
      await db.bulk({
        docs: found.docs.map((d: Record<string, unknown>) => ({ ...d, _deleted: true })),
      });
    });

    const idsFor = async (
      request: APIRequestContext,
      headers: Record<string, string>,
      query = ''
    ): Promise<string[]> => {
      const response = await request.get(`${API}/usage${query}`, { headers });
      expect(response.status()).toBe(200);
      const body = await response.json();
      return (body.usages as Array<{ id: string }>)
        .map((u) => u.id)
        .filter((id) => id.startsWith('mm-u-'))
        .sort();
    };

    test('visibility follows the roles', async ({ request }) => {
      expect((await request.get(`${API}/usage`)).status()).toBe(403);

      const all = ['mm-u-drill', 'mm-u-lead', 'mm-u-mario', 'mm-u-paula'];
      expect(await idsFor(request, ADMIN_HEADERS)).toEqual(all);
      expect(await idsFor(request, { 'x-user-role': 'vorstand', 'x-user-id': 'v' })).toEqual(all);

      // Bereichsleitung: equipment in own areas plus own usages.
      expect(
        await idsFor(request, { 'x-user-role': 'bereichsleitung', 'x-user-id': LEAD.member.id })
      ).toEqual(['mm-u-drill', 'mm-u-lead']);

      // Members: only their own, even when asking for someone else.
      const paula = { 'x-user-role': 'mitglied', 'x-user-id': PAULA.member.id };
      expect(await idsFor(request, paula)).toEqual(['mm-u-paula']);
      expect(await idsFor(request, paula, `?memberId=${MARIO.member.id}`)).toEqual([]);
    });

    test('filters and totals', async ({ request }) => {
      const response = await request.get(`${API}/usage?equipmentId=${DRILL.id}`, {
        headers: ADMIN_HEADERS,
      });
      const body = await response.json();
      expect(body.usages).toHaveLength(1);
      expect(body.usages[0]).toMatchObject({ equipmentName: DRILL.name, energyWh: 500 });
      expect(body.usages[0]._id).toBeUndefined();
      expect(body.totals).toEqual({ count: 1, durationSec: 600, energyWh: 500 });

      const byMember = await (
        await request.get(`${API}/usage?memberId=${MARIO.member.id}`, { headers: ADMIN_HEADERS })
      ).json();
      // Mario also has real usages from the takeover test; only check the seeded ones.
      const seeded = byMember.usages
        .map((u: { id: string; memberId: string }) => u)
        .filter((u: { id: string }) => u.id.startsWith('mm-u-'));
      expect(seeded.map((u: { id: string }) => u.id)).toEqual(['mm-u-mario']);
      expect(
        byMember.usages.every((u: { memberId: string }) => u.memberId === MARIO.member.id)
      ).toBe(true);

      const future = await (
        await request.get(`${API}/usage?from=2999-01-01`, { headers: ADMIN_HEADERS })
      ).json();
      expect(future.totals.count).toBe(0);
    });

    test('old usages are deleted after the retention period', async () => {
      const db = getTestUsageDatabase();
      const old = new Date(Date.now() - 400 * 86_400_000).toISOString();
      await db.bulk({
        docs: [
          { ...usage('mm-u-old', LASER.id, PAULA.member.id, 1), startedAt: old, endedAt: old },
        ],
      });
      // The cleanup runs every 2 s in tests (USAGE_CLEANUP_INTERVAL_MS).
      await expect
        .poll(async () => (await db.find({ selector: { id: 'mm-u-old' }, limit: 1 })).docs.length, {
          timeout: 10_000,
          intervals: [500],
        })
        .toBe(0);
      // Recent usages stay.
      expect((await db.find({ selector: { id: 'mm-u-paula' }, limit: 1 })).docs).toHaveLength(1);
    });

    test('admin sees usages with totals on the usage page', async ({ page }) => {
      await loginAsAdmin(page);
      await page.getByTestId('dashboard-usage').click();
      await expect(page).toHaveURL(/\/usage/);
      await expect(page.locator('[data-usage-id="mm-u-drill"]')).toBeVisible();
      await expect(page.locator('[data-usage-id="mm-u-drill"]')).toContainText(DRILL.name);
      await expect(page.getByTestId('usage-filter-member')).toBeVisible();
    });

    test('members see only their own usages', async ({ page }) => {
      await loginAs(page, 'member', PAULA.tag.tagUid);
      await page.goto('/usage');
      await expect(page.getByTestId('usage-scope')).toContainText('Ihre eigenen');
      await expect(page.locator('[data-usage-id="mm-u-paula"]')).toBeVisible();
      await expect(page.locator('[data-usage-id="mm-u-mario"]')).toHaveCount(0);
      await expect(page.getByTestId('usage-filter-member')).toHaveCount(0);
    });
  });

  test.describe('UI', () => {
    test('kiosk shows power, shutdown wait and takeover', async ({ page, request }) => {
      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        control: { shutdown: { ...WHEN_IDLE, maxWaitMinutes: 30 } },
      });
      machine.shelly.switches[0].powerW = 750;

      await page.goto('/terminal');
      await page.getByTestId('terminal-setup-token').fill(machine.token);
      await page.getByTestId('terminal-setup-connect').click();

      await scanAt(request, machine, PAULA.tag.tagUid);
      await page.getByTestId('terminal-release').click();
      await expect(page.getByTestId('terminal-power')).toContainText('750 W');
      await expect(page.getByTestId('terminal-logout')).toContainText('bis Jobende');

      await page.getByTestId('terminal-logout').click();
      await expect(page.getByTestId('terminal-ready')).toBeVisible();
      await expect(page.getByTestId('terminal-shutting-down')).toBeVisible();

      await scanAt(request, machine, MARIO.tag.tagUid);
      await expect(page.getByTestId('terminal-release')).toContainText('übernehmen');
      await page.getByTestId('terminal-release').click();
      await expect(page.getByTestId('terminal-released')).toBeVisible();
      await expect(page.getByTestId('terminal-shutting-down')).toHaveCount(0);
    });

    test('admin sets "switch off when idle" on the equipment page', async ({ page, request }) => {
      const shelly = await startTrackedShelly({
        gen: 2,
        switches: 1,
        metered: true,
        password: 'test-shelly-secret',
      });
      await addShellyDevice(request, shelly, 'MM Shelly PM');

      await loginAsAdmin(page);
      await page.goto(`/equipment/${LASER.id}/edit`);
      await page.getByTestId('equipment-control-device').click();
      await page.getByRole('option', { name: /MM Shelly PM/ }).click();
      await page.getByTestId('equipment-control-shutdown').click();
      await page.getByRole('option', { name: /Leerlauf/ }).click();
      await page.getByTestId('equipment-control-idle-threshold').fill('15');
      await page.getByTestId('equipment-control-save').click();
      await expect(page.getByTestId('equipment-control-remove')).toBeVisible();

      const equipment = await (await request.get(`${API}/equipment/${LASER.id}`)).json();
      expect(equipment.control.shutdown).toEqual({
        mode: 'when-idle',
        idleThresholdW: 15,
        idleSeconds: 60,
        maxWaitMinutes: 30,
      });
    });
  });
});
