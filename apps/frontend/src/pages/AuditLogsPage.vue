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
      <AuditLogsFilters
        :filters="filters"
        :start-time="startTime"
        :end-time="endTime"
        :search-query="searchQuery"
        :available-actions="availableActions"
        :available-sources="availableSources"
        @update:filters="setFilters"
        @update:start-time="setStartTime"
        @update:end-time="setEndTime"
        @update:search-query="setSearchQuery"
        @apply="applyFilters"
        @reset="resetFilters"
        @clear-start-date="clearStartDate"
        @clear-end-date="clearEndDate"
      />
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
    <div v-if="!loading && !error">
      <AuditLogsList
        :logs="logs"
        :metadata="metadata"
        :expanded-logs="expandedLogs"
        :format-action="formatAction"
        :format-timestamp="formatTimestamp"
        :get-actor-name="getActorName"
        @toggle="toggleExpanded"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { auditService, type AuditLog, type AuditLogFilters } from 'src/services/auditService';
import type { Member } from '@mks-control/shared-types';
import { memberService } from 'src/services/memberService';
import { useUserStore } from 'stores/user-store';
import { useQuasar } from 'quasar';
import AuditLogsFilters from 'components/AuditLogsFilters.vue';
import AuditLogsList from 'components/AuditLogsList.vue';

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

const setFilters = (nextFilters: AuditLogFilters): void => {
  filters.value = nextFilters;
};

const setStartTime = (value: string): void => {
  startTime.value = value;
};

const setEndTime = (value: string): void => {
  endTime.value = value;
};

const setSearchQuery = (value: string): void => {
  searchQuery.value = value;
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
}
</style>
