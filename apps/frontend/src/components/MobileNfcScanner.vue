<template>
  <div class="mobile-nfc-scanner">
    <q-btn
      :loading="scanning"
      :disable="scanning"
      :label="scanning ? 'Wird gescannt…' : 'Scan starten'"
      icon="nfc"
      color="primary"
      @click="startScan"
      class="touch-target"
    />
    <div v-if="scanning" class="text-caption text-grey q-mt-sm">
      Karte ans Telefon halten…
    </div>
    <div v-if="errorMsg" class="text-caption text-negative q-mt-sm">
      {{ errorMsg }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ name: 'MobileNfcScanner' });

const emit = defineEmits<{
  scanned: [uid: string];
}>();

const scanning = ref(false);
const errorMsg = ref('');

// NDEFReader type stubs (not yet in all TS lib.dom versions)
interface NDEFReader extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: 'reading', listener: (event: NDEFReadingEvent) => void): void;
  addEventListener(type: 'readingerror', listener: (event: Event) => void): void;
}
interface NDEFReadingEvent extends Event {
  serialNumber: string;
}

async function startScan(): Promise<void> {
  if (scanning.value) return;
  errorMsg.value = '';
  scanning.value = true;

  try {
    const NDEFReaderClass = (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader;
    const reader = new NDEFReaderClass();
    const abortController = new AbortController();

    await reader.scan({ signal: abortController.signal });

    reader.addEventListener('reading', (event: NDEFReadingEvent) => {
      const raw = event.serialNumber ?? '';
      const uid = raw.toUpperCase().replace(/:/g, '');
      if (!uid) return;

      abortController.abort();
      scanning.value = false;
      emit('scanned', uid);
    });

    reader.addEventListener('readingerror', () => {
      errorMsg.value = 'Fehler beim Lesen der Karte. Bitte erneut versuchen.';
      scanning.value = false;
    });
  } catch (err: unknown) {
    scanning.value = false;
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError') {
        errorMsg.value = 'Berechtigung verweigert. Bitte NFC-Zugriff erlauben.';
      } else {
        errorMsg.value = `NFC Fehler: ${err.message}`;
      }
    }
  }
}
</script>

<style scoped lang="scss">
.mobile-nfc-scanner {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.touch-target {
  min-height: 48px;
  padding: 12px 24px;
}
</style>
