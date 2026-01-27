<template>
  <q-page class="flex flex-center login-page">
    <div class="login-container column items-center justify-center q-gutter-xl">
      <div class="text-h4 text-center">Bitte mit anmelden</div>
      
      <div class="rfid-icon-wrapper flex flex-center">
        <rfid-icon />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import RfidIcon from 'components/RfidIcon.vue';

defineOptions({
  name: 'IndexPage',
});
</script>

<style scoped lang="scss">
.login-page {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-container {
  background: white;
  border-radius: 16px;
  padding: 3rem 4rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  min-width: 400px;
  text-align: center;
}

.rfid-icon-wrapper {
  width: 200px;
  height: 200px;
  color: #1976d2;
}
</style>
