<template>
  <div class="audit-logs-list">
    <div v-if="logs.length === 0" class="text-center q-py-lg">
      <q-icon name="event_note" size="48px" class="text-grey-5" />
      <p class="text-body2 text-grey-7 q-mt-md">
        Keine Audit-Protokolle gefunden, die den Filtern entsprechen
      </p>
    </div>

    <div v-for="log in logs" :key="log.id" class="audit-log-card q-mb-md">
      <q-card flat bordered class="audit-log-card__content">
        <q-card-section class="audit-log-card__header" @click="emitToggle(log.id)">
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

    <div v-if="logs.length > 0" class="text-center q-mt-lg">
      <p class="text-caption text-grey-7">
        Zeige {{ logs.length }} von {{ metadata.total }} Audit-Protokollen
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type AuditLog } from 'src/services/auditService';
import AuditLogDetails from 'components/AuditLogDetails.vue';

defineOptions({
  name: 'AuditLogsList',
});

const props = defineProps<{
  logs: AuditLog[];
  metadata: { total: number };
  expandedLogs: string[];
  formatAction: (action: string) => string;
  formatTimestamp: (timestamp: string) => string;
  getActorName: (actorId?: string) => string;
}>();

const emit = defineEmits<{
  (event: 'toggle', logId: string): void;
}>();

const emitToggle = (logId: string): void => {
  emit('toggle', logId);
};
</script>

<style scoped lang="scss">
.audit-logs-list {
  margin-top: 24px;
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
}

.rotate-180 {
  transform: rotate(180deg);
}

.transition-all {
  transition: transform 0.3s ease;
}
</style>
