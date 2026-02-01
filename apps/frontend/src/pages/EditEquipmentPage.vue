<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">{{ pageTitle }}</h1>
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

    <!-- Equipment Details -->
    <div v-if="equipment && !loading" class="ms-section">
      <div class="row q-col-gutter-lg">
        <!-- Name -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="equipment.name"
            label="Name"
            outlined
            :disable="loading || saving"
            :error="hasNameError"
            :error-message="nameError"
            @blur="markNameTouched"
            dense
            class="full-width"
          />
        </div>

        <!-- Area -->
        <div class="col-12 col-sm-6">
          <q-select
            v-model="equipment.areaId"
            :options="areaOptions"
            label="Bereich"
            outlined
            dense
            emit-value
            map-options
            clearable
            behavior="dialog"
            :disable="loading || saving"
            class="full-width"
          >
            <template #prepend>
              <q-icon name="category" />
            </template>
          </q-select>
        </div>

        <!-- Availability -->
        <div class="col-12 col-sm-6">
          <q-toggle
            v-model="equipment.isAvailable"
            label="Verfügbar"
            color="primary"
            :disable="loading || saving"
          />
        </div>

        <!-- Configuration -->
        <div class="col-12">
          <q-input
            v-model="equipment.configuration"
            label="Konfiguration (optional)"
            type="textarea"
            :rows="10"
            outlined
            dense
            :disable="loading || saving"
            :maxlength="4096"
            counter
            class="full-width"
          />
        </div>

        <!-- ID (for reference) -->
        <div v-if="!isCreate" class="col-12 col-sm-6">
          <q-input
            v-model="equipment.id"
            label="Ausstattungs-ID"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>
      </div>

      <!-- Footer with action buttons -->
      <div class="row q-mt-lg q-gutter-md">
        <q-btn
          :loading="saving"
          :label="saveLabel"
          color="primary"
          @click="saveEquipment"
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
import { equipmentService, type Equipment } from 'src/services/equipmentService';
import { areaService, type Area } from 'src/services/areaService';

defineOptions({
  name: 'EditEquipmentPage',
});

const router = useRouter();
const route = useRoute();
const $q = useQuasar();

const loading = ref(false);
const error = ref<string | null>(null);
const equipment = ref<Equipment | null>(null);
const saving = ref(false);
const areas = ref<Area[]>([]);
const equipmentList = ref<Equipment[]>([]);
const nameTouched = ref(false);

const equipmentId = computed(() => route.params.id as string | undefined);
const isCreate = computed(() => !equipmentId.value);
const pageTitle = computed(() =>
  isCreate.value ? 'Ausstattung hinzufügen' : 'Ausstattung bearbeiten'
);
const saveLabel = computed(() => (isCreate.value ? 'Erstellen' : 'Speichern'));
const areaOptions = computed(() =>
  areas.value.map((area) => ({ label: area.name, value: area.id }))
);

const normalizeName = (value: string): string => value.trim().toLowerCase();

const nameError = computed<string>(() => {
  if (!nameTouched.value) return '';
  const currentName = equipment.value?.name ?? '';
  const normalized = normalizeName(currentName);
  if (!normalized) return 'Name ist erforderlich';
  const duplicate = equipmentList.value.find(
    (item) => normalizeName(item.name) === normalized && item.id !== equipment.value?.id
  );
  return duplicate ? 'Name bereits vergeben' : '';
});

const hasNameError = computed<boolean>(() => nameError.value.length > 0);

async function loadEquipment() {
  if (isCreate.value) {
    equipment.value = {
      id: '',
      name: '',
      areaId: '',
      isAvailable: true,
      configuration: '',
    };
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    equipment.value = await equipmentService.getEquipmentById(equipmentId.value as string);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Fehler beim Laden der Ausstattung';
    console.error('Error loading equipment:', err);
  } finally {
    loading.value = false;
  }
}

async function loadAreas() {
  try {
    areas.value = await areaService.getAreas();
  } catch (err) {
    console.error('Error loading areas:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Laden der Bereiche',
      position: 'top',
    });
  }
}

async function loadEquipmentList(): Promise<void> {
  try {
    equipmentList.value = await equipmentService.getEquipment();
  } catch (err) {
    console.error('Error loading equipment list:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Laden der Ausstattungsliste',
      position: 'top',
    });
  }
}

function goBack() {
  router.back();
}

function markNameTouched(): void {
  nameTouched.value = true;
}

async function saveEquipment() {
  if (!equipment.value) return;
  nameTouched.value = true;

  if (hasNameError.value) {
    $q.notify({
      type: 'negative',
      message: nameError.value,
      position: 'top',
    });
    return;
  }

  saving.value = true;
  try {
    const trimmedName = equipment.value.name.trim();
    if (isCreate.value) {
      const created = await equipmentService.createEquipment({
        id: equipment.value.id,
        name: trimmedName,
        areaId: equipment.value.areaId,
        isAvailable: equipment.value.isAvailable,
        configuration: equipment.value.configuration,
      });
      equipment.value = { ...equipment.value, ...created };
      $q.notify({
        type: 'positive',
        message: 'Ausstattung erstellt',
        position: 'top',
      });
      await router.push('/equipment');
      return;
    }

    const updated = await equipmentService.updateEquipment(equipmentId.value as string, {
      id: equipment.value.id,
      name: trimmedName,
      areaId: equipment.value.areaId,
      isAvailable: equipment.value.isAvailable,
      configuration: equipment.value.configuration,
    });
    equipment.value = { ...equipment.value, ...updated };
    $q.notify({
      type: 'positive',
      message: 'Ausstattung gespeichert',
      position: 'top',
    });
  } catch (err) {
    console.error('Error saving equipment:', err);
    $q.notify({
      type: 'negative',
      message:
        err instanceof Error && err.message.includes('name already exists')
          ? 'Name bereits vergeben'
          : 'Fehler beim Speichern der Ausstattung',
      position: 'top',
    });
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadAreas(), loadEquipment(), loadEquipmentList()]);
});
</script>

<style scoped lang="scss">
.touch-target {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 24px;
}
</style>
