<template>
  <q-page class="ms-container">
    <div class="ms-section">
      <h1 class="text-h3 q-mb-sm">About MKS Control</h1>
      <p class="text-body1 ms-muted q-mb-lg">A modern RFID control system for MakerSpaces</p>
    </div>

    <div class="ms-section">
      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Project Information</div>
          <p class="text-body1 q-mb-sm">MKS Control is a modern web application built with:</p>
          <ul class="q-pl-md">
            <li class="q-mb-xs">Quasar Framework v2</li>
            <li class="q-mb-xs">Vue 3 with Composition API</li>
            <li class="q-mb-xs">TypeScript for type safety</li>
            <li class="q-mb-xs">Pinia for state management</li>
            <li class="q-mb-xs">Vite for fast development</li>
          </ul>
        </q-card-section>

        <q-card-actions>
          <q-btn flat color="primary" label="Back to Home" icon="arrow_back" to="/" />
        </q-card-actions>
      </q-card>
    </div>

    <div class="ms-section">
      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Features</div>
        </q-card-section>

        <q-card-section>
          <q-list>
            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Responsive Design</q-item-label>
                <q-item-label caption class="ms-muted">Works on all devices</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>MakerSpace Theme</q-item-label>
                <q-item-label caption class="ms-muted">Clean, monochrome design</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>TypeScript Support</q-item-label>
                <q-item-label caption class="ms-muted">Type-safe development</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>PWA Ready</q-item-label>
                <q-item-label caption class="ms-muted">Installable as an app</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
defineOptions({
  name: 'AboutPage',
});
</script>
