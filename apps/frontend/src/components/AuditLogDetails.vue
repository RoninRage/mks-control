<template>
  <!-- Expandable Details -->
  <q-slide-transition>
    <div v-show="isExpanded">
      <q-separator />
      <q-card-section class="audit-log-card__details">
        <div class="row q-col-gutter-lg">
          <!-- Left Column -->
          <div class="col-12 col-md-6">
            <div class="detail-group">
              <div class="detail-label">Aktion</div>
              <div class="detail-value">{{ log.action }}</div>
            </div>

            <div class="detail-group">
              <div class="detail-label">Zeitstempel</div>
              <div class="detail-value">{{ log.timestamp }}</div>
            </div>

            <div class="detail-group">
              <div class="detail-label">Benutzer</div>
              <div class="detail-value">{{ actorName }}</div>
            </div>

            <div class="detail-group">
              <div class="detail-label">Benutzerrolle</div>
              <div class="detail-value">{{ log.actorRole || 'N/A' }}</div>
            </div>
          </div>

          <!-- Right Column -->
          <div class="col-12 col-md-6">
            <div class="detail-group">
              <div class="detail-label">Zieltyp</div>
              <div class="detail-value">{{ log.targetType || 'N/A' }}</div>
            </div>

            <div class="detail-group">
              <div class="detail-label">{{ targetLabel }}</div>
              <div class="detail-value">{{ targetName }}</div>
            </div>

            <div v-if="log.action === 'member.permissions.update'" class="detail-group">
              <div class="detail-label">Ausruestung</div>
              <div class="detail-value">{{ relatedAssetName }}</div>
            </div>

            <div class="detail-group">
              <div class="detail-label">Quelle (Maschine)</div>
              <div class="detail-value">{{ log.source || 'N/A' }}</div>
            </div>

            <div class="detail-group">
              <div class="detail-label">IP-Adresse</div>
              <div class="detail-value">{{ log.ip || 'N/A' }}</div>
            </div>

            <div class="detail-group">
              <div class="detail-label">Geraete-ID</div>
              <div class="detail-value text-caption">{{ log.deviceId || 'N/A' }}</div>
            </div>
          </div>
        </div>
      </q-card-section>
    </div>
  </q-slide-transition>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { type AuditLog } from 'src/services/auditService';
import type { Equipment, Member } from '@mks-control/shared-types';
import { memberService } from 'src/services/memberService';
import { equipmentService } from 'src/services/equipmentService';

defineOptions({
  name: 'AuditLogDetails',
});

const props = defineProps<{
  log: AuditLog;
  isExpanded: boolean;
}>();

const members = ref<Member[]>([]);
const equipment = ref<Equipment[]>([]);

const actorName = computed(() => {
  if (!props.log.actorId) return 'N/A';

  const member = members.value.find((m) => m.id === props.log.actorId);
  if (member) {
    return `${member.firstName} ${member.lastName}`.trim();
  }

  return props.log.actorId;
});

const targetName = computed(() => {
  // For member.permissions.update, targetId is the member whose permissions changed
  if (props.log.action === 'member.permissions.update' && props.log.targetId) {
    const member = members.value.find((m) => m.id === props.log.targetId);
    if (member) {
      return `${member.firstName} ${member.lastName}`.trim();
    }
  }
  return props.log.targetId || 'N/A';
});

const targetLabel = computed(() => {
  if (props.log.action === 'member.permissions.update') {
    return 'Benutzer';
  }
  return 'Ziel';
});

const relatedAssetName = computed(() => {
  if (!props.log.relatedId) return 'N/A';
  const asset = equipment.value.find((e) => e.id === props.log.relatedId);
  if (asset) {
    return asset.name;
  }
  return props.log.relatedId;
});

onMounted(async () => {
  try {
    const [membersData, equipmentData] = await Promise.all([
      memberService.getMembers(),
      equipmentService.getEquipment(),
    ]);
    members.value = membersData;
    equipment.value = equipmentData;
  } catch (error) {
    console.error('[AuditLogDetails] Failed to load data:', error);
  }
});
</script>

<style scoped lang="scss">
.audit-log-card {
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
</style>
