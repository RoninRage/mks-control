<template>
  <div class="lock-screen q-pa-lg">
    <div class="lock-screen__content">
      <div class="lock-screen__title">LOCKED</div>
      <div class="lock-screen__row">Connection: {{ status }}</div>
      <div class="lock-screen__row">Last UID: {{ lastUidLabel }}</div>
      <div class="lock-screen__row">Last Seen: {{ lastTsLabel }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ConnectionStatus } from 'src/services/authEventSource';
import { authEventSource } from 'src/services/authEventSource';
import { useAuthStore } from 'src/stores/auth';

defineOptions({ name: 'LockPage' });

const store = useAuthStore();
const status = ref<ConnectionStatus>('connecting');

const lastUidLabel = computed((): string => store.lastUid ?? '—');
const lastTsLabel = computed((): string => store.lastTs ?? '—');

onMounted(() => {
  authEventSource.onStatus((next: ConnectionStatus): void => {
    status.value = next;
  });
});
</script>

<style scoped lang="scss">
.lock-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;

  &__content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__title {
    font-size: 36px;
    font-weight: 700;
    letter-spacing: 2px;
  }

  &__row {
    font-size: 16px;
  }
}
</style>
