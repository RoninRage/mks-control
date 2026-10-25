// Limits failed logins via Web NFC (unknown tag UIDs). Knowing a UID is enough to log in there,
// so guessing must stay slow. Counted for all clients together: behind the frontend's proxy every
// phone has the same address. Successful logins are not limited.

const WINDOW_MS = 60_000;
let windowStart = 0;
let failures = 0;

export const webnfcFailureLimit = (): number => {
  const value = Number(process.env.WEBNFC_FAILURE_LIMIT);
  return Number.isFinite(value) && value > 0 ? value : 10;
};

const currentFailures = (now: number): number => {
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    failures = 0;
  }
  return failures;
};

/** True while failed attempts in the current minute are below the limit. */
export const webnfcAllowed = (): boolean => currentFailures(Date.now()) < webnfcFailureLimit();

export const recordWebnfcFailure = (): void => {
  currentFailures(Date.now());
  failures += 1;
};
