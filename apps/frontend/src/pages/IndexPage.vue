<template>
  <q-page class="flex flex-center">
    <q-card flat bordered class="login-card">
      <q-card-section class="column items-center q-gutter-xl">
        <div class="text-h4 text-center">Bitte Anmelden</div>

        <div class="rfid-icon-wrapper flex flex-center cursor-pointer" @click="simulateLogin">
          <rfid-icon />
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import RfidIcon from 'components/RfidIcon.vue';

defineOptions({
  name: 'IndexPage',
});

const router = useRouter();

function simulateLogin() {
  router.push('/role-selection');
}
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
</style>
