// Timing settings for machine control. Durations configured in "minutes" (watchdog,
// maximum release time, "Noch da?" answer time) are multiplied by minuteMs(); tests set
// TERMINAL_MINUTE_MS=1000 so one "minute" lasts one second.

const fromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const minuteMs = (): number => fromEnv('TERMINAL_MINUTE_MS', 60_000);

// A Pi that has not called the backend for this long counts as offline.
export const terminalOfflineAfterMs = (): number => fromEnv('TERMINAL_OFFLINE_AFTER_MS', 60_000);

// How often the Pi should poll its state (well inside the offline limit).
export const terminalPollIntervalMs = (): number =>
  Math.max(1000, Math.floor(terminalOfflineAfterMs() / 4));

// How often the machine control loop runs.
export const machineTickMs = (): number => fromEnv('MACHINE_TICK_MS', 1000);

export const DEFAULT_WATCHDOG_MINUTES = 3;
export const DEFAULT_STILL_THERE_MINUTES = 5;
