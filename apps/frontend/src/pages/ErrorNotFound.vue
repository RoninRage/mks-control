<template>
  <q-page class="flex flex-center">
    <div class="column items-center q-gutter-lg text-center">
      <div class="text-h1" style="font-size: 8rem; font-weight: 700; line-height: 1">404</div>

      <div class="text-h5 ms-muted">Oops. Nothing here...</div>

      <q-btn color="primary" label="Go Home" icon="home" size="lg" @click="$router.replace('/')" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
defineOptions({
  name: 'ErrorNotFound',
});
</script>
