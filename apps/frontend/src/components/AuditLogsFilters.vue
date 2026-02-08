<template>
  <div class="audit-logs-filters q-mb-lg">
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <q-input
          :model-value="formatDateForDisplay(filters.startDate)"
          label="Startdatum"
          outlined
          dense
          clearable
          readonly
          @clear="emitClearStartDate"
        >
          <template #append>
            <q-icon name="event" class="cursor-pointer">
              <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                <q-date
                  :model-value="filters.startDate"
                  mask="YYYY-MM-DD"
                  @update:model-value="onStartDateChange"
                >
                  <div class="row items-center justify-end">
                    <q-btn v-close-popup label="Schliessen" color="primary" flat />
                  </div>
                </q-date>
              </q-popup-proxy>
            </q-icon>
          </template>
        </q-input>
        <q-input
          :model-value="formatTimeForDisplay(startTime)"
          label="Startzeit"
          outlined
          dense
          readonly
          class="q-mt-sm"
        >
          <template #append>
            <q-icon name="schedule" class="cursor-pointer">
              <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                <q-time
                  :model-value="startTime"
                  mask="HH:mm"
                  format24h
                  @update:model-value="onStartTimeChange"
                >
                  <div class="row items-center justify-end">
                    <q-btn v-close-popup label="Schliessen" color="primary" flat />
                  </div>
                </q-time>
              </q-popup-proxy>
            </q-icon>
          </template>
        </q-input>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-input
          :model-value="formatDateForDisplay(filters.endDate)"
          label="Enddatum"
          outlined
          dense
          clearable
          readonly
          @clear="emitClearEndDate"
        >
          <template #append>
            <q-icon name="event" class="cursor-pointer">
              <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                <q-date
                  :model-value="filters.endDate"
                  mask="YYYY-MM-DD"
                  @update:model-value="onEndDateChange"
                >
                  <div class="row items-center justify-end">
                    <q-btn v-close-popup label="Schliessen" color="primary" flat />
                  </div>
                </q-date>
              </q-popup-proxy>
            </q-icon>
          </template>
        </q-input>
        <q-input
          :model-value="formatTimeForDisplay(endTime)"
          label="Endzeit"
          outlined
          dense
          readonly
          class="q-mt-sm"
        >
          <template #append>
            <q-icon name="schedule" class="cursor-pointer">
              <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                <q-time
                  :model-value="endTime"
                  mask="HH:mm"
                  format24h
                  @update:model-value="onEndTimeChange"
                >
                  <div class="row items-center justify-end">
                    <q-btn v-close-popup label="Schliessen" color="primary" flat />
                  </div>
                </q-time>
              </q-popup-proxy>
            </q-icon>
          </template>
        </q-input>
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-select
          :model-value="filters.action"
          :options="availableActions"
          label="Aktionstyp"
          outlined
          dense
          clearable
          emit-value
          map-options
          @update:model-value="onActionChange"
        />
      </div>

      <div class="col-12 col-sm-6 col-md-3">
        <q-select
          :model-value="filters.source"
          :options="availableSources"
          label="Maschine"
          outlined
          dense
          clearable
          emit-value
          map-options
          @update:model-value="onSourceChange"
        />
      </div>
    </div>

    <div class="row q-col-gutter-md items-end">
      <div class="col-12 col-sm-9">
        <q-input
          :model-value="searchQuery"
          label="Suche (Benutzer, Aktion, Entitaet, Ausruestung)"
          type="text"
          outlined
          dense
          clearable
          @update:model-value="onSearchChange"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
      <div class="col-12 col-sm-3">
        <q-btn
          flat
          icon="refresh"
          label="Filter zuruecksetzen"
          color="primary"
          @click="emitReset"
          class="full-width"
          padding="sm md"
          min-height="44px"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AuditLogFilters } from 'src/services/auditService';

defineOptions({
  name: 'AuditLogsFilters',
});

const props = defineProps<{
  filters: AuditLogFilters;
  startTime: string;
  endTime: string;
  searchQuery: string;
  availableActions: string[];
  availableSources: string[];
}>();

const emit = defineEmits<{
  (event: 'update:filters', value: AuditLogFilters): void;
  (event: 'update:startTime', value: string): void;
  (event: 'update:endTime', value: string): void;
  (event: 'update:searchQuery', value: string): void;
  (event: 'apply'): void;
  (event: 'reset'): void;
  (event: 'clear-start-date'): void;
  (event: 'clear-end-date'): void;
}>();

const dateFormatter = computed(() => {
  try {
    return new Intl.DateTimeFormat(undefined);
  } catch (e) {
    console.warn('Date format detection failed, using en-GB', e);
    return new Intl.DateTimeFormat('en-GB');
  }
});

const timeFormatter = computed(() => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    console.warn('Time format detection failed, using en-GB', e);
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
});

const updateFilters = (patch: Partial<AuditLogFilters>): void => {
  emit('update:filters', { ...props.filters, ...patch });
};

const formatDateForDisplay = (isoDate?: string): string => {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter.value.format(date);
};

const formatTimeForDisplay = (timeValue?: string): string => {
  if (!timeValue) return '';
  const date = new Date(`2000-01-01T${timeValue}:00`);
  if (Number.isNaN(date.getTime())) return '';
  return timeFormatter.value.format(date);
};

const emitClearStartDate = (): void => {
  emit('clear-start-date');
};

const emitClearEndDate = (): void => {
  emit('clear-end-date');
};

const onStartDateChange = (value: string | null): void => {
  updateFilters({ startDate: value || undefined });
  emit('apply');
};

const onEndDateChange = (value: string | null): void => {
  updateFilters({ endDate: value || undefined });
  emit('apply');
};

const onStartTimeChange = (value: string | null): void => {
  emit('update:startTime', value || '00:00');
  emit('apply');
};

const onEndTimeChange = (value: string | null): void => {
  emit('update:endTime', value || '23:59');
  emit('apply');
};

const onActionChange = (value: string | null): void => {
  updateFilters({ action: value || undefined });
  emit('apply');
};

const onSourceChange = (value: string | null): void => {
  updateFilters({ source: value || undefined });
  emit('apply');
};

const onSearchChange = (value: string | null): void => {
  emit('update:searchQuery', value || '');
  emit('apply');
};

const emitReset = (): void => {
  emit('reset');
};
</script>

<style scoped lang="scss">
.audit-logs-filters {
  background: var(--ms-background);
  border: 1px solid var(--ms-border);
  border-radius: 8px;
  padding: 16px;
}
</style>
