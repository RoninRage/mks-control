<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Ausstattung verwalten</h1>
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
    <div v-if="!loading && equipment.length === 0" class="ms-section">
      <q-card flat bordered class="text-center q-pa-lg">
        <q-icon name="build" size="64px" color="grey-5" class="q-mb-md" />
        <div class="text-h6 q-mb-sm">Keine Ausstattung vorhanden</div>
        <p class="text-body2 text-grey-7">
          Fügen Sie ein neues Gerät oder Ausstattung hinzu, um zu beginnen.
        </p>
        <q-btn
          unelevated
          color="primary"
          label="Ausstattung hinzufügen"
          icon="add"
          @click="createEquipment"
          size="lg"
          min-height="44px"
          class="q-mt-md"
        />
      </q-card>
    </div>

    <!-- Equipment List -->
    <div v-if="!loading && equipment.length > 0" class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h6">{{ equipment.length }} Geräte</div>
        <q-btn
          unelevated
          color="primary"
          label="Ausstattung hinzufügen"
          icon="add"
          @click="createEquipment"
          size="md"
          min-height="44px"
        />
      </div>

      <q-table
        flat
        bordered
        :rows="equipment"
        :columns="columns"
        row-key="id"
        class="equipment-table"
      >
        <template #body-cell-name="props">
          <q-td :props="props">
            <span class="text-weight-medium">{{ props.row.name }}</span>
          </q-td>
        </template>

        <template #body-cell-category="props">
          <q-td :props="props">
            <q-badge color="primary" :label="props.row.category" />
          </q-td>
        </template>

        <template #body-cell-area="props">
          <q-td :props="props">
            <span class="text-body2">{{ props.row.area || '—' }}</span>
          </q-td>
        </template>

        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="props.row.isAvailable ? 'positive' : 'grey'"
              :label="props.row.isAvailable ? 'Verfügbar' : 'Nicht verfügbar'"
            />
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props" class="action-cell">
            <q-btn
              flat
              round
              icon="edit"
              color="primary"
              size="md"
              @click="editEquipment(props.row)"
              class="touch-button"
              aria-label="Edit equipment"
            />
            <q-btn
              flat
              round
              icon="delete"
              color="negative"
              size="md"
              @click="deleteEquipment(props.row.id)"
              class="touch-button"
              aria-label="Delete equipment"
            />
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';

defineOptions({
  name: 'EquipmentPage',
});

const router = useRouter();
const $q = useQuasar();

const loading = ref(false);
const error = ref<string | null>(null);

interface Equipment {
  id: string;
  name: string;
  category: string;
  area: string;
  isAvailable: boolean;
}

const equipment = ref<Equipment[]>([
  {
    id: '1',
    name: 'Lötstation',
    category: 'Elektronik',
    area: 'Elektronik',
    isAvailable: true,
  },
  {
    id: '2',
    name: '3D-Drucker Prusa i3',
    category: '3D Druck',
    area: '3D Druck',
    isAvailable: true,
  },
  {
    id: '3',
    name: 'CNC-Fräsmaschine',
    category: 'CNC',
    area: 'Werkstatt',
    isAvailable: false,
  },
]);

const columns = [
  {
    name: 'name',
    label: 'Name',
    field: 'name',
    align: 'left',
  },
  {
    name: 'category',
    label: 'Kategorie',
    field: 'category',
    align: 'left',
  },
  {
    name: 'area',
    label: 'Bereich',
    field: 'area',
    align: 'left',
  },
  {
    name: 'status',
    label: 'Status',
    field: 'isAvailable',
    align: 'left',
  },
  {
    name: 'actions',
    label: 'Aktionen',
    field: 'id',
    align: 'center',
  },
];

function goBack() {
  router.back();
}

function createEquipment() {
  $q.notify({
    type: 'info',
    message: 'Ausstattung hinzufügen - Funktion noch nicht implementiert',
    position: 'top',
  });
}

function editEquipment(item: Equipment) {
  $q.notify({
    type: 'info',
    message: `"${item.name}" bearbeiten - Funktion noch nicht implementiert`,
    position: 'top',
  });
}

function deleteEquipment(id: string) {
  $q.dialog({
    title: 'Ausstattung löschen',
    message: 'Möchten Sie diese Ausstattung wirklich löschen?',
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
  }).onOk(() => {
    $q.notify({
      type: 'info',
      message: 'Ausstattung löschen - Funktion noch nicht implementiert',
      position: 'top',
    });
  });
}
</script>

<style scoped lang="scss">
.equipment-table {
  border-radius: 16px;

  .action-cell {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .touch-button {
    min-height: 44px;
    min-width: 44px;
  }
}

body.body--dark {
  .equipment-table {
    background-color: $dark-page;
  }
}
</style>
