<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <div>
          <h1 class="text-h3 q-mb-none">Audit-Protokolle</h1>
          <p class="text-body2 text-grey-7">Systemaktivitaeten und Benutzeraktionen anzeigen</p>
        </div>
        <div class="row items-center q-gutter-sm">
          <q-btn
            v-if="userStore.isAdmin"
            outline
            icon="delete_sweep"
            label="Audit-Protokolle loeschen"
            color="negative"
            @click="confirmClearAuditLogs"
            padding="md"
            min-height="44px"
            aria-label="Audit-Protokolle loeschen"
          />
          <q-btn
            flat
            icon="arrow_back"
            color="primary"
            @click="goBack"
            size="lg"
            padding="md"
            min-width="48px"
            min-height="48px"
            aria-label="Zurueck"
          />
        </div>
      </div>
    </div>

    <!-- Filters Section -->
    <div class="ms-section">
      <div class="audit-logs-page__filters q-mb-lg">
        <div class="row q-col-gutter-md q-mb-md">
          <!-- Date Range -->
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              :model-value="formatDateForDisplay(filters.startDate)"
              label="Startdatum"
              outlined
              dense
              clearable
              readonly
              @clear="clearStartDate"
            >
              <template #append>
                <q-icon name="event" class="cursor-pointer">
                  <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                    <q-date
                      v-model="filters.startDate"
                      mask="YYYY-MM-DD"
                      @update:model-value="applyFilters"
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
                      v-model="startTime"
                      mask="HH:mm"
                      format24h
                      @update:model-value="applyFilters"
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
              @clear="clearEndDate"
            >
              <template #append>
                <q-icon name="event" class="cursor-pointer">
                  <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                    <q-date
                      v-model="filters.endDate"
                      mask="YYYY-MM-DD"
                      @update:model-value="applyFilters"
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
                      v-model="endTime"
                      mask="HH:mm"
                      format24h
                      @update:model-value="applyFilters"
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

          <!-- Action Filter -->
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              v-model="filters.action"
              :options="availableActions"
              label="Aktionstyp"
              outlined
              dense
              clearable
              emit-value
              map-options
              @update:model-value="applyFilters"
            />
          </div>

          <!-- Source (Machine) Filter -->
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              v-model="filters.source"
              :options="availableSources"
              label="Maschine"
              outlined
              dense
              clearable
              emit-value
              map-options
              @update:model-value="applyFilters"
            />
          </div>
        </div>

        <!-- Search and Reset Button -->
        <div class="row q-col-gutter-md items-end">
          <div class="col-12 col-sm-9">
            <q-input
              v-model="searchQuery"
              label="Suche (Benutzer, Aktion, Entitaet, Ausruestung)"
              type="text"
              outlined
              dense
              clearable
              @update:model-value="applyFilters"
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
              @click="resetFilters"
              class="full-width"
              padding="sm md"
              min-height="44px"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center q-my-lg">
      <q-spinner color="primary" size="50px" />
      <p class="text-body2 q-mt-md">Audit-Protokolle werden geladen...</p>
    </div>

    <!-- Error State -->
    <q-banner v-if="error" class="bg-negative text-white q-mb-lg">
      <template #avatar>
        <q-icon name="error" />
      </template>
      {{ error }}
      <template #action>
        <q-btn flat label="Erneut versuchen" @click="loadAuditLogs" />
      </template>
    </q-banner>

    <!-- Audit Logs List -->
    <div v-if="!loading && !error" class="audit-logs-page__list">
      <div v-if="logs.length === 0" class="text-center q-py-lg">
        <q-icon name="event_note" size="48px" class="text-grey-5" />
        <p class="text-body2 text-grey-7 q-mt-md">
          Keine Audit-Protokolle gefunden, die den Filtern entsprechen
        </p>
      </div>

      <!-- Audit Log Cards -->
      <div v-for="log in logs" :key="log.id" class="audit-log-card q-mb-md">
        <q-card flat bordered class="audit-log-card__content">
          <q-card-section class="audit-log-card__header" @click="toggleExpanded(log.id)">
            <div class="row items-center justify-between no-wrap">
              <div class="col">
                <div class="text-subtitle1 text-weight-bold">{{ formatAction(log.action) }}</div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  {{ formatTimestamp(log.timestamp) }}
                </div>
              </div>

              <div class="col-auto text-right">
                <div class="text-caption text-grey-7">
                  <span v-if="log.source" class="text-weight-medium">{{ log.source }}</span>
                </div>
                <q-icon
                  name="expand_more"
                  size="24px"
                  :class="{ 'rotate-180': expandedLogs.includes(log.id) }"
                  class="transition-all"
                />
              </div>
            </div>

            <!-- Quick Info -->
            <div class="row q-mt-md items-center q-col-gutter-sm no-wrap">
              <div v-if="log.actorId" class="col-auto">
                <q-chip
                  size="sm"
                  :label="`Benutzer: ${getActorName(log.actorId)}`"
                  class="bg-blue-1 text-blue-9"
                />
              </div>
              <div v-if="log.actorRole" class="col-auto">
                <q-chip
                  size="sm"
                  :label="`Rolle: ${log.actorRole}`"
                  class="bg-orange-1 text-orange-9"
                />
              </div>
            </div>
          </q-card-section>

          <AuditLogDetails :log="log" :is-expanded="expandedLogs.includes(log.id)" />
        </q-card>
      </div>

      <!-- Pagination Info -->
      <div v-if="logs.length > 0" class="text-center q-mt-lg">
        <p class="text-caption text-grey-7">
          Zeige {{ logs.length }} von {{ metadata.total }} Audit-Protokollen
        </p>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { auditService, type AuditLog, type AuditLogFilters } from 'src/services/auditService';
import type { Member } from '@mks-control/shared-types';
import { memberService } from 'src/services/memberService';
import { useUserStore } from 'stores/user-store';
import { useQuasar } from 'quasar';
import AuditLogDetails from 'components/AuditLogDetails.vue';

defineOptions({
  name: 'AuditLogsPage',
});

const router = useRouter();
const userStore = useUserStore();
const $q = useQuasar();

const goBack = (): void => {
  router.push('/dashboard').catch((err) => {
    console.error('Navigation to dashboard failed:', err);
  });
};

// State
const logs = ref<AuditLog[]>([]);
const members = ref<Member[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const expandedLogs = ref<string[]>([]);
const searchQuery = ref('');
const startTime = ref('00:00');
const endTime = ref('23:59');

const filters = ref<AuditLogFilters>({});

const metadata = ref({
  total: 0,
  sources: [] as string[],
  actions: [] as string[],
});

const availableActions = ref<string[]>([]);
const availableSources = ref<string[]>([]);

// Computed
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

const buildStartDateTime = (): string | undefined => {
  if (!filters.value.startDate) return undefined;
  const time = startTime.value || '00:00';
  return `${filters.value.startDate}T${time}:00`;
};

const buildEndDateTime = (): string | undefined => {
  if (!filters.value.endDate) return undefined;
  const time = endTime.value || '23:59';
  return `${filters.value.endDate}T${time}:59`;
};

// Methods
const formatAction = (action: string): string => {
  return action
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getActorName = (actorId?: string): string => {
  if (!actorId) return 'N/A';
  const member = members.value.find((m) => m.id === actorId);
  if (member) {
    return `${member.firstName} ${member.lastName}`.trim();
  }
  return actorId;
};

const formatTimestamp = (timestamp: string): string => {
  return new Date(timestamp).toLocaleString();
};

const toggleExpanded = (logId: string): void => {
  const index = expandedLogs.value.indexOf(logId);
  if (index === -1) {
    expandedLogs.value.push(logId);
  } else {
    expandedLogs.value.splice(index, 1);
  }
};

const loadAuditLogs = async (): Promise<void> => {
  loading.value = true;
  error.value = null;

  try {
    const filterParams: AuditLogFilters = {};

    // Only include filters that have values
    const startDateTime = buildStartDateTime();
    const endDateTime = buildEndDateTime();
    if (startDateTime) filterParams.startDate = startDateTime;
    if (endDateTime) filterParams.endDate = endDateTime;
    if (filters.value.action) filterParams.action = filters.value.action;
    if (filters.value.source) filterParams.source = filters.value.source;
    if (searchQuery.value) filterParams.search = searchQuery.value;

    const response = await auditService.getAuditLogs(filterParams);

    logs.value = response.logs;
    metadata.value = response.metadata;
    availableActions.value = response.metadata.actions;
    availableSources.value = response.metadata.sources;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch audit logs';
    logs.value = [];
  } finally {
    loading.value = false;
  }
};

const clearAuditLogs = async (): Promise<void> => {
  loading.value = true;
  error.value = null;

  try {
    await auditService.clearAuditLogs();
    await loadAuditLogs();
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : 'Audit-Protokolle konnten nicht geloescht werden';
  } finally {
    loading.value = false;
  }
};

const confirmClearAuditLogs = (): void => {
  $q.dialog({
    title: 'Audit-Protokolle loeschen',
    message:
      'Moechten Sie wirklich alle Audit-Protokolle loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.',
    cancel: true,
    persistent: true,
    ok: {
      label: 'Loeschen',
      color: 'negative',
    },
  }).onOk(() => {
    void clearAuditLogs();
  });
};

const applyFilters = (): void => {
  loadAuditLogs();
};

const clearStartDate = (): void => {
  delete filters.value.startDate;
  applyFilters();
};

const clearEndDate = (): void => {
  delete filters.value.endDate;
  applyFilters();
};

const resetFilters = (): void => {
  filters.value = {};
  searchQuery.value = '';
  startTime.value = '00:00';
  endTime.value = '23:59';
  loadAuditLogs();
};

// Lifecycle
onMounted(async () => {
  try {
    members.value = await memberService.getMembers();
  } catch (err) {
    console.error('[AuditLogsPage] Failed to load members:', err);
  }
  await loadAuditLogs();
});
</script>

<style scoped lang="scss">
.audit-logs-page {
  &__header {
    border-bottom: 1px solid var(--ms-border);
    padding-bottom: 16px;
  }

  &__filters {
    background: var(--ms-background);
    border: 1px solid var(--ms-border);
    border-radius: 8px;
    padding: 16px;
  }

  &__list {
    margin-top: 24px;
  }
}

.audit-log-card {
  &__content {
    cursor: pointer;
    transition: all 0.3s ease;
    border-left: 4px solid var(--q-primary);

    &:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }

  &__header {
    user-select: none;
  }

  &__details {
    background: var(--ms-background);
  }
}

.rotate-180 {
  transform: rotate(180deg);
}

.transition-all {
  transition: transform 0.3s ease;
}
</style>
