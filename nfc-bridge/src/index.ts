import { NFC, Reader } from 'nfc-pcsc';
import { fetch } from 'undici';
import dotenv from 'dotenv';
import path from 'path';
import { HeartbeatEvent, TagEvent } from './types';

// Enforce monorepo dev entry point
if (process.env.MONOREPO_DEV !== 'true') {
  console.error('❌ ERROR: NFC Bridge must be started via: npm run dev');
  console.error('Do not run NFC Bridge directly');
  process.exit(1);
}

interface BridgeConfig {
  gatewayUrl: string;
  postPath: string;
  deviceId: string;
  source: 'acr122u';
  debounceMs: number;
}

dotenv.config({ path: path.resolve(__dirname, '../.env') });

type LogLevel = 'info' | 'warn' | 'error';

const log = (level: LogLevel, message: string): void => {
  const prefix = level.toUpperCase();
  // eslint-disable-next-line no-console
  console[level](`[nfc-bridge] ${prefix} ${message}`);
};

const parseDebounce = (value: string | undefined): number => {
  if (!value) {
    return 800;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 800;
  }

  return parsed;
};

const normalizePath = (value: string): string => {
  if (value.startsWith('/')) {
    return value;
  }

  return `/${value}`;
};

const loadConfig = (): BridgeConfig => {
  const gatewayUrl = (process.env.GATEWAY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const postPath = normalizePath(process.env.POST_PATH ?? '/api/auth/tag');
  const deviceId = process.env.DEVICE_ID ?? 'kiosk-01';
  const source = (process.env.SOURCE ?? 'acr122u') as 'acr122u';
  const debounceMs = parseDebounce(process.env.DEBOUNCE_MS);

  return {
    gatewayUrl,
    postPath,
    deviceId,
    source,
    debounceMs,
  };
};

const config = loadConfig();

log('info', `config gatewayUrl=${config.gatewayUrl}`);
log('info', `config postPath=${config.postPath}`);
log('info', `config deviceId=${config.deviceId}`);
log('info', `config source=${config.source}`);
log('info', `config debounceMs=${config.debounceMs}`);

const nfc = new NFC();
const activeReaders = new Set<Reader>();
let lastUid: string | null = null;
let lastSeenAt = 0;

const shouldIgnore = (uid: string): boolean => {
  const now = Date.now();
  if (uid === lastUid && now - lastSeenAt < config.debounceMs) {
    return true;
  }

  lastUid = uid;
  lastSeenAt = now;
  return false;
};

const postTag = async (uid: string): Promise<void> => {
  const event: TagEvent = {
    type: 'tag',
    uid,
    ts: new Date().toISOString(),
    source: config.source,
    device: config.deviceId,
  };

  const url = `${config.gatewayUrl}${config.postPath}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-id': config.deviceId,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      log('warn', `gateway responded ${response.status}`);
    } else {
      log('info', `tag posted uid=${uid}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    log('error', `failed to post tag: ${message}`);
  }
};

const postHeartbeat = async (): Promise<void> => {
  const event: HeartbeatEvent = {
    type: 'heartbeat',
    ts: new Date().toISOString(),
    source: config.source,
    device: config.deviceId,
  };

  const url = `${config.gatewayUrl}/api/auth/heartbeat`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-id': config.deviceId,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      log('warn', `heartbeat post failed ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    log('error', `heartbeat post error: ${message}`);
  }
};

const postReaderError = async (errorMessage: string): Promise<void> => {
  const event = {
    type: 'reader-error' as const,
    ts: new Date().toISOString(),
    source: config.source,
    device: config.deviceId,
    error: errorMessage,
  };

  const url = `${config.gatewayUrl}/api/auth/reader-error`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-device-id': config.deviceId,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      log('warn', `reader error post failed ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    log('error', `reader error post error: ${message}`);
  }
};

nfc.on('reader', (reader: Reader) => {
  activeReaders.add(reader);
  log('info', `reader attached ${reader.name}`);

  reader.on('card', (card: { uid?: string }) => {
    const uid = card.uid;

    if (!uid) {
      log('warn', 'card detected without uid');
      return;
    }

    if (shouldIgnore(uid)) {
      log('info', `debounced uid=${uid}`);
      return;
    }

    void postTag(uid);
  });

  reader.on('error', (error: Error) => {
    log('error', `reader error ${reader.name}: ${error.message}`);
    void postReaderError(error.message);
  });

  reader.on('end', () => {
    activeReaders.delete(reader);
    log('warn', `reader removed ${reader.name}`);
  });
});

nfc.on('error', (error: Error) => {
  log('error', `nfc error: ${error.message}`);
});

// Send heartbeat every 15 seconds
const HEARTBEAT_INTERVAL = 15000;
setInterval(() => {
  void postHeartbeat();
}, HEARTBEAT_INTERVAL);

log('info', 'nfc-bridge started');
log('info', `heartbeat interval: ${HEARTBEAT_INTERVAL}ms`);

log('info', 'waiting for NFC reader...');

const shutdown = (): void => {
  log('info', 'shutting down...');
  activeReaders.forEach((reader: Reader) => {
    try {
      reader.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      log('warn', `reader close error: ${message}`);
    }
  });

  try {
    nfc.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    log('warn', `nfc close error: ${message}`);
  }

  setTimeout(() => {
    process.exit(0);
  }, 200);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
