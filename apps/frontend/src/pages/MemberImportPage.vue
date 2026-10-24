<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Mitglieder importieren</h1>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          @click="goBack"
          size="lg"
          padding="md"
          min-width="48px"
          min-height="48px"
          aria-label="Zurück"
        />
      </div>
      <p class="text-body1 text-grey-7">
        CSV-Datei aus dem Vereinsplaner hochladen. Bestehende Mitglieder werden anhand der
        Mitgliedsnummer aktualisiert, neue werden angelegt.
      </p>
    </div>

    <!-- Upload -->
    <div class="ms-section">
      <q-card flat bordered class="q-pa-md">
        <q-file
          v-model="selectedFile"
          accept=".csv"
          label="CSV-Datei auswählen"
          outlined
          clearable
          :disable="loading"
          color="primary"
          class="q-mb-md"
        >
          <template #prepend>
            <q-icon name="attach_file" />
          </template>
        </q-file>

        <q-btn
          unelevated
          color="primary"
          icon="upload_file"
          label="Import starten"
          :loading="loading"
          :disable="!selectedFile || loading"
          @click="startImport"
          padding="sm lg"
          min-height="48px"
        />
      </q-card>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="ms-section">
      <q-linear-progress indeterminate color="primary" />
    </div>

    <!-- Error -->
    <div v-if="error" class="ms-section">
      <q-banner class="bg-negative text-white">
        <template #avatar>
          <q-icon name="error" />
        </template>
        {{ error }}
      </q-banner>
    </div>

    <!-- Result Summary -->
    <div v-if="result" class="ms-section">
      <div class="row q-col-gutter-md">
        <div v-for="card in summaryCards" :key="card.label" class="col-6 col-sm-3">
          <q-card flat bordered class="text-center q-pa-md">
            <div class="text-h4 text-weight-bold" :class="card.colorClass">{{ card.value }}</div>
            <div class="text-body2 text-grey-7 q-mt-xs">{{ card.label }}</div>
          </q-card>
        </div>
      </div>
    </div>

    <!-- Error Table -->
    <div v-if="result && result.errors.length > 0" class="ms-section">
      <h2 class="text-h5 q-mb-md">Fehlerhafte Zeilen</h2>
      <q-table
        flat
        bordered
        :rows="result.errors"
        :columns="errorColumns"
        row-key="row"
        class="errors-table"
        :rows-per-page-options="[10, 25, 50, 0]"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { MemberImportResult } from '@mks-control/shared-types';
import { memberService } from 'src/services/memberService';

defineOptions({
  name: 'MemberImportPage',
});

const router = useRouter();
const $q = useQuasar();

const selectedFile = ref<File | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<MemberImportResult | null>(null);

const summaryCards = computed(() => {
  const summary = result.value?.summary;
  if (!summary) return [];
  return [
    { label: 'Gesamt', value: summary.total, colorClass: 'text-primary' },
    { label: 'Neu angelegt', value: summary.inserted, colorClass: 'text-positive' },
    { label: 'Aktualisiert', value: summary.updated, colorClass: 'text-info' },
    { label: 'Übersprungen', value: summary.skipped, colorClass: 'text-warning' },
  ];
});

const errorColumns = [
  { name: 'row', label: 'Zeile', field: 'row', align: 'left' as const, sortable: true },
  {
    name: 'memberId',
    label: 'Mitgliedsnummer',
    field: 'memberId',
    align: 'left' as const,
    sortable: true,
  },
  { name: 'reason', label: 'Grund', field: 'reason', align: 'left' as const },
];

async function startImport() {
  if (!selectedFile.value) return;
  loading.value = true;
  error.value = null;
  result.value = null;
  try {
    result.value = await memberService.importMembers(selectedFile.value);
    $q.notify({
      type: 'positive',
      message: 'Import abgeschlossen',
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Import fehlgeschlagen';
    $q.notify({
      type: 'negative',
      message: error.value,
    });
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.replace('/members');
}
</script>

<style scoped lang="scss">
.errors-table {
  :deep(.q-table__card) {
    border-radius: 16px;
  }

  :deep(.q-table thead tr),
  :deep(.q-table tbody td) {
    height: 56px;
  }
}

// Dark mode support
:deep(.body--dark) {
  .errors-table {
    background: var(--ms-surface);

    :deep(.q-table__card) {
      background: var(--ms-surface);
      border-color: var(--ms-border);
    }

    :deep(thead) {
      background: var(--ms-surface-2);
      color: #ffffff;
    }

    :deep(tbody tr) {
      background: var(--ms-surface);
      border-color: var(--ms-border);
    }

    :deep(.q-table__card) {
      color: #ffffff;
    }
  }
}
</style>
