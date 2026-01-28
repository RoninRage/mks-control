<template>
  <q-page class="ms-container">
    <!-- User Header Section -->
    <user-header />

    <!-- Profile Content -->
    <div class="ms-section">
      <h1 class="text-h4 q-mb-lg">Mein Profil</h1>

      <div class="dashboard-section">
        <div class="text-h6 q-mb-md">Hello World</div>

        <q-btn
          flat
          color="primary"
          label="Zurück"
          icon="arrow_back"
          @click="handleBack"
          class="q-mt-md"
        />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useUserStore } from 'stores/user-store';
import UserHeader from 'components/UserHeader.vue';

defineOptions({
  name: 'ProfilePage',
});

const router = useRouter();
const userStore = useUserStore();

function handleBack() {
  router.push('/dashboard');
}
</script>

<style scoped lang="scss">
// Profile page styles (if needed)
</style>
