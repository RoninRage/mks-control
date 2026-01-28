<template>
  <q-page class="ms-container">
    <!-- User Header Section -->
    <div class="ms-section">
      <div class="user-header">
        <div class="user-header__info">
          <div class="user-header__avatar">
            <role-icon v-if="userStore.roleId" :role-id="userStore.roleId" />
          </div>
          <div class="user-header__details">
            <div class="text-h5">{{ userStore.roleName }}</div>
            <div class="text-body2 text-grey-7">{{ getRoleDescription() }}</div>
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

    <!-- Dashboard Content -->
    <div class="ms-section">
      <h1 class="text-h4 q-mb-lg">Dashboard</h1>

      <!-- Admin Section -->
      <div v-if="userStore.can('manage:equipment')" class="dashboard-section">
        <h2 class="text-h5 q-mb-md">Administration</h2>
        <div class="action-grid">
          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="build" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Ausstattung verwalten</div>
              <div class="text-body2 text-grey-7">Geräte und Ausstattung verwalten</div>
            </q-card-section>
            <q-card-actions>
              <q-btn flat color="primary" label="Öffnen" class="action-card__button" />
            </q-card-actions>
          </q-card>
        </div>
      </div>

      <!-- Vorstand Section -->
      <div v-if="userStore.can('manage:areas')" class="dashboard-section">
        <h2 class="text-h5 q-mb-md">Vorstand</h2>
        <div class="action-grid">
          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="category" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Bereiche verwalten</div>
              <div class="text-body2 text-grey-7">Bereiche definieren und verwalten</div>
            </q-card-section>
            <q-card-actions>
              <q-btn flat color="primary" label="Öffnen" class="action-card__button" />
            </q-card-actions>
          </q-card>
        </div>
      </div>

      <!-- Bereichsleitung Section -->
      <div v-if="userStore.can('manage:area-permissions')" class="dashboard-section">
        <h2 class="text-h5 q-mb-md">Bereichsleitung</h2>
        <div class="action-grid">
          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="admin_panel_settings" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Berechtigungen</div>
              <div class="text-body2 text-grey-7">Berechtigungen in Ihrem Bereich verwalten</div>
            </q-card-section>
            <q-card-actions>
              <q-btn flat color="primary" label="Öffnen" class="action-card__button" />
            </q-card-actions>
          </q-card>
        </div>
      </div>

      <!-- Mitglied Section -->
      <div v-if="userStore.can('view:profile')" class="dashboard-section">
        <h2 class="text-h5 q-mb-md">Mitglied</h2>
        <div class="action-grid">
          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="account_circle" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Mein Profil</div>
              <div class="text-body2 text-grey-7">Persönliche Informationen ansehen</div>
            </q-card-section>
            <q-card-actions>
              <q-btn
                flat
                color="primary"
                label="Öffnen"
                class="action-card__button"
                to="/profile"
              />
            </q-card-actions>
          </q-card>

          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="admin_panel_settings" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Berechtigungen</div>
              <div class="text-body2 text-grey-7">Ihre Zugriffsberechtigungen ansehen</div>
            </q-card-section>
            <q-card-actions>
              <q-btn flat color="primary" label="Öffnen" class="action-card__button" />
            </q-card-actions>
          </q-card>
        </div>
      </div>

      <!-- Common Section for All Roles -->
      <div class="dashboard-section q-mt-lg">
        <h2 class="text-h5 q-mb-md">Allgemein</h2>
        <div class="action-grid">
          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="info" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Über</div>
              <div class="text-body2 text-grey-7">Informationen über MKS Control</div>
            </q-card-section>
            <q-card-actions>
              <q-btn flat color="primary" label="Öffnen" class="action-card__button" to="/about" />
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useUserStore } from 'stores/user-store';
import RoleIcon from 'components/RoleIcon.vue';

defineOptions({
  name: 'DashboardPage',
});

const router = useRouter();
const $q = useQuasar();
const userStore = useUserStore();

function getRoleDescription(): string {
  const descriptions: Record<string, string> = {
    admin: 'Vollständige Systemverwaltung',
    vorstand: 'Vorstandsmitglied mit erweiterten Rechten',
    bereichsleitung: 'Leitung eines Bereichs',
    mitglied: 'MakerSpace Mitglied',
  };
  return descriptions[userStore.roleId || ''] || '';
}

function handleLogout() {
  $q.dialog({
    title: 'Abmelden',
    message: 'Möchten Sie sich wirklich abmelden?',
    cancel: {
      flat: true,
      label: 'Abbrechen',
    },
    ok: {
      flat: true,
      label: 'Abmelden',
      color: 'negative',
    },
    persistent: true,
  }).onOk(() => {
    userStore.logout();
    router.push('/');
  });
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

.dashboard-section {
  margin-bottom: 32px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.action-card {
  border-radius: 16px;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .q-icon {
    display: block;
    margin: 0 auto;
  }

  .q-card__section {
    text-align: center;
    flex-grow: 1;
  }

  .q-card__actions {
    justify-content: center;
    padding: 12px;
  }

  &__button {
    min-height: 44px;
    min-width: 44px;
    padding: 8px 24px;
  }
}

.body--dark {
  .action-card:hover {
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
  }
}
</style>
