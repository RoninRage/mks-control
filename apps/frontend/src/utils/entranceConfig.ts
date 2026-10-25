// The entrance kiosk: a browser next to the entrance NFC reader. It stores the entrance key
// (ENTRANCE_KEY on the server, "mke_…") once; with it the WebSocket receives the scans of the
// entrance reader and their login codes (docs/auth-plan.md).

const STORAGE_KEY = 'mks.entranceKey';

export const getEntranceKey = (): string | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
};

export const setEntranceKey = (key: string): void => {
  window.localStorage.setItem(STORAGE_KEY, key.trim());
};

export const clearEntranceKey = (): void => {
  window.localStorage.removeItem(STORAGE_KEY);
};

export const isEntranceKiosk = (): boolean => getEntranceKey() !== null;
