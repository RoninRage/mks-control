<template>
  <q-layout view="lHh Lpr lFf">
    <q-header flat bordered>
      <q-toolbar>
        <q-toolbar-title>MKS Control</q-toolbar-title>

        <q-btn
          flat
          round
          dense
          color="white"
          :icon="$q.dark.isActive ? 'light_mode' : 'dark_mode'"
          @click="toggleDarkMode"
        >
          <q-tooltip>{{ $q.dark.isActive ? 'Light Mode' : 'Dark Mode' }}</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { useQuasar } from 'quasar';

defineOptions({
  name: 'MainLayout',
});

const $q = useQuasar();

function toggleDarkMode() {
  $q.dark.toggle();
}
</script>
