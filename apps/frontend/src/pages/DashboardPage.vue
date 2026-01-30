<template>
  <q-page class="ms-container">
    <!-- User Header Section -->
    <user-header />

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

          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="people" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Mitglieder verwalten</div>
              <div class="text-body2 text-grey-7">Alle Mitglieder verwalten</div>
            </q-card-section>
            <q-card-actions>
              <q-btn
                flat
                color="primary"
                label="Öffnen"
                class="action-card__button"
                to="/members"
              />
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

          <q-card flat bordered class="action-card">
            <q-card-section>
              <q-icon name="people" size="48px" color="primary" />
              <div class="text-h6 q-mt-md">Mitglieder verwalten</div>
              <div class="text-body2 text-grey-7">Alle Mitglieder verwalten</div>
            </q-card-section>
            <q-card-actions>
              <q-btn
                flat
                color="primary"
                label="Öffnen"
                class="action-card__button"
                to="/members"
              />
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
import UserHeader from 'components/UserHeader.vue';

defineOptions({
  name: 'DashboardPage',
});

const router = useRouter();
const $q = useQuasar();
const userStore = useUserStore();

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
