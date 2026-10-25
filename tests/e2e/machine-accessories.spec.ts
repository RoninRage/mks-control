import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth';
import { deleteDocumentsByType, getTestDatabaseConnection } from '../helpers/database';
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
  type TestMachine,
} from '../helpers/machines';
import type { MockShelly } from '../helpers/mockShelly';

// Phase 5 of docs/shelly-plan.md: safety inputs (interlocks) and extra controls at the Pi.
// One configured "minute" lasts one second in tests (safety timer = 3 s).

const LASER = { id: 'ma-eq-laser', name: 'MA Lasercutter', isAvailable: true };

const PAULA = createTestUser({
  member: {
    id: 'ma-member-paula',
    firstName: 'Paula',
    lastName: 'Pi',
    equipmentPermissions: { [LASER.id]: true },
  },
  tag: { tagUid: 'ma-tag-paula' },
});

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

// Machine with a lid contact on its own Shelly (input 0, safe when closed).
const machineWithLid = async (
  request: APIRequestContext,
  control: Record<string, unknown> = {},
  okWhen: 'closed' | 'open' = 'closed'
): Promise<TestMachine> => {
  const machine = await setupMachine(request, {
    equipmentId: LASER.id,
    shelly: { inputs: 1 },
    control: {},
  });
  machine.shelly.inputs[0] = okWhen === 'closed';
  const response = await request.put(`${API}/equipment/${LASER.id}/control`, {
    headers: ADMIN_HEADERS,
    data: {
      deviceId: machine.deviceId,
      kind: 'switch',
      index: 0,
      interlocks: [{ deviceId: machine.deviceId, index: 0, label: 'Schutzhaube', okWhen }],
      ...control,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return machine;
};

// Extra outputs on a second Shelly: relay (extraction), light, cover.
const extrasShelly = async (
  request: APIRequestContext
): Promise<{ shelly: MockShelly; deviceId: string }> => {
  const shelly = await startTrackedShelly({ gen: 2, switches: 1, lights: 1, covers: 1 });
  const deviceId = await addShellyDevice(request, shelly, 'MA Extras');
  return { shelly, deviceId };
};

test.describe('Safety inputs and extra controls', () => {
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

  test.describe('Configuration', () => {
    test('validates safety inputs and extras', async ({ request }) => {
      const main = await startTrackedShelly({ gen: 2, switches: 1, inputs: 1 });
      const mainId = await addShellyDevice(request, main);
      const extras = await extrasShelly(request);
      const put = (data: Record<string, unknown>) =>
        request.put(`${API}/equipment/${LASER.id}/control`, {
          headers: ADMIN_HEADERS,
          data: { deviceId: mainId, kind: 'switch', index: 0, ...data },
        });
      const lid = { deviceId: mainId, index: 0, label: 'Haube', okWhen: 'closed' };

      // Not an input / missing safe state / no label.
      expect((await put({ interlocks: [{ ...lid, deviceId: extras.deviceId }] })).status()).toBe(
        400
      );
      expect((await put({ interlocks: [{ ...lid, okWhen: undefined }] })).status()).toBe(400);
      expect((await put({ interlocks: [{ ...lid, label: ' ' }] })).status()).toBe(400);

      // The main output cannot be an extra; channels must exist.
      expect(
        (
          await put({
            extras: [
              { deviceId: mainId, kind: 'switch', index: 0, label: 'X', offWithMachine: false },
            ],
          })
        ).status()
      ).toBe(400);
      expect(
        (
          await put({
            extras: [
              {
                deviceId: extras.deviceId,
                kind: 'light',
                index: 3,
                label: 'X',
                offWithMachine: false,
              },
            ],
          })
        ).status()
      ).toBe(400);

      const ok = await put({
        interlocks: [lid],
        extras: [
          {
            deviceId: extras.deviceId,
            kind: 'switch',
            index: 0,
            label: 'Absaugung',
            offWithMachine: true,
          },
          {
            deviceId: extras.deviceId,
            kind: 'cover',
            index: 0,
            label: 'Rollo',
            offWithMachine: true,
          },
        ],
      });
      expect(ok.status()).toBe(200);
      const control = (await ok.json()).control;
      expect(control.interlocks).toEqual([lid]);
      expect(control.extras).toHaveLength(2);
      expect(control.extras[0].id).toBeTruthy();
      // Covers are never switched off with the machine.
      expect(control.extras[1].offWithMachine).toBe(false);

      // Devices used for extras cannot be retired.
      const retire = await request.delete(`${API}/shelly/devices/${extras.deviceId}`, {
        headers: ADMIN_HEADERS,
      });
      expect(retire.status()).toBe(409);
    });
  });

  test.describe('Safety inputs', () => {
    test('blocks the release while a safety input is open', async ({ request }) => {
      const machine = await machineWithLid(request);
      machine.shelly.inputs[0] = false; // lid open

      await scanAt(request, machine, PAULA.tag.tagUid);
      const state = await terminalState(request, machine);
      expect(state.machine.blockReason).toBe('interlock-open');
      expect(state.machine.interlocks).toEqual([{ label: 'Schutzhaube', ok: false }]);

      const refused = await releaseAt(request, machine);
      expect(refused.status()).toBe(409);
      expect((await refused.json()).code).toBe('interlock-open');
      expect(machine.shelly.switches[0].on).toBe(false);

      machine.shelly.inputs[0] = true; // lid closed
      expect((await releaseAt(request, machine)).status()).toBe(200);
      expect(machine.shelly.switches[0].on).toBe(true);
    });

    test('supports contacts that are safe when open', async ({ request }) => {
      const machine = await machineWithLid(request, {}, 'open');
      await scanAt(request, machine, PAULA.tag.tagUid);

      machine.shelly.inputs[0] = true;
      expect((await releaseAt(request, machine)).status()).toBe(409);
      machine.shelly.inputs[0] = false;
      expect((await releaseAt(request, machine)).status()).toBe(200);
    });

    test('switches off at once when a safety input opens', async ({ request }) => {
      const machine = await machineWithLid(request);
      keepPiOnline(request, machine);
      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);

      machine.shelly.inputs[0] = false;
      await expect
        .poll(async () => (await usagesAt(machine.terminalId))[0]?.endReason, { timeout: 3000 })
        .toBe('interlock');
      expect(machine.shelly.switches[0].on).toBe(false);
      // The member stays logged in and can release again once the lid is closed.
      expect((await terminalState(request, machine)).session).not.toBeNull();
    });

    test('also during the wait for idle', async ({ request }) => {
      const machine = await machineWithLid(request, {
        shutdown: { mode: 'when-idle', idleThresholdW: 20, idleSeconds: 1, maxWaitMinutes: 30 },
      });
      keepPiOnline(request, machine);
      machine.shelly.switches[0].powerW = 900;
      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);
      await scanAt(request, machine, PAULA.tag.tagUid); // logout → waits for idle
      expect(machine.shelly.switches[0].on).toBe(true);

      machine.shelly.inputs[0] = false;
      await expect
        .poll(async () => (await usagesAt(machine.terminalId))[0]?.endReason, { timeout: 3000 })
        .toBe('interlock');
      expect(machine.shelly.switches[0].on).toBe(false);
    });

    test('switches off when a safety input stays unreadable', async ({ request }) => {
      const lidShelly = await startTrackedShelly({ gen: 2, inputs: 1 });
      lidShelly.inputs[0] = true;
      const lidId = await addShellyDevice(request, lidShelly, 'MA Haube');
      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        control: {
          interlocks: [{ deviceId: lidId, index: 0, label: 'Haube', okWhen: 'closed' }],
        },
      });
      keepPiOnline(request, machine);
      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);

      lidShelly.setOffline(true);
      // Tolerated for one safety-timer period (3 s), then off.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(machine.shelly.switches[0].on).toBe(true);
      await expect
        .poll(async () => (await usagesAt(machine.terminalId))[0]?.endReason, { timeout: 6000 })
        .toBe('interlock');
    });
  });

  test.describe('Extra controls', () => {
    test('are operated while released and follow the machine off', async ({ request }) => {
      const extras = await extrasShelly(request);
      const machine = await setupMachine(request, {
        equipmentId: LASER.id,
        control: {
          extras: [
            {
              deviceId: extras.deviceId,
              kind: 'switch',
              index: 0,
              label: 'Absaugung',
              offWithMachine: true,
            },
            {
              deviceId: extras.deviceId,
              kind: 'light',
              index: 0,
              label: 'Licht',
              offWithMachine: false,
            },
            {
              deviceId: extras.deviceId,
              kind: 'cover',
              index: 0,
              label: 'Rollo',
              offWithMachine: false,
            },
          ],
        },
      });
      const state = await terminalState(request, machine);
      const [extraction, light, cover] = state.machine.extras as Array<{
        id: string;
        label: string;
      }>;
      expect([extraction.label, light.label, cover.label]).toEqual(['Absaugung', 'Licht', 'Rollo']);
      const run = (id: string, data: Record<string, unknown>) =>
        request.post(`${API}/terminal/extras/${id}`, { headers: machine.headers, data });

      // Not without a release, not without the key.
      expect((await run(extraction.id, { action: 'on' })).status()).toBe(409);
      expect(
        (
          await request.post(`${API}/terminal/extras/${extraction.id}`, { data: { action: 'on' } })
        ).status()
      ).toBe(401);

      await scanAt(request, machine, PAULA.tag.tagUid);
      await releaseAt(request, machine);

      expect((await run(extraction.id, { action: 'on' })).status()).toBe(200);
      expect(extras.shelly.switches[0].on).toBe(true);

      const lit = await run(light.id, { action: 'on', brightness: 30 });
      expect(lit.status()).toBe(200);
      expect(extras.shelly.lights[0]).toMatchObject({ on: true, brightness: 30 });

      expect((await run(cover.id, { action: 'open' })).status()).toBe(200);
      expect(extras.shelly.covers[0].state).toBe('opening');
      expect((await run(cover.id, { action: 'on' })).status()).toBe(400);
      expect((await run('nope', { action: 'on' })).status()).toBe(404);

      const after = await terminalState(request, machine);
      expect(after.machine.extras.find((e: { id: string }) => e.id === extraction.id).on).toBe(
        true
      );

      // Logout: the extraction goes off with the machine, the light stays.
      await scanAt(request, machine, PAULA.tag.tagUid);
      expect(machine.shelly.switches[0].on).toBe(false);
      expect(extras.shelly.switches[0].on).toBe(false);
      expect(extras.shelly.lights[0].on).toBe(true);
    });
  });

  test.describe('UI', () => {
    test('kiosk shows the open safety input and operates extras', async ({ page, request }) => {
      const extras = await extrasShelly(request);
      const machine = await machineWithLid(request, {
        extras: [
          {
            deviceId: extras.deviceId,
            kind: 'switch',
            index: 0,
            label: 'Absaugung',
            offWithMachine: true,
          },
          {
            deviceId: extras.deviceId,
            kind: 'cover',
            index: 0,
            label: 'Rollo',
            offWithMachine: false,
          },
        ],
      });
      machine.shelly.inputs[0] = false;

      await page.goto('/terminal');
      await page.getByTestId('terminal-setup-token').fill(machine.token);
      await page.getByTestId('terminal-setup-connect').click();
      await scanAt(request, machine, PAULA.tag.tagUid);

      await expect(page.getByTestId('terminal-machine-blocked')).toContainText('Schutzhaube');
      await expect(page.getByTestId('terminal-release')).toBeDisabled();

      machine.shelly.inputs[0] = true;
      await expect(page.getByTestId('terminal-release')).toBeEnabled({ timeout: 8000 });
      await page.getByTestId('terminal-release').click();
      await expect(page.getByTestId('terminal-extras')).toBeVisible();

      const extraction = page.getByTestId('terminal-extra').filter({ hasText: 'Absaugung' });
      await extraction.getByTestId('terminal-extra-on').click();
      await expect(extraction).toHaveAttribute('data-on', 'true');
      expect(extras.shelly.switches[0].on).toBe(true);

      const cover = page.getByTestId('terminal-extra').filter({ hasText: 'Rollo' });
      await cover.getByTestId('terminal-extra-close').click();
      await expect.poll(() => extras.shelly.covers[0].state).toBe('closing');
    });

    test('admin adds a safety input and an extra on the equipment page', async ({
      page,
      request,
    }) => {
      const main = await startTrackedShelly({
        gen: 2,
        switches: 2,
        inputs: 1,
        password: 'test-shelly-secret',
      });
      await addShellyDevice(request, main, 'MA Haupt');

      await loginAsAdmin(page);
      await page.goto(`/equipment/${LASER.id}/edit`);
      await page.getByTestId('equipment-control-device').click();
      await page.getByRole('option', { name: /MA Haupt/ }).click();

      await page.getByTestId('equipment-control-interlock-add').click();
      await page.getByTestId('equipment-control-interlock-label').fill('Tür');
      await page.getByTestId('equipment-control-extra-add').click();
      await page.getByTestId('equipment-control-extra-label').fill('Absaugung');
      await page.getByTestId('equipment-control-save').click();
      await expect(page.getByTestId('equipment-control-remove')).toBeVisible();

      const equipment = await (await request.get(`${API}/equipment/${LASER.id}`)).json();
      expect(equipment.control.interlocks).toEqual([
        expect.objectContaining({ index: 0, label: 'Tür', okWhen: 'closed' }),
      ]);
      // The only extra candidate is relay 2 (relay 1 is the main output).
      expect(equipment.control.extras).toEqual([
        expect.objectContaining({
          kind: 'switch',
          index: 1,
          label: 'Absaugung',
          offWithMachine: true,
        }),
      ]);
    });
  });
});
