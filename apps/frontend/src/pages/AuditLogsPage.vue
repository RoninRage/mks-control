<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <div>
          <h1 class="text-h3 q-mb-none">Audit Logs</h1>
          <p class="text-body2 text-grey-7">View system activity and user actions</p>
        </div>
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

    <!-- Filters Section -->
    <div class="ms-section">
      <div class="audit-logs-page__filters q-mb-lg">
        <div class="row q-col-gutter-md q-mb-md">
          <!-- Date Range -->
          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model="filters.startDate"
              label="Start Date"
              type="date"
              outlined
              dense
              @update:model-value="applyFilters"
            />
          </div>

          <div class="col-12 col-sm-6 col-md-3">
            <q-input
              v-model="filters.endDate"
              label="End Date"
              type="date"
              outlined
              dense
              @update:model-value="applyFilters"
            />
          </div>

          <!-- Action Filter -->
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              v-model="filters.action"
              :options="availableActions"
              label="Action Type"
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
              label="Machine"
              outlined
              dense
              clearable
              emit-value
              map-options
              @update:model-value="applyFilters"
            />
          </div>
        </div>

        <!-- Search -->
        <div class="row q-col-gutter-md">
          <div class="col-12">
            <q-input
              v-model="searchQuery"
              label="Search (User, Action, Entity)"
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
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center q-my-lg">
      <q-spinner color="primary" size="50px" />
      <p class="text-body2 q-mt-md">Loading audit logs...</p>
    </div>

    <!-- Error State -->
    <q-banner v-if="error" class="bg-negative text-white q-mb-lg">
      <template #avatar>
        <q-icon name="error" />
      </template>
      {{ error }}
      <template #action>
        <q-btn flat label="Retry" @click="loadAuditLogs" />
      </template>
    </q-banner>

    <!-- Audit Logs List -->
    <div v-if="!loading && !error" class="audit-logs-page__list">
      <div v-if="logs.length === 0" class="text-center q-py-lg">
        <q-icon name="event_note" size="48px" class="text-grey-5" />
        <p class="text-body2 text-grey-7 q-mt-md">No audit logs found matching your filters</p>
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
                <q-chip size="sm" :label="`User: ${log.actorId}`" class="bg-blue-1 text-blue-9" />
              </div>
              <div v-if="log.targetId" class="col-auto">
                <q-chip
                  size="sm"
                  :label="`Target: ${log.targetId}`"
                  class="bg-purple-1 text-purple-9"
                />
              </div>
              <div v-if="log.actorRole" class="col-auto">
                <q-chip
                  size="sm"
                  :label="`Role: ${log.actorRole}`"
                  class="bg-orange-1 text-orange-9"
                />
              </div>
            </div>
          </q-card-section>

          <!-- Expandable Details -->
          <q-slide-transition>
            <div v-show="expandedLogs.includes(log.id)">
              <q-separator />
              <q-card-section class="audit-log-card__details">
                <div class="row q-col-gutter-lg">
                  <!-- Left Column -->
                  <div class="col-12 col-md-6">
                    <div class="detail-group">
                      <div class="detail-label">Action</div>
                      <div class="detail-value">{{ log.action }}</div>
                    </div>

                    <div class="detail-group">
                      <div class="detail-label">Timestamp</div>
                      <div class="detail-value">{{ log.timestamp }}</div>
                    </div>

                    <div class="detail-group">
                      <div class="detail-label">Actor ID</div>
                      <div class="detail-value">{{ log.actorId || 'N/A' }}</div>
                    </div>

                    <div class="detail-group">
                      <div class="detail-label">Actor Role</div>
                      <div class="detail-value">{{ log.actorRole || 'N/A' }}</div>
                    </div>
                  </div>

                  <!-- Right Column -->
                  <div class="col-12 col-md-6">
                    <div class="detail-group">
                      <div class="detail-label">Target Type</div>
                      <div class="detail-value">{{ log.targetType || 'N/A' }}</div>
                    </div>

                    <div class="detail-group">
                      <div class="detail-label">Target ID</div>
                      <div class="detail-value">{{ log.targetId || 'N/A' }}</div>
                    </div>

                    <div class="detail-group">
                      <div class="detail-label">Source (Machine)</div>
                      <div class="detail-value">{{ log.source || 'N/A' }}</div>
                    </div>

                    <div class="detail-group">
                      <div class="detail-label">IP Address</div>
                      <div class="detail-value">{{ log.ip || 'N/A' }}</div>
                    </div>

                    <div class="detail-group">
                      <div class="detail-label">Device ID</div>
                      <div class="detail-value text-caption">{{ log.deviceId || 'N/A' }}</div>
                    </div>
                  </div>
                </div>
              </q-card-section>
            </div>
          </q-slide-transition>
        </q-card>
      </div>

      <!-- Pagination Info -->
      <div v-if="logs.length > 0" class="text-center q-mt-lg">
        <p class="text-caption text-grey-7">
          Showing {{ logs.length }} of {{ metadata.total }} audit logs
        </p>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { auditService, type AuditLog, type AuditLogFilters } from 'src/services/auditService';
import { useUserStore } from 'stores/user-store';

defineOptions({
  name: 'AuditLogsPage',
});

const router = useRouter();
const userStore = useUserStore();

const goBack = (): void => {
  router.push('/dashboard').catch((err) => {
    console.error('Navigation to dashboard failed:', err);
  });
};

// State
const logs = ref<AuditLog[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);
const expandedLogs = ref<string[]>([]);
const searchQuery = ref('');

const filters = ref<AuditLogFilters>({});

const metadata = ref({
  total: 0,
  sources: [] as string[],
  actions: [] as string[],
});

const availableActions = ref<string[]>([]);
const availableSources = ref<string[]>([]);

// Methods
const formatAction = (action: string): string => {
  return action
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
    if (filters.value.startDate) filterParams.startDate = filters.value.startDate;
    if (filters.value.endDate) filterParams.endDate = filters.value.endDate;
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

const applyFilters = (): void => {
  loadAuditLogs();
};

// Lifecycle
onMounted(() => {
  loadAuditLogs();
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

.detail-group {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
}

.detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.detail-value {
  font-family: 'Roboto Mono', monospace;
  font-size: 14px;
  color: var(--text-primary);
  word-break: break-all;
}

.rotate-180 {
  transform: rotate(180deg);
}

.transition-all {
  transition: transform 0.3s ease;
}
</style>
