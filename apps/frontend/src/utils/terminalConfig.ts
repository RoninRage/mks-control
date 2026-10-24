// Kiosk mode for machine terminals (one Raspberry Pi per machine).
// The terminal key is stored in this browser only. While it is set, the app shows nothing
// but the terminal page and ignores tag scans from the entrance reader.

const STORAGE_KEY = 'mksTerminalToken';

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const getTerminalToken = (): string | null => {
  const value = safeStorage()?.getItem(STORAGE_KEY);
  return value ? value : null;
};

export const setTerminalToken = (token: string): void => {
  safeStorage()?.setItem(STORAGE_KEY, token.trim());
};

export const clearTerminalToken = (): void => {
  safeStorage()?.removeItem(STORAGE_KEY);
};

export const isTerminalMode = (): boolean => getTerminalToken() !== null;

// Only requests to the terminal API carry the key.
export const isTerminalApiUrl = (url: string): boolean => /\/api\/terminal(\/|\?|$)/.test(url);
