<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Bereich bearbeiten</h1>
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

    <!-- Area Details -->
    <div v-if="area && !loading" class="ms-section">
      <div class="row q-col-gutter-lg">
        <!-- Name -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="area.name"
            label="Name"
            outlined
            :disable="loading || saving"
            dense
            class="full-width"
          />
        </div>

        <!-- ID (for reference) -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="area.id"
            label="Bereichs-ID"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Description -->
        <div class="col-12">
          <q-input
            v-model="area.description"
            label="Beschreibung"
            type="textarea"
            autogrow
            outlined
            :disable="loading || saving"
            dense
            class="full-width"
          />
        </div>
      </div>

      <!-- Footer with action buttons -->
      <div class="row q-mt-lg q-gutter-md">
        <q-btn
          :loading="saving"
          label="Speichern"
          color="primary"
          @click="saveArea"
          class="touch-target"
        />
        <q-btn flat label="Zurück" color="primary" @click="goBack" class="touch-target" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { areaService, type Area } from 'src/services/areaService';

defineOptions({
  name: 'EditAreaPage',
});

const router = useRouter();
const route = useRoute();
const $q = useQuasar();

const loading = ref(false);
const error = ref<string | null>(null);
const area = ref<Area | null>(null);
const saving = ref(false);

const areaId = computed(() => route.params.id as string);

async function loadArea() {
  loading.value = true;
  error.value = null;
  try {
    area.value = await areaService.getArea(areaId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Fehler beim Laden des Bereichs';
    console.error('Error loading area:', err);
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.back();
}

async function saveArea() {
  if (!area.value) return;
  saving.value = true;
  try {
    const updated = await areaService.updateArea(areaId.value, {
      id: area.value.id,
      name: area.value.name,
      description: area.value.description,
    });
    area.value = { ...area.value, ...updated };
    $q.notify({
      type: 'positive',
      message: 'Bereich gespeichert',
      position: 'top',
    });
  } catch (err) {
    console.error('Error saving area:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Speichern des Bereichs',
      position: 'top',
    });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadArea();
});
</script>

<style scoped lang="scss">
.touch-target {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 24px;
}
</style>
