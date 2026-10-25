<template>
  <q-page class="flex flex-center">
    <q-card flat bordered class="login-card">
      <q-card-section class="column items-center q-gutter-lg">
        <div class="text-h4 text-center">Bitte Anmelden</div>

        <div class="rfid-icon-wrapper flex flex-center">
          <rfid-icon />
        </div>

        <q-card v-if="isKiosk" flat bordered class="status-card">
          <q-card-section>
            <div class="column q-gutter-sm">
              <div class="row items-center q-gutter-sm">
                <q-badge :color="statusColor" :label="statusLabel" class="ms-badge" />
                <span class="status-card__label">Gateway Connection</span>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-banner
          v-if="isKiosk && status === 'connected' && entranceRejected"
          class="bg-negative text-white"
          data-testid="entrance-key-rejected"
        >
          Der Eingangs-Schlüssel ist ungültig. Bitte unter „Eingang einrichten“ neu eintragen.
        </q-banner>

        <div v-if="!isKiosk" class="text-body1 text-grey-8" data-testid="login-hint">
          Bitte am Eingang mit dem Tag anmelden{{ hasNfc ? ' oder hier per Handy' : '' }}.
        </div>

        <div v-if="hasNfc && !isKiosk" class="nfc-section column items-center q-gutter-sm">
          <div class="text-caption text-grey">Per Handy anmelden</div>
          <mobile-nfc-scanner @scanned="onMobileNfcScanned" />
        </div>

        <q-btn
          flat
          dense
          no-caps
          color="primary"
          icon="settings"
          class="touch-button"
          :label="isKiosk ? 'Eingang einstellen' : 'Eingang einrichten'"
          data-testid="entrance-setup-open"
          @click="openEntranceSetup"
        />
      </q-card-section>
    </q-card>

    <q-dialog v-model="entranceDialog">
      <q-card class="entrance-dialog">
        <q-card-section>
          <div class="text-h6">Eingang einrichten</div>
          <div class="text-body2 q-mt-sm">
            Nur für den Bildschirm am Eingang mit NFC-Leser: Schlüssel aus
            <code>ENTRANCE_KEY</code> auf dem Server eintragen.
          </div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model="entranceKeyInput"
            outlined
            label="Eingangs-Schlüssel (mke_…)"
            type="password"
            autocomplete="off"
            data-testid="entrance-key-input"
            @keyup.enter="saveEntranceKey"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-gutter-sm">
          <q-btn
            v-if="isKiosk"
            flat
            color="negative"
            label="Entfernen"
            class="touch-button"
            data-testid="entrance-key-remove"
            @click="removeEntranceKey"
          />
          <q-btn v-close-popup flat label="Abbrechen" class="touch-button" />
          <q-btn
            unelevated
            color="primary"
            label="Speichern"
            class="touch-button"
            data-testid="entrance-key-save"
            :disable="!entranceKeyInput.trim()"
            @click="saveEntranceKey"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Dark, useQuasar } from 'quasar';
import { authEventSource } from 'src/services/authEventSource';
import type { ConnectionStatus } from 'src/services/authEventSource';
import { useAuthStore } from 'src/stores/auth';
import { authService, LoginError } from 'src/services/authService';
import { useUserStore } from 'src/stores/user-store';
import { clearEntranceKey, getEntranceKey, setEntranceKey } from 'src/utils/entranceConfig';
import { useRouter } from 'vue-router';
import RfidIcon from 'components/RfidIcon.vue';
import MobileNfcScanner from 'components/MobileNfcScanner.vue';

defineOptions({
  name: 'IndexPage',
});

const authStore = useAuthStore();
const userStore = useUserStore();
const router = useRouter();
const $q = useQuasar();
const status = ref<ConnectionStatus>('connecting');
const hasNfc = 'NDEFReader' in window;

// Entrance kiosk: this browser has the entrance key and receives the scans of the entrance reader.
const isKiosk = ref<boolean>(getEntranceKey() !== null);
const entranceAccepted = ref<boolean>(authEventSource.isEntrance());
const entranceRejected = ref<boolean>(false);
const entranceDialog = ref<boolean>(false);
const entranceKeyInput = ref<string>('');

function openEntranceSetup(): void {
  entranceKeyInput.value = '';
  entranceDialog.value = true;
}

function saveEntranceKey(): void {
  const key = entranceKeyInput.value.trim();
  if (!key) {
    return;
  }
  setEntranceKey(key);
  isKiosk.value = true;
  entranceRejected.value = false;
  entranceDialog.value = false;
  authEventSource.reconnect();
}

function removeEntranceKey(): void {
  clearEntranceKey();
  isKiosk.value = false;
  entranceRejected.value = false;
  entranceDialog.value = false;
  authEventSource.reconnect();
}

// Phone: the tag is read here and sent to the backend, which answers with a session.
async function onMobileNfcScanned(uid: string): Promise<void> {
  try {
    const session = await authService.loginWithWebNfc(uid);
    userStore.setSession(session);
    await router.replace('/dashboard');
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: err instanceof LoginError ? err.message : 'Anmeldung fehlgeschlagen',
      position: 'center',
      timeout: 5000,
    });
  }
}

const statusLabel = computed((): string => {
  if (status.value !== 'connected') {
    switch (status.value) {
      case 'connecting':
        return 'Connecting...';
      case 'disconnected':
        return 'Disconnected';
      case 'retrying':
        return 'Retrying...';
      default:
        return 'Unknown';
    }
  }

  // WebSocket is connected, now check heartbeat
  const lastHeartbeat = authStore.lastHeartbeat;
  if (!lastHeartbeat) {
    return 'Waiting for Bridge...';
  }

  const lastHeartbeatTime = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const timeSinceHeartbeat = now - lastHeartbeatTime;

  // Consider connected if heartbeat within last 30 seconds
  if (timeSinceHeartbeat < 30000) {
    return 'Connected';
  } else {
    return 'Bridge Offline';
  }
});

const statusColor = computed((): string => {
  if (status.value !== 'connected') {
    switch (status.value) {
      case 'connecting':
      case 'retrying':
        return 'warning';
      case 'disconnected':
        return 'negative';
      default:
        return 'grey';
    }
  }

  // WebSocket is connected, check heartbeat
  const lastHeartbeat = authStore.lastHeartbeat;
  if (!lastHeartbeat) {
    return 'warning';
  }

  const lastHeartbeatTime = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const timeSinceHeartbeat = now - lastHeartbeatTime;

  if (timeSinceHeartbeat < 30000) {
    return 'positive';
  } else {
    return 'negative';
  }
});

onMounted(() => {
  const q = useQuasar(); // Get fresh instance in onMounted

  // Always use system default theme on login screen
  Dark.set('auto');

  authEventSource.onStatus((next: ConnectionStatus): void => {
    status.value = next;
    if (next === 'connected' && isKiosk.value) {
      // The server answers the hello right after connecting; no answer means wrong key.
      window.setTimeout(() => {
        entranceRejected.value = isKiosk.value && !entranceAccepted.value;
      }, 1500);
    }
  });

  authEventSource.onEntranceStatus((accepted: boolean): void => {
    entranceAccepted.value = accepted;
    if (accepted) {
      entranceRejected.value = false;
    }
  });

  authEventSource.onUnknownTag((): void => {
    q.notify({
      type: 'negative',
      message: 'Unbekannter Benutzer',
      position: 'center',
      timeout: 5000,
      badgeClass: 'hidden',
      badgeStyle: 'display: none;',
    });
  });

  authEventSource.onReaderError((): void => {
    q.notify({
      type: 'negative',
      message: 'Fehler beim Lesen der Karte',
      position: 'center',
      timeout: 5000,
      badgeClass: 'hidden',
      badgeStyle: 'display: none;',
    });
  });

  authEventSource.onInactiveUser((): void => {
    q.notify({
      type: 'negative',
      message: 'Benutzer deaktiviert',
      position: 'center',
      timeout: 5000,
      badgeClass: 'hidden',
      badgeStyle: 'display: none;',
    });
  });
});
</script>

<style scoped lang="scss">
.login-card {
  padding: 2rem;
  min-width: 400px;
  max-width: 500px;
  text-align: center;
}

.rfid-icon-wrapper {
  width: 200px;
  height: 200px;
}

.entrance-dialog {
  width: 100%;
  max-width: 420px;
}

.status-card {
  width: 100%;
  max-width: 320px;

  &__label {
    font-size: 14px;
    color: var(--ms-muted);
  }
}
</style>
