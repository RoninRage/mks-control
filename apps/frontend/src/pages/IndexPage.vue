<template>
  <q-page class="flex flex-center">
    <q-card flat bordered class="login-card">
      <q-card-section class="column items-center q-gutter-lg">
        <div class="text-h4 text-center">Bitte Anmelden</div>

        <div class="rfid-icon-wrapper flex flex-center cursor-pointer" @click="simulateLogin">
          <rfid-icon />
        </div>

        <q-card flat bordered class="status-card">
          <q-card-section>
            <div class="column q-gutter-sm">
              <div class="row items-center q-gutter-sm">
                <q-badge :color="statusColor" :label="statusLabel" />
                <span class="status-card__label">Gateway Connection</span>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { authEventSource } from 'src/services/authEventSource';
import type { ConnectionStatus, TagEvent } from 'src/services/authEventSource';
import { useAuthStore } from 'src/stores/auth';
import RfidIcon from 'components/RfidIcon.vue';

defineOptions({
  name: 'IndexPage',
});

const router = useRouter();
const $q = useQuasar();
const authStore = useAuthStore();
const status = ref<ConnectionStatus>('connecting');

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

function simulateLogin() {
  router.push('/role-selection');
}

onMounted(() => {
  const q = useQuasar(); // Get fresh instance in onMounted

  authEventSource.onStatus((next: ConnectionStatus): void => {
    status.value = next;
  });

  authEventSource.onUnknownTag((event: TagEvent): void => {
    console.log('[IndexPage] Unknown tag detected:', event);
    q.notify({
      type: 'negative',
      message: 'Unbekannter Benutzer',
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
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
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
