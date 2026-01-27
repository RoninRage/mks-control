<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="text-h3 q-mb-md">About MKS Control</div>

      <q-card flat bordered>
        <q-card-section>
          <div class="text-h6">Project Information</div>
        </q-card-section>

        <q-card-section>
          <p>MKS Control is a modern web application built with:</p>
          <ul>
            <li>Quasar Framework v2</li>
            <li>Vue 3 with Composition API</li>
            <li>TypeScript for type safety</li>
            <li>Pinia for state management</li>
            <li>Vite for fast development</li>
          </ul>
        </q-card-section>

        <q-card-actions>
          <q-btn flat color="primary" label="Back to Home" icon="arrow_back" to="/" />
        </q-card-actions>
      </q-card>

      <q-card flat bordered class="q-mt-md">
        <q-card-section>
          <div class="text-h6">Features</div>
        </q-card-section>

        <q-card-section>
          <q-list bordered separator>
            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Responsive Design</q-item-label>
                <q-item-label caption>Works on all devices</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Material Design</q-item-label>
                <q-item-label caption>Beautiful UI components</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>TypeScript Support</q-item-label>
                <q-item-label caption>Type-safe development</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section avatar>
                <q-icon color="positive" name="check_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>PWA Ready</q-item-label>
                <q-item-label caption>Installable as an app</q-item-label>
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
