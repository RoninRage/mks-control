<template>
  <q-page class="flex flex-center">
    <div class="column items-center q-gutter-md">
      <div style="font-size: 30vh">
        404
      </div>

      <div class="text-h5 text-grey-7">
        Oops. Nothing here...
      </div>

      <q-btn
        color="primary"
        label="Go Home"
        to="/"
        size="lg"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
defineOptions({
  name: 'ErrorNotFound',
});
</script>
