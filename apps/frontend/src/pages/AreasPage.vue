<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Bereiche verwalten</h1>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          @click="goBack"
          size="lg"
          padding="md"
          min-width="48px"
          min-height="48px"
          aria-label="Go back"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="ms-section">
      <q-linear-progress indeterminate color="primary" />
    </div>

    <!-- Error State -->
    <div v-if="error" class="ms-section">
      <q-banner class="bg-negative text-white">
        <template #avatar>
          <q-icon name="error" />
        </template>
        {{ error }}
      </q-banner>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && areas.length === 0" class="ms-section">
      <q-card flat bordered class="text-center q-pa-lg">
        <q-icon name="category" size="64px" color="grey-5" class="q-mb-md" />
        <div class="text-h6 q-mb-sm">Keine Bereiche vorhanden</div>
        <p class="text-body2 text-grey-7">Erstellen Sie einen neuen Bereich, um zu beginnen.</p>
        <q-btn
          unelevated
          color="primary"
          label="Bereich erstellen"
          icon="add"
          @click="createArea"
          size="lg"
          min-height="44px"
          class="q-mt-md"
        />
      </q-card>
    </div>

    <!-- Areas Grid -->
    <div v-if="!loading && areas.length > 0" class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h6">{{ areas.length }} Bereiche</div>
        <q-btn
          unelevated
          color="primary"
          label="Bereich erstellen"
          icon="add"
          @click="createArea"
          size="md"
          min-height="44px"
        />
      </div>

      <div class="areas-grid">
        <q-card v-for="area in areas" :key="area.id" flat bordered class="area-card">
          <q-card-section>
            <div class="text-h6 q-mb-sm">{{ area.name }}</div>
            <p v-if="area.description" class="text-body2 text-grey-7 q-mb-md">
              {{ area.description }}
            </p>
          </q-card-section>

          <q-card-actions>
            <q-btn
              flat
              color="primary"
              label="Bearbeiten"
              icon="edit"
              @click="editArea(area)"
              class="touch-button"
              min-height="44px"
            />
            <q-btn
              flat
              color="negative"
              label="Löschen"
              icon="delete"
              @click="deleteArea(area.id)"
              class="touch-button"
              min-height="44px"
            />
          </q-card-actions>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { areaService, type Area } from 'src/services/areaService';

defineOptions({
  name: 'AreasPage',
});

const router = useRouter();
const $q = useQuasar();

const loading = ref(false);
const error = ref<string | null>(null);
const areas = ref<Area[]>([]);

onMounted(async () => {
  await fetchAreas();
});

async function fetchAreas() {
  loading.value = true;
  error.value = null;
  try {
    areas.value = await areaService.getAreas();
  } catch (err) {
    error.value = 'Fehler beim Laden der Bereiche';
    console.error('Error fetching areas:', err);
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.back();
}

function createArea() {
  router.push('/areas/create');
}

function editArea(area: Area) {
  router.push(`/areas/${area.id}/edit`);
}

function deleteArea(id: string) {
  $q.dialog({
    title: 'Bereich löschen',
    message: 'Möchten Sie diesen Bereich wirklich löschen?',
    cancel: {
      flat: true,
      label: 'Abbrechen',
    },
    ok: {
      flat: true,
      label: 'Löschen',
      color: 'negative',
    },
    persistent: true,
  }).onOk(async () => {
    try {
      await areaService.deleteArea(id);
      $q.notify({
        type: 'positive',
        message: 'Bereich gelöscht',
        position: 'top',
      });
      await fetchAreas();
    } catch (err) {
      $q.notify({
        type: 'negative',
        message: 'Fehler beim Löschen des Bereichs',
        position: 'top',
      });
      console.error('Error deleting area:', err);
    }
  });
}
</script>

<style scoped lang="scss">
.areas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.area-card {
  border-radius: 16px;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .q-card__section {
    flex-grow: 1;
  }

  .q-card__actions {
    gap: 8px;
    padding: 12px;
  }
}

body.body--dark {
  .area-card:hover {
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
  }
}

.touch-button {
  min-height: 44px;
  flex: 1;
}
</style>
