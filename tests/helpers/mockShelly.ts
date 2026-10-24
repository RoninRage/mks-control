import { createHash, randomBytes } from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';

/**
 * Fake Shelly device for E2E tests (there is no hardware in CI or cloud sessions).
 *
 * Emulates the parts of the APIs the backend uses:
 *   - Gen1 REST: GET /shelly, /settings, /status, /relay/N, /light/N, /roller/N (HTTP Basic)
 *   - Gen2 RPC:  GET /shelly, POST /rpc (Shelly.GetStatus, Switch.Set, Light.Set,
 *                Cover.Open/Close/Stop/GoToPosition) (HTTP Digest SHA-256)
 *
 * Auto-off timers (`timer` / `toggle_after`) are honoured, so identify can be tested.
 */

export interface MockShellyOptions {
  gen: 1 | 2;
  model?: string;
  mac?: string;
  name?: string;
  // When set, everything except GET /shelly requires authentication.
  password?: string;
  switches?: number;
  // Switches/lights measure power (e.g. Plus 1PM, Shelly 1PM).
  metered?: boolean;
  inputs?: number;
  lights?: number;
  covers?: number;
  // Stand-alone power meters (Gen2 pm1, Gen1 emeters).
  meters?: number;
}

export interface MockOutputState {
  on: boolean;
  brightness: number;
  powerW: number;
  energyWh: number;
}

export interface MockCoverState {
  state: string;
  positionPct: number;
}

export interface MockShellyCall {
  method: string;
  path: string;
  rpcMethod?: string;
  params?: Record<string, unknown>;
}

export interface MockShelly {
  host: string;
  port: number;
  mac: string;
  shellyId: string;
  switches: MockOutputState[];
  lights: MockOutputState[];
  covers: MockCoverState[];
  inputs: boolean[];
  meters: { powerW: number; energyWh: number }[];
  calls: MockShellyCall[];
  setOffline(offline: boolean): void;
  close(): Promise<void>;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const parseAuthParams = (header: string): Record<string, string> => {
  const params: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header.replace(/^Digest\s+/i, ''))) !== null) {
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return params;
};

const output = (on = false): MockOutputState => ({
  on,
  brightness: 50,
  powerW: 0,
  energyWh: 0,
});

const readBody = (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });

export async function startMockShelly(options: MockShellyOptions): Promise<MockShelly> {
  const gen = options.gen;
  const mac = options.mac ?? randomBytes(6).toString('hex').toUpperCase();
  const model = options.model ?? (gen === 1 ? 'SHSW-PM' : 'SNSW-001P16EU');
  const shellyId = gen === 1 ? `shelly1pm-${mac}` : `shellyplus1pm-${mac.toLowerCase()}`;
  const nonce = randomBytes(8).toString('hex');

  const state = {
    switches: Array.from({ length: options.switches ?? 0 }, () => output()),
    lights: Array.from({ length: options.lights ?? 0 }, () => output()),
    covers: Array.from({ length: options.covers ?? 0 }, () => ({
      state: 'stopped',
      positionPct: 0,
    })),
    inputs: Array.from({ length: options.inputs ?? 0 }, () => false),
    meters: Array.from({ length: options.meters ?? 0 }, () => ({ powerW: 0, energyWh: 0 })),
  };
  const calls: MockShellyCall[] = [];
  const timers = new Set<NodeJS.Timeout>();
  let offline = false;

  const scheduleFlip = (target: MockOutputState, seconds: number | undefined): void => {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      target.on = !target.on;
      timers.delete(timer);
    }, seconds * 1000);
    timers.add(timer);
  };

  const isAuthorized = (req: http.IncomingMessage): boolean => {
    if (!options.password) {
      return true;
    }
    const header = req.headers.authorization ?? '';
    if (gen === 1) {
      const expected = Buffer.from(`admin:${options.password}`).toString('base64');
      return header === `Basic ${expected}`;
    }
    if (!/^Digest /i.test(header)) {
      return false;
    }
    const p = parseAuthParams(header);
    const ha1 = sha256(`admin:${shellyId}:${options.password}`);
    const ha2 = sha256(`${req.method}:${p.uri}`);
    const expected = sha256(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`);
    return p.username === 'admin' && p.nonce === nonce && p.response === expected;
  };

  const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const challenge = (res: http.ServerResponse): void => {
    const header =
      gen === 1
        ? 'Basic realm="shelly"'
        : `Digest qop="auth", realm="${shellyId}", nonce="${nonce}", algorithm=SHA-256`;
    res.writeHead(401, { 'WWW-Authenticate': header });
    res.end();
  };

  // ---------------- Gen1 ----------------

  const gen1Status = (): Record<string, unknown> => ({
    relays: state.switches.map((s) => ({ ison: s.on, has_timer: false })),
    meters: options.metered
      ? [...state.switches, ...state.lights].map((s) => ({
          power: s.powerW,
          is_valid: true,
          total: Math.round(s.energyWh * 60),
        }))
      : [],
    lights: state.lights.map((l) => ({ ison: l.on, brightness: l.brightness })),
    rollers: state.covers.map((c) => ({
      state: c.state,
      current_pos: c.positionPct,
      power: 0,
    })),
    emeters: state.meters.map((m) => ({
      power: m.powerW,
      voltage: 230,
      current: m.powerW / 230,
      total: m.energyWh,
    })),
    inputs: state.inputs.map((i) => ({ input: i ? 1 : 0 })),
  });

  const handleGen1 = (req: http.IncomingMessage, res: http.ServerResponse, url: URL): void => {
    const path = url.pathname;
    if (path === '/settings') {
      sendJson(res, 200, {
        device: { type: model, mac, hostname: shellyId },
        name: options.name ?? null,
        mode: state.covers.length > 0 ? 'roller' : 'relay',
        fw: '20230913-114008/v1.14.0-gcb84623',
      });
      return;
    }
    if (path === '/status') {
      sendJson(res, 200, gen1Status());
      return;
    }

    const control = /^\/(relay|light|roller)\/(\d+)$/.exec(path);
    if (control) {
      const index = Number(control[2]);
      const turn = url.searchParams.get('turn');
      const timer = url.searchParams.has('timer')
        ? Number(url.searchParams.get('timer'))
        : undefined;

      if (control[1] === 'roller') {
        const cover = state.covers[index];
        if (!cover) {
          sendJson(res, 404, {});
          return;
        }
        const go = url.searchParams.get('go');
        if (go === 'to_pos') {
          cover.positionPct = Number(url.searchParams.get('roller_pos'));
        } else if (go) {
          cover.state = go;
        }
        sendJson(res, 200, { state: cover.state, current_pos: cover.positionPct });
        return;
      }

      const list = control[1] === 'relay' ? state.switches : state.lights;
      const target = list[index];
      if (!target) {
        sendJson(res, 404, {});
        return;
      }
      if (turn === 'on' || turn === 'off') {
        target.on = turn === 'on';
      }
      if (url.searchParams.has('brightness')) {
        target.brightness = Number(url.searchParams.get('brightness'));
      }
      scheduleFlip(target, timer);
      sendJson(res, 200, { ison: target.on });
      return;
    }

    sendJson(res, 404, {});
  };

  // ---------------- Gen2 ----------------

  const gen2Status = (): Record<string, unknown> => {
    const status: Record<string, unknown> = { sys: { mac } };
    state.switches.forEach((s, id) => {
      status[`switch:${id}`] = {
        id,
        output: s.on,
        ...(options.metered
          ? {
              apower: s.powerW,
              voltage: 230,
              current: s.powerW / 230,
              aenergy: { total: s.energyWh },
            }
          : {}),
      };
    });
    state.lights.forEach((l, id) => {
      status[`light:${id}`] = {
        id,
        output: l.on,
        brightness: l.brightness,
        ...(options.metered ? { apower: l.powerW, aenergy: { total: l.energyWh } } : {}),
      };
    });
    state.covers.forEach((c, id) => {
      status[`cover:${id}`] = { id, state: c.state, current_pos: c.positionPct, apower: 0 };
    });
    state.meters.forEach((m, id) => {
      status[`pm1:${id}`] = {
        id,
        apower: m.powerW,
        voltage: 230,
        current: m.powerW / 230,
        aenergy: { total: m.energyWh },
      };
    });
    state.inputs.forEach((i, id) => {
      status[`input:${id}`] = { id, state: i };
    });
    return status;
  };

  const rpc = (method: string, params: Record<string, unknown>): unknown => {
    const id = Number(params.id ?? 0);
    switch (method) {
      case 'Shelly.GetStatus':
        return gen2Status();
      case 'Switch.Set':
      case 'Light.Set': {
        const list = method === 'Switch.Set' ? state.switches : state.lights;
        const target = list[id];
        if (!target) {
          throw new Error(`No component ${id}`);
        }
        const wasOn = target.on;
        target.on = Boolean(params.on);
        if (typeof params.brightness === 'number') {
          target.brightness = params.brightness;
        }
        scheduleFlip(
          target,
          typeof params.toggle_after === 'number' ? params.toggle_after : undefined
        );
        return { was_on: wasOn };
      }
      case 'Cover.Open':
      case 'Cover.Close':
      case 'Cover.Stop': {
        const cover = state.covers[id];
        if (!cover) {
          throw new Error(`No cover ${id}`);
        }
        cover.state = {
          'Cover.Open': 'opening',
          'Cover.Close': 'closing',
          'Cover.Stop': 'stopped',
        }[method];
        return null;
      }
      case 'Cover.GoToPosition': {
        const cover = state.covers[id];
        if (!cover) {
          throw new Error(`No cover ${id}`);
        }
        cover.positionPct = Number(params.pos);
        return null;
      }
      default:
        throw new Error(`Unknown method ${method}`);
    }
  };

  const handleGen2 = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
  ): Promise<void> => {
    if (url.pathname !== '/rpc' || req.method !== 'POST') {
      sendJson(res, 404, {});
      return;
    }
    const body = JSON.parse((await readBody(req)) || '{}') as {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
    };
    const call = calls[calls.length - 1];
    call.rpcMethod = body.method;
    call.params = body.params;

    try {
      const result = rpc(body.method ?? '', body.params ?? {});
      sendJson(res, 200, { id: body.id, src: shellyId, result });
    } catch (err) {
      sendJson(res, 200, {
        id: body.id,
        src: shellyId,
        error: { code: -105, message: (err as Error).message },
      });
    }
  };

  // ---------------- Server ----------------

  const server = http.createServer((req, res) => {
    if (offline) {
      req.socket.destroy();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    calls.push({ method: req.method ?? 'GET', path: `${url.pathname}${url.search}` });

    if (url.pathname === '/shelly') {
      sendJson(
        res,
        200,
        gen === 1
          ? { type: model, mac, auth: Boolean(options.password), fw: '20230913-114008/v1.14.0' }
          : {
              name: options.name ?? null,
              id: shellyId,
              mac,
              model,
              gen,
              fw_id: '20241011-114455/1.4.4-g6d2a586',
              ver: '1.4.4',
              app: 'Plus1PM',
              auth_en: Boolean(options.password),
              auth_domain: options.password ? shellyId : null,
            }
      );
      return;
    }

    if (!isAuthorized(req)) {
      challenge(res);
      return;
    }

    if (gen === 1) {
      handleGen1(req, res, url);
    } else {
      void handleGen2(req, res, url);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    host: `127.0.0.1:${port}`,
    port,
    mac,
    shellyId,
    ...state,
    calls,
    setOffline(value: boolean): void {
      offline = value;
    },
    async close(): Promise<void> {
      timers.forEach((timer) => clearTimeout(timer));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
