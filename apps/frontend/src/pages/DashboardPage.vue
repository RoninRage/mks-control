<template>
  <q-page class="ms-container">
    <!-- Dashboard Content -->
    <div class="ms-section">
      <h1 class="text-h4 q-mb-lg">Dashboard</h1>

      <div class="action-grid">
        <q-card v-if="userStore.can('manage:areas')" flat bordered class="action-card">
          <q-card-section>
            <q-icon name="category" size="48px" color="primary" />
            <div class="text-h6 q-mt-md">Bereiche verwalten</div>
            <div class="text-body2 text-grey-7">Bereiche definieren und verwalten</div>
          </q-card-section>
          <q-card-actions>
            <q-btn flat color="primary" label="Öffnen" class="action-card__button" to="/areas" />
          </q-card-actions>
        </q-card>

        <q-card v-if="userStore.can('manage:equipment')" flat bordered class="action-card">
          <q-card-section>
            <q-icon name="build" size="48px" color="primary" />
            <div class="text-h6 q-mt-md">Ausstattung verwalten</div>
            <div class="text-body2 text-grey-7">Geräte und Ausstattung verwalten</div>
          </q-card-section>
          <q-card-actions>
            <q-btn
              flat
              color="primary"
              label="Öffnen"
              class="action-card__button"
              to="/equipment"
            />
          </q-card-actions>
        </q-card>

        <q-card v-if="canManageMembers" flat bordered class="action-card">
          <q-card-section>
            <q-icon name="people" size="48px" color="primary" />
            <div class="text-h6 q-mt-md">Mitglieder verwalten</div>
            <div class="text-body2 text-grey-7">Alle Mitglieder verwalten</div>
          </q-card-section>
          <q-card-actions>
            <q-btn flat color="primary" label="Öffnen" class="action-card__button" to="/members" />
          </q-card-actions>
        </q-card>

        <q-card v-if="canShowPermissions" flat bordered class="action-card">
          <q-card-section>
            <q-icon name="admin_panel_settings" size="48px" color="primary" />
            <div class="text-h6 q-mt-md">Ausstattungsberechtigungen</div>
            <div class="text-body2 text-grey-7">{{ permissionsSubtitle }}</div>
          </q-card-section>
          <q-card-actions>
            <q-btn
              flat
              color="primary"
              label="Öffnen"
              class="action-card__button"
              to="/ausstattung"
            />
          </q-card-actions>
        </q-card>

        <q-card v-if="userStore.can('view:profile')" flat bordered class="action-card">
          <q-card-section>
            <q-icon name="account_circle" size="48px" color="primary" />
            <div class="text-h6 q-mt-md">Mein Profil</div>
            <div class="text-body2 text-grey-7">Persönliche Informationen ansehen</div>
          </q-card-section>
          <q-card-actions>
            <q-btn flat color="primary" label="Öffnen" class="action-card__button" to="/profile" />
          </q-card-actions>
        </q-card>

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
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useUserStore } from 'stores/user-store';

defineOptions({
  name: 'DashboardPage',
});

const router = useRouter();
const $q = useQuasar();
const userStore = useUserStore();

const canManageMembers = computed((): boolean => {
  return userStore.can('manage:equipment') || userStore.can('manage:areas');
});

const canShowPermissions = computed((): boolean => {
  return userStore.can('manage:area-permissions') || userStore.can('view:profile');
});

const permissionsSubtitle = computed((): string => {
  if (userStore.can('manage:area-permissions')) {
    return 'Berechtigungen in Ihrem Bereich verwalten';
  }
  return 'Ihre Zugriffsberechtigungen ansehen';
});

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
