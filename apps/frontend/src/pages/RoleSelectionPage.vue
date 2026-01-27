<template>
  <q-page class="ms-container">
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Rolle auswählen</h1>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          @click="goBack"
          size="md"
          padding="md"
          min-width="44px"
        />
      </div>
    </div>

    <div class="ms-section">
      <div class="role-grid">
        <div
          v-for="role in roles"
          :key="role.id"
          class="role-card"
          :class="{ 'role-card--selected': selectedRole === role.id }"
          @click="selectRole(role.id)"
        >
          <div class="role-card__icon-wrapper">
            <role-icon :role-id="role.id" />
          </div>
          <div class="text-h6 q-mt-md">{{ role.name }}</div>
          <q-toggle
            :model-value="selectedRole === role.id"
            @update:model-value="selectRole(role.id)"
            color="primary"
            class="q-mt-md"
          />
        </div>
      </div>
    </div>

    <div class="ms-section q-mt-lg">
      <q-btn
        label="Weiter"
        color="primary"
        size="lg"
        class="full-width action-button"
        :disable="!selectedRole"
        @click="proceedWithRole"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from 'stores/user-store';
import RoleIcon from 'components/RoleIcon.vue';

defineOptions({
  name: 'RoleSelectionPage',
});

interface Role {
  id: string;
  name: string;
}

const router = useRouter();
const userStore = useUserStore();
const selectedRole = ref<string | null>(null);

const roles: Role[] = [
  { id: 'admin', name: 'Admin' },
  { id: 'vorstand', name: 'Vorstand' },
  { id: 'bereichsleitung', name: 'Bereichsleitung' },
  { id: 'mitglied', name: 'Mitglied' },
];

function selectRole(roleId: string) {
  selectedRole.value = selectedRole.value === roleId ? null : roleId;
}

function goBack() {
  router.back();
}

function proceedWithRole() {
  if (selectedRole.value) {
    const role = roles.find((r) => r.id === selectedRole.value);
    if (role) {
      userStore.setRole(role.id, role.name);
      router.push('/dashboard');
    }
  }
}
</script>

<style scoped lang="scss">
.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.role-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  background: transparent;
  min-height: 280px;
  justify-content: center;

  &:hover {
    border-color: #111111;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  &--selected {
    border-color: #1f7a4d;
    background: rgba(31, 122, 77, 0.05);
  }

  &__icon-wrapper {
    width: 100px;
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
}

.action-button {
  min-height: 48px;
}

:deep(.body--dark) {
  .role-card {
    border-color: #333333;

    &:hover {
      border-color: #ffffff;
      box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
    }

    &--selected {
      border-color: #1f7a4d;
      background: rgba(31, 122, 77, 0.1);
    }

    .q-toggle {
      :deep(.q-toggle__track) {
        background-color: #555555;
      }

      :deep(.q-toggle__thumb) {
        background-color: #ffffff;
      }
    }
  }
}
</style>
