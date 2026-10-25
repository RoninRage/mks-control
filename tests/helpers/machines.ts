import { expect, type APIRequestContext } from '@playwright/test';
import { getTestUsageDatabase } from './database';
import { startMockShelly, type MockShelly, type MockShellyOptions } from './mockShelly';

// Helpers for tests that release machines (docs/shelly-plan.md, phases 3 and 4).
// Call cleanupMachines() in afterEach: it stops keep-alives, deletes terminals through the
// API (which ends running releases in the backend) and closes the fake Shellys.

export const API = 'http://localhost:3000/api';
// Sessions created in tests/global-setup.ts (admin: test-admin-001, member: test-member-001).
export const ADMIN_HEADERS = { authorization: `Bearer ${process.env.TEST_ADMIN_TOKEN ?? ''}` };
export const MEMBER_HEADERS = { authorization: `Bearer ${process.env.TEST_MEMBER_TOKEN ?? ''}` };
export const VORSTAND_HEADERS = {
  authorization: `Bearer ${process.env.TEST_VORSTAND_TOKEN ?? ''}`,
};
// Must match SHELLY_PASSWORD in .env.test.
export const SHELLY_PASSWORD = 'test-shelly-secret';

export interface TestMachine {
  shelly: MockShelly;
  deviceId: string;
  terminalId: string;
  token: string;
  headers: Record<string, string>;
}

export interface UsageDoc {
  id: string;
  memberId: string | null;
  memberName: string;
  adminOverride: boolean;
  endedAt?: string;
  durationSec?: number;
  endReason?: string;
  energyWh?: number;
}

const mocks: MockShelly[] = [];
const machines: TestMachine[] = [];
const keepAlives: Array<() => void> = [];

export const startTrackedShelly = async (options: MockShellyOptions): Promise<MockShelly> => {
  const shelly = await startMockShelly(options);
  mocks.push(shelly);
  return shelly;
};

export const addShellyDevice = async (
  request: APIRequestContext,
  shelly: MockShelly,
  name?: string
): Promise<string> => {
  const response = await request.post(`${API}/shelly/devices`, {
    headers: ADMIN_HEADERS,
    data: { host: shelly.host, name },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).id as string;
};

export const setupMachine = async (
  request: APIRequestContext,
  options: {
    equipmentId: string;
    shelly?: Partial<MockShellyOptions>;
    control?: Record<string, unknown>;
    terminal?: Record<string, unknown>;
  }
): Promise<TestMachine> => {
  const shelly = await startTrackedShelly({
    gen: 2,
    switches: 1,
    metered: true,
    password: SHELLY_PASSWORD,
    ...options.shelly,
  });
  const deviceId = await addShellyDevice(request, shelly);

  const control = await request.put(`${API}/equipment/${options.equipmentId}/control`, {
    headers: ADMIN_HEADERS,
    data: { deviceId, kind: 'switch', index: 0, ...options.control },
  });
  expect(control.status(), await control.text()).toBe(200);

  const terminal = await request.post(`${API}/terminals`, {
    headers: ADMIN_HEADERS,
    data: { name: 'Test-Pi', equipmentId: options.equipmentId, ...options.terminal },
  });
  expect(terminal.status(), await terminal.text()).toBe(201);
  const { terminal: t, token } = await terminal.json();

  const machine: TestMachine = {
    shelly,
    deviceId,
    terminalId: t.id,
    token,
    headers: { authorization: `Bearer ${token}` },
  };
  machines.push(machine);
  return machine;
};

export const scanAt = (request: APIRequestContext, machine: TestMachine, uid: string) =>
  request.post(`${API}/auth/tag`, {
    headers: machine.headers,
    data: { type: 'tag', uid, source: 'acr122u' },
  });

export const terminalState = async (request: APIRequestContext, machine: TestMachine) =>
  (await request.get(`${API}/terminal/state`, { headers: machine.headers })).json();

export const releaseAt = (request: APIRequestContext, machine: TestMachine) =>
  request.post(`${API}/terminal/release`, { headers: machine.headers });

// Polls the state like the kiosk does, so the backend sees the Pi as online.
export const keepPiOnline = (request: APIRequestContext, machine: TestMachine): void => {
  const timer = setInterval(() => {
    void request.get(`${API}/terminal/state`, { headers: machine.headers }).catch(() => undefined);
  }, 1000);
  keepAlives.push(() => clearInterval(timer));
};

export const usagesAt = async (terminalId: string): Promise<UsageDoc[]> => {
  const result = await getTestUsageDatabase().find({
    selector: { type: 'equipmentUsage', terminalId },
    limit: 100,
  });
  return (result.docs as Array<UsageDoc & { startedAt: string }>).sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt)
  );
};

export const cleanupMachines = async (request: APIRequestContext): Promise<void> => {
  keepAlives.splice(0).forEach((stop) => stop());
  for (const machine of machines.splice(0)) {
    await request.delete(`${API}/terminals/${machine.terminalId}`, { headers: ADMIN_HEADERS });
  }
  await Promise.all(mocks.splice(0).map((m) => m.close()));
};
