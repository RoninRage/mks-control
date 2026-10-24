// Error types raised by the Shelly drivers. Routes map them to HTTP status codes.

export class ShellyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShellyError';
  }
}

// The host did not answer (timeout, connection refused, DNS failure).
export class ShellyUnreachableError extends ShellyError {
  constructor(message = 'Gerät nicht erreichbar') {
    super(message);
    this.name = 'ShellyUnreachableError';
  }
}

// The host answered, but not like a Shelly (wrong format, unexpected status).
export class ShellyProtocolError extends ShellyError {
  constructor(message = 'Antwort ist nicht von einem Shelly-Gerät') {
    super(message);
    this.name = 'ShellyProtocolError';
  }
}

// The device requires a password and SHELLY_PASSWORD is missing or wrong.
export class ShellyAuthError extends ShellyError {
  constructor(message = 'Anmeldung am Gerät fehlgeschlagen (SHELLY_PASSWORD prüfen)') {
    super(message);
    this.name = 'ShellyAuthError';
  }
}

// The requested action is not possible on this device (e.g. no relay to identify with).
export class ShellyUnsupportedError extends ShellyError {
  constructor(message: string) {
    super(message);
    this.name = 'ShellyUnsupportedError';
  }
}
