<template>
  <q-layout view="hHh lpR fFf">
    <q-page-container>
      <q-page class="terminal" data-testid="terminal-page" @pointerdown="reportActivity">
        <!-- Setup: no key stored in this browser yet -->
        <div v-if="!configured" class="terminal__setup" data-testid="terminal-setup">
          <q-icon name="tablet_mac" size="64px" class="q-mb-md" />
          <h1 class="text-h4 q-my-none">Terminal einrichten</h1>
          <p class="text-body1 text-grey-7 q-mt-sm">
            Schlüssel eingeben, den ein Admin unter „Terminals" für diese Maschine erzeugt hat.
          </p>
          <q-input
            v-model="setupToken"
            outlined
            label="Terminal-Schlüssel"
            class="terminal__setup-input"
            autocomplete="off"
            data-testid="terminal-setup-token"
            @keyup.enter="connect"
          />
          <q-banner
            v-if="setupError"
            class="bg-negative text-white q-mt-md"
            data-testid="terminal-setup-error"
          >
            {{ setupError }}
          </q-banner>
          <q-btn
            unelevated
            color="primary"
            size="lg"
            label="Verbinden"
            class="terminal__big-button q-mt-lg"
            data-testid="terminal-setup-connect"
            :loading="connecting"
            :disable="!setupToken.trim()"
            @click="connect"
          />
        </div>

        <!-- Configured -->
        <div v-else class="terminal__main">
          <header class="terminal__header">
            <div>
              <div class="text-h3 terminal__machine" data-testid="terminal-machine">
                {{ state?.equipment?.name ?? 'Keine Maschine zugeordnet' }}
              </div>
              <div class="text-body2 text-grey-7" data-testid="terminal-name">
                {{ state?.terminal.name }}
              </div>
            </div>
            <q-chip
              v-if="loadError"
              color="negative"
              text-color="white"
              icon="cloud_off"
              data-testid="terminal-offline"
            >
              Keine Verbindung
            </q-chip>
          </header>

          <q-linear-progress v-if="!state && !loadError" indeterminate color="primary" />

          <!-- Ready: nobody logged in -->
          <section
            v-if="state && !state.session"
            class="terminal__panel"
            data-testid="terminal-ready"
          >
            <q-icon name="contactless" size="120px" class="terminal__scan-icon" />
            <div class="text-h4">Tag scannen zum Anmelden</div>
            <q-banner
              v-if="scanMessage"
              :class="scanMessage.className"
              class="terminal__message q-mt-lg"
              data-testid="terminal-scan-message"
              :data-result="scanMessage.result"
            >
              {{ scanMessage.text }}
            </q-banner>
          </section>

          <!-- Logged in -->
          <section v-if="state?.session" class="terminal__panel" data-testid="terminal-session">
            <div class="text-h4" data-testid="terminal-member">
              {{ state.session.firstName }} {{ state.session.lastName }}
            </div>

            <q-banner
              v-if="state.session.canRelease"
              class="bg-positive text-white terminal__message q-mt-lg"
              data-testid="terminal-permission"
              data-allowed="true"
            >
              <template #avatar>
                <q-icon name="verified" />
              </template>
              Berechtigt für diese Maschine{{
                state.session.adminOverride ? ' (als Admin, ohne eigene Berechtigung)' : ''
              }}
            </q-banner>
            <q-banner
              v-else
              class="bg-negative text-white terminal__message q-mt-lg"
              data-testid="terminal-permission"
              data-allowed="false"
              :data-reason="state.session.denyReason"
            >
              <template #avatar>
                <q-icon name="block" />
              </template>
              {{ denyText(state.session.denyReason) }}
            </q-banner>

            <div class="text-body1 text-grey-7 q-mt-lg" data-testid="terminal-auto-logout">
              Automatische Abmeldung in {{ remainingText }}
            </div>

            <div class="terminal__actions q-mt-xl">
              <q-btn
                unelevated
                color="primary"
                size="xl"
                icon="logout"
                label="Abmelden"
                class="terminal__big-button"
                data-testid="terminal-logout"
                :loading="loggingOut"
                @click="logout"
              />
              <q-btn
                v-if="state.session.isAdmin"
                flat
                color="negative"
                icon="link_off"
                label="Terminal trennen"
                class="terminal__small-button"
                data-testid="terminal-disconnect"
                @click="confirmDisconnect"
              />
            </div>
          </section>
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import type {
  TerminalDenyReason,
  TerminalScanResult,
  TerminalState,
  TerminalStateEvent,
} from '@mks-control/shared-types';
import { authEventSource } from 'src/services/authEventSource';
import { TerminalApiError, terminalClientService } from 'src/services/terminalService';
import { clearTerminalToken, getTerminalToken, setTerminalToken } from 'src/utils/terminalConfig';

defineOptions({
  name: 'TerminalPage',
});

interface ScanMessage {
  result: TerminalScanResult;
  text: string;
  className: string;
}

const STATE_POLL_INTERVAL_MS = 30_000;
const SCAN_MESSAGE_VISIBLE_MS = 8_000;
const ACTIVITY_THROTTLE_MS = 30_000;

const $q = useQuasar();

const configured = ref(getTerminalToken() !== null);
const setupToken = ref('');
const setupError = ref<string | null>(null);
const connecting = ref(false);

const state = ref<TerminalState | null>(null);
const loadError = ref(false);
const loggingOut = ref(false);
const now = ref(Date.now());

let pollTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let removeStateListener: (() => void) | null = null;
let lastActivityReport = 0;

const SCAN_TEXTS: Record<TerminalScanResult, { text: string; className: string }> = {
  login: { text: 'Angemeldet', className: 'bg-positive text-white' },
  logout: { text: 'Abgemeldet', className: 'bg-grey-7 text-white' },
  'unknown-tag': { text: 'Dieser Tag ist unbekannt.', className: 'bg-negative text-white' },
  'inactive-member': {
    text: 'Dieses Mitglied ist deaktiviert.',
    className: 'bg-negative text-white',
  },
};

const scanMessage = computed((): ScanMessage | null => {
  const scan = state.value?.lastScan;
  if (!scan || scan.result === 'login') {
    return null;
  }
  if (now.value - Date.parse(scan.at) > SCAN_MESSAGE_VISIBLE_MS) {
    return null;
  }
  return { result: scan.result, ...SCAN_TEXTS[scan.result] };
});

const remainingText = computed((): string => {
  const expiresAt = state.value?.session?.expiresAt;
  if (!expiresAt) {
    return '–';
  }
  const seconds = Math.max(0, Math.round((Date.parse(expiresAt) - now.value) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')} min`;
});

function denyText(reason: TerminalDenyReason | undefined): string {
  if (reason === 'equipment-unavailable') {
    return 'Diese Maschine ist als nicht verfügbar markiert.';
  }
  return 'Keine Berechtigung für diese Maschine.';
}

async function loadState(): Promise<void> {
  try {
    state.value = await terminalClientService.getState();
    loadError.value = false;
  } catch (err) {
    if (err instanceof TerminalApiError && err.status === 401) {
      // Key was rotated or the terminal deleted: back to setup.
      disconnect('Der Schlüssel ist nicht mehr gültig. Bitte neu einrichten.');
      return;
    }
    loadError.value = true;
  }
}

function startUpdates(): void {
  stopUpdates();
  void loadState();
  pollTimer = setInterval(() => {
    void loadState();
  }, STATE_POLL_INTERVAL_MS);
  removeStateListener = authEventSource.onTerminalState((event: TerminalStateEvent) => {
    if (state.value && event.terminalId === state.value.terminal.id) {
      void loadState();
    }
  });
}

function stopUpdates(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  removeStateListener?.();
  removeStateListener = null;
}

async function connect(): Promise<void> {
  const token = setupToken.value.trim();
  if (!token) {
    return;
  }
  connecting.value = true;
  setupError.value = null;
  try {
    state.value = await terminalClientService.getState(token);
    setTerminalToken(token);
    setupToken.value = '';
    configured.value = true;
    startUpdates();
  } catch (err) {
    setupError.value =
      err instanceof TerminalApiError && err.status === 401
        ? 'Dieser Schlüssel ist ungültig.'
        : 'Verbindung zum Server fehlgeschlagen.';
  } finally {
    connecting.value = false;
  }
}

function disconnect(message: string | null): void {
  stopUpdates();
  clearTerminalToken();
  state.value = null;
  configured.value = false;
  setupError.value = message;
}

async function logout(): Promise<void> {
  loggingOut.value = true;
  try {
    state.value = await terminalClientService.logout();
  } catch {
    loadError.value = true;
  } finally {
    loggingOut.value = false;
  }
}

function confirmDisconnect(): void {
  $q.dialog({
    title: 'Terminal trennen',
    message:
      'Der Schlüssel wird aus diesem Browser gelöscht. Danach muss das Terminal neu ' +
      'eingerichtet werden.',
    cancel: { flat: true, label: 'Abbrechen' },
    ok: { flat: true, color: 'negative', label: 'Trennen' },
    persistent: true,
  }).onOk(() => {
    void terminalClientService.logout().catch(() => undefined);
    disconnect(null);
  });
}

// Any touch while logged in pushes the automatic logout back (throttled).
function reportActivity(): void {
  if (!state.value?.session) {
    return;
  }
  const time = Date.now();
  if (time - lastActivityReport < ACTIVITY_THROTTLE_MS) {
    return;
  }
  lastActivityReport = time;
  void terminalClientService
    .activity()
    .then(() => loadState())
    .catch(() => undefined);
}

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  if (configured.value) {
    startUpdates();
  }
});

onBeforeUnmount(() => {
  stopUpdates();
  if (clockTimer) {
    clearInterval(clockTimer);
  }
});
</script>

<style scoped lang="scss">
.terminal {
  min-height: 100vh;
  padding: 24px;
  display: flex;
  flex-direction: column;

  &__setup {
    max-width: 560px;
    margin: auto;
    width: 100%;
    text-align: center;
  }

  &__setup-input {
    text-align: left;
  }

  &__main {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 24px;
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  &__machine {
    word-break: break-word;
  }

  &__panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  &__scan-icon {
    opacity: 0.7;
    margin-bottom: 16px;
  }

  &__message {
    max-width: 640px;
    width: 100%;
    font-size: 1.25rem;
    border-radius: 12px;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  &__big-button {
    min-height: 64px;
    min-width: 240px;
  }

  &__small-button {
    min-height: 44px;
  }
}
</style>
