<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <div>
          <h1 class="text-h3 q-mb-sm">Über MKS Control</h1>
          <p class="text-body1 ms-muted">Ein modernes RFID-Steuerungssystem für MakerSpaces</p>
        </div>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          @click="goBack"
          size="lg"
          padding="md"
          min-width="48px"
          min-height="48px"
          aria-label="Go back"
        />
      </div>
    </div>

    <div class="ms-section">
      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Projektinformationen</div>
          <p class="text-body1 q-mb-sm">MKS Control ist eine moderne Webanwendung gebaut mit:</p>
          <ul class="q-pl-md">
            <li class="q-mb-xs">Quasar Framework v2</li>
            <li class="q-mb-xs">Vue 3 with Composition API</li>
            <li class="q-mb-xs">TypeScript für Typsicherheit</li>
            <li class="q-mb-xs">Pinia für Zustandsverwaltung</li>
            <li class="q-mb-xs">Vite für schnelle Entwicklung</li>
          </ul>
        </q-card-section>
      </q-card>
    </div>

    <div class="ms-section">
      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Funktionen</div>
        </q-card-section>

        <q-card-section>
          <q-list>
            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Responsives Design</q-item-label>
                <q-item-label caption class="ms-muted">Funktioniert auf allen Geräten</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>MakerSpace-Design</q-item-label>
                <q-item-label caption class="ms-muted">Sauberes, monochromes Design</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>TypeScript-Unterstützung</q-item-label>
                <q-item-label caption class="ms-muted">Typsichere Entwicklung</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>PWA-fähig</q-item-label>
                <q-item-label caption class="ms-muted">Als App installierbar</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useUserStore } from 'stores/user-store';

defineOptions({
  name: 'AboutPage',
});

const router = useRouter();
const userStore = useUserStore();

function goBack() {
  // If user is authenticated (has a role), go back to dashboard
  // Otherwise go to index page
  if (userStore.isAuthenticated) {
    router.push('/dashboard');
  } else {
    router.push('/');
  }
}
</script>

<style scoped lang="scss">
.action-button {
  min-height: 44px;
  min-width: 44px;
  padding: 8px 24px;
}
</style>
