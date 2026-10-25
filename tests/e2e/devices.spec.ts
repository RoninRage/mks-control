import { test, expect, type APIRequestContext } from '@playwright/test';
import { loginAsAdmin, loginAsMember } from '../helpers/auth';
import { deleteDocumentsByType, getTestDatabaseConnection } from '../helpers/database';
import { startMockShelly, type MockShelly } from '../helpers/mockShelly';
import { ADMIN_HEADERS, MEMBER_HEADERS, VORSTAND_HEADERS } from '../helpers/machines';

// Must match SHELLY_PASSWORD in .env.test (scripts/setup-test-env.js).
const SHELLY_PASSWORD = 'test-shelly-secret';
const API = 'http://localhost:3000/api/shelly';

interface DeviceJson {
  id: string;
  name: string;
  gen: number;
  model: string;
  health: string;
  isActive: boolean;
  components: { kind: string; index: number; hasPowerMeter?: boolean }[];
}

const createDevice = async (
  request: APIRequestContext,
  host: string,
  name?: string
): Promise<DeviceJson> => {
  const response = await request.post(`${API}/devices`, {
    headers: ADMIN_HEADERS,
    data: { host, name },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as DeviceJson;
};

test.describe('Shelly devices', () => {
  const mocks: MockShelly[] = [];

  const mock = async (options: Parameters<typeof startMockShelly>[0]): Promise<MockShelly> => {
    const device = await startMockShelly(options);
    mocks.push(device);
    return device;
  };

  test.beforeEach(async () => {
    const { membersDb } = getTestDatabaseConnection();
    await deleteDocumentsByType(membersDb, 'shellyDevice');
  });

  test.afterEach(async () => {
    await Promise.all(mocks.splice(0).map((m) => m.close()));
  });

  test.describe('API', () => {
    test('rejects non-admins', async ({ request }) => {
      const response = await request.get(`${API}/devices`, {
        headers: MEMBER_HEADERS,
      });
      expect(response.status()).toBe(403);
    });

    test('rejects hosts outside the local network', async ({ request }) => {
      for (const host of ['8.8.8.8', 'example.com', '192.168.1.5/evil', '']) {
        const response = await request.post(`${API}/devices/probe`, {
          headers: ADMIN_HEADERS,
          data: { host },
        });
        expect(response.status(), host).toBe(400);
      }
    });

    test('probes a password protected Gen2 device with digest auth', async ({ request }) => {
      const shelly = await mock({
        gen: 2,
        switches: 1,
        metered: true,
        inputs: 1,
        password: SHELLY_PASSWORD,
      });

      const response = await request.post(`${API}/devices/probe`, {
        headers: ADMIN_HEADERS,
        data: { host: shelly.host },
      });
      expect(response.status()).toBe(200);
      const probe = await response.json();
      expect(probe).toMatchObject({
        gen: 2,
        mac: shelly.mac,
        shellyId: shelly.shellyId,
        authRequired: true,
        components: [
          { kind: 'switch', index: 0, hasPowerMeter: true },
          { kind: 'input', index: 0 },
        ],
      });
    });

    test('reports a wrong password as an error', async ({ request }) => {
      const shelly = await mock({ gen: 2, switches: 1, password: 'something-else' });
      const response = await request.post(`${API}/devices/probe`, {
        headers: ADMIN_HEADERS,
        data: { host: shelly.host },
      });
      expect(response.status()).toBe(502);
      expect((await response.json()).error).toContain('Anmeldung');
    });

    test('detects Gen1 relays, rollers, lights and meters', async ({ request }) => {
      const relays = await mock({
        gen: 1,
        model: 'SHSW-25',
        switches: 2,
        metered: true,
        inputs: 2,
        password: SHELLY_PASSWORD,
      });
      const roller = await mock({ gen: 1, model: 'SHSW-25', switches: 2, covers: 1, inputs: 2 });
      const dimmer = await mock({ gen: 1, model: 'SHDM-2', lights: 1, inputs: 2 });
      const em = await mock({ gen: 1, model: 'SHEM-3', switches: 1, meters: 3 });

      const probe = async (host: string): Promise<DeviceJson> => {
        const response = await request.post(`${API}/devices/probe`, {
          headers: ADMIN_HEADERS,
          data: { host },
        });
        expect(response.status()).toBe(200);
        return (await response.json()) as DeviceJson;
      };

      const relayProbe = await probe(relays.host);
      expect(relayProbe.gen).toBe(1);
      expect(relayProbe.components).toEqual([
        { kind: 'switch', index: 0, hasPowerMeter: true },
        { kind: 'switch', index: 1, hasPowerMeter: true },
        { kind: 'input', index: 0 },
        { kind: 'input', index: 1 },
      ]);

      // In roller mode the relays belong to the cover and are not offered as switches.
      const rollerKinds = (await probe(roller.host)).components.map((c) => c.kind);
      expect(rollerKinds).toEqual(['cover', 'input', 'input']);

      const dimmerKinds = (await probe(dimmer.host)).components.map((c) => c.kind);
      expect(dimmerKinds).toEqual(['light', 'input', 'input']);

      const emKinds = (await probe(em.host)).components.map((c) => c.kind);
      expect(emKinds).toEqual(['switch', 'meter', 'meter', 'meter']);
    });

    test('creates a device once and reads live values', async ({ request }) => {
      const shelly = await mock({
        gen: 2,
        switches: 1,
        metered: true,
        inputs: 1,
        password: SHELLY_PASSWORD,
      });
      const device = await createDevice(request, shelly.host, 'Lasercutter');
      expect(device).toMatchObject({ name: 'Lasercutter', health: 'online', isActive: true });

      const duplicate = await request.post(`${API}/devices`, {
        headers: ADMIN_HEADERS,
        data: { host: shelly.host },
      });
      expect(duplicate.status()).toBe(409);

      shelly.switches[0].on = true;
      shelly.switches[0].powerW = 812.5;
      shelly.switches[0].energyWh = 1234;
      shelly.inputs[0] = true;

      const status = await (
        await request.get(`${API}/devices/${device.id}/status`, { headers: ADMIN_HEADERS })
      ).json();
      expect(status.health).toBe('online');
      expect(status.components).toEqual([
        expect.objectContaining({
          kind: 'switch',
          index: 0,
          on: true,
          powerW: 812.5,
          energyWh: 1234,
        }),
        { kind: 'input', index: 0, inputState: true },
      ]);
    });

    test('identify flips the relay and the device switches it back', async ({ request }) => {
      const gen2 = await mock({ gen: 2, switches: 1, password: SHELLY_PASSWORD });
      const gen1 = await mock({ gen: 1, switches: 1, password: SHELLY_PASSWORD });
      gen1.switches[0].on = true;

      for (const shelly of [gen2, gen1]) {
        const device = await createDevice(request, shelly.host);
        const before = shelly.switches[0].on;

        const response = await request.post(`${API}/devices/${device.id}/identify`, {
          headers: ADMIN_HEADERS,
        });
        expect(response.status()).toBe(200);
        expect(shelly.switches[0].on).toBe(!before);
        await expect.poll(() => shelly.switches[0].on, { timeout: 3000 }).toBe(before);
      }

      expect(
        gen2.calls.some((c) => c.rpcMethod === 'Switch.Set' && c.params?.toggle_after === 1)
      ).toBe(true);
      expect(gen1.calls.some((c) => c.path === '/relay/0?turn=off&timer=1')).toBe(true);
    });

    test('identify is refused for devices without relay or light', async ({ request }) => {
      const shelly = await mock({ gen: 2, inputs: 2 });
      const device = await createDevice(request, shelly.host);
      const response = await request.post(`${API}/devices/${device.id}/identify`, {
        headers: ADMIN_HEADERS,
      });
      expect(response.status()).toBe(409);
    });

    test('reports an unreachable device as offline', async ({ request }) => {
      const shelly = await mock({ gen: 2, switches: 1 });
      const device = await createDevice(request, shelly.host);
      shelly.setOffline(true);

      const status = await (
        await request.get(`${API}/devices/${device.id}/status`, { headers: ADMIN_HEADERS })
      ).json();
      expect(status).toMatchObject({ health: 'offline', components: [] });
      expect(status.error).toBeTruthy();

      const list = (await (
        await request.get(`${API}/devices`, { headers: ADMIN_HEADERS })
      ).json()) as DeviceJson[];
      expect(list.find((d) => d.id === device.id)?.health).toBe('offline');
    });

    test('changing the host requires the same device', async ({ request }) => {
      const shelly = await mock({ gen: 2, switches: 1 });
      const other = await mock({ gen: 2, switches: 1 });
      const device = await createDevice(request, shelly.host);

      const wrong = await request.put(`${API}/devices/${device.id}`, {
        headers: ADMIN_HEADERS,
        data: { host: other.host },
      });
      expect(wrong.status()).toBe(409);

      const renamed = await request.put(`${API}/devices/${device.id}`, {
        headers: ADMIN_HEADERS,
        data: { name: 'Neuer Name' },
      });
      expect(renamed.status()).toBe(200);
      expect((await renamed.json()).name).toBe('Neuer Name');
    });

    test('retiring and adding again restores the entry', async ({ request }) => {
      const shelly = await mock({ gen: 2, switches: 1 });
      const device = await createDevice(request, shelly.host, 'Drehbank');

      const retired = await request.delete(`${API}/devices/${device.id}`, {
        headers: ADMIN_HEADERS,
      });
      expect(retired.status()).toBe(200);

      const list = (await (
        await request.get(`${API}/devices`, { headers: ADMIN_HEADERS })
      ).json()) as DeviceJson[];
      expect(list).toHaveLength(0);

      const again = await createDevice(request, shelly.host);
      expect(again.id).toBe(device.id);
      expect(again.name).toBe('Drehbank');
    });
  });

  test.describe('UI', () => {
    test('members do not see the devices tile', async ({ page }) => {
      await loginAsMember(page);
      await expect(page.getByTestId('dashboard-devices')).toHaveCount(0);
    });

    test('admin adds, identifies and retires a device', async ({ page }) => {
      const shelly = await mock({
        gen: 2,
        switches: 1,
        metered: true,
        inputs: 1,
        password: SHELLY_PASSWORD,
      });
      shelly.switches[0].on = true;
      shelly.switches[0].powerW = 42;

      await loginAsAdmin(page);
      await page.getByTestId('dashboard-devices').click();
      await expect(page).toHaveURL('/devices');
      await expect(page.getByTestId('devices-empty')).toBeVisible();

      // Add via dialog: probe first, then save with a custom name.
      await page.getByTestId('devices-empty-add').click();
      await page.getByTestId('devices-add-host').fill(shelly.host);
      await page.getByTestId('devices-add-probe').click();
      await expect(page.getByTestId('devices-add-model')).toContainText('Gen2');
      await expect(page.getByTestId('devices-add-components')).toContainText('1× Relais');
      await page.getByTestId('devices-add-name').fill('Kreissäge');
      await page.getByTestId('devices-add-submit').click();

      const card = page.getByTestId('device-card');
      await expect(card).toHaveCount(1);
      await expect(card.getByTestId('device-name')).toHaveText('Kreissäge');
      await expect(card.getByTestId('device-health')).toHaveAttribute('data-health', 'online');
      await expect(
        card.locator('[data-kind="switch"]').getByTestId('device-component-state')
      ).toContainText('An · 42 W');

      // Identify asks for confirmation, then flips the relay for one second.
      await card.getByTestId('device-identify').click();
      await page.getByRole('button', { name: 'Identifizieren' }).last().click();
      await expect.poll(() => shelly.calls.some((c) => c.params?.toggle_after === 1)).toBe(true);

      // Retire.
      await card.getByTestId('device-retire').click();
      await page.getByRole('button', { name: 'Ausmustern' }).last().click();
      await expect(page.getByTestId('devices-empty')).toBeVisible();
    });

    test('shows probe errors in the add dialog', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/devices');
      await page.getByTestId('devices-empty-add').click();
      await page.getByTestId('devices-add-host').fill('8.8.8.8');
      await page.getByTestId('devices-add-probe').click();
      await expect(page.getByTestId('devices-add-error')).toContainText('lokalen Netz');
      await expect(page.getByTestId('devices-add-submit')).toBeDisabled();
    });

    test('shows offline devices', async ({ page, request }) => {
      const shelly = await mock({ gen: 1, switches: 1 });
      await createDevice(request, shelly.host, 'Bandsäge');
      shelly.setOffline(true);

      await loginAsAdmin(page);
      await page.goto('/devices');
      const card = page.getByTestId('device-card');
      await expect(card.getByTestId('device-health')).toHaveAttribute('data-health', 'offline');
      await expect(card.getByTestId('device-status-error')).toContainText('nicht erreichbar');
    });
  });
});
