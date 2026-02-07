<template>
  <div class="ms-section">
    <div class="user-header">
      <div class="user-header__info">
        <div class="user-header__avatar">
          <role-icon v-if="userStore.roleId" :role-id="userStore.roleId" />
        </div>
        <div class="user-header__details">
          <div class="text-h5">{{ userStore.fullName }}</div>
          <div class="text-body2 text-grey-7">{{ userStore.roleName }}</div>
        </div>
      </div>
      <q-btn
        flat
        icon="logout"
        color="primary"
        @click="handleLogout"
        size="md"
        padding="md"
        min-width="44px"
        class="q-ml-md"
      >
        <q-tooltip>Abmelden</q-tooltip>
      </q-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useUserStore } from 'stores/user-store';
import { authService } from 'src/services/authService';
import RoleIcon from 'components/RoleIcon.vue';

defineOptions({
  name: 'UserHeader',
});

const router = useRouter();
const $q = useQuasar();
const userStore = useUserStore();

async function handleLogout() {
  // Log audit event for logout before clearing user session
  if (userStore.userId) {
    await authService.logoutWithAudit(userStore.userId, 'user-initiated');
  }

  userStore.logout();
  router.replace('/');
}
</script>

<style scoped lang="scss">
// User header section
.user-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  background: var(--ms-background);
  border: 1px solid var(--ms-border);
  border-radius: 16px;

  &__info {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  &__avatar {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ms-background);
    border: 2px solid var(--ms-border);
    border-radius: 50%;
    padding: 12px;
    flex-shrink: 0;
  }

  &__details {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}
</style>
