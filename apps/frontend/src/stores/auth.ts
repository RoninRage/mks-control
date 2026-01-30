import { defineStore } from 'pinia';
import type { TagEvent } from 'src/services/authEventSource';

interface AuthState {
  locked: boolean;
  lastUid: string | null;
  lastTs: string | null;
  lastHeartbeat: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    locked: true,
    lastUid: null,
    lastTs: null,
    lastHeartbeat: null,
  }),
  actions: {
    unlock(event: TagEvent): void {
      this.locked = false;
      this.lastUid = event.uid;
      this.lastTs = event.ts;
    },
    setHeartbeat(event: { ts: string }): void {
      this.lastHeartbeat = event.ts;
    },
    lock(): void {
      this.locked = true;
    },
  },
});
