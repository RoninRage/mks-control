import { terminalOfflineAfterMs } from '../machines/timing';

// Last time each Pi called the backend (any request with its key). Kept in memory; after a
// backend restart every Pi counts as online until it fails to call in.

const lastContact = new Map<string, number>();
const startedAt = Date.now();

export const markTerminalContact = (terminalId: string): void => {
  lastContact.set(terminalId, Date.now());
};

export const isTerminalOnline = (terminalId: string): boolean => {
  const last = lastContact.get(terminalId) ?? startedAt;
  return Date.now() - last < terminalOfflineAfterMs();
};

export const getLastContact = (terminalId: string): number | undefined =>
  lastContact.get(terminalId);
