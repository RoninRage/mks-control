<template>
  <q-page class="ms-container" data-testid="usage-page">
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Nutzungen</h1>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          size="lg"
          padding="md"
          aria-label="Zurück"
          class="touch-button"
          @click="goBack"
        />
      </div>
      <p class="text-body1 text-grey-7" data-testid="usage-scope">{{ scopeText }}</p>
    </div>

    <!-- Filters -->
    <div class="ms-section">
      <div class="row q-col-gutter-md items-end">
        <div class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="filter.equipmentId"
            outlined
            emit-value
            map-options
            clearable
            label="Maschine"
            :options="equipmentOptions"
            data-testid="usage-filter-equipment"
          />
        </div>
        <div v-if="canFilterMembers" class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="filter.memberId"
            outlined
            emit-value
            map-options
            clearable
            label="Mitglied"
            :options="memberOptions"
            data-testid="usage-filter-member"
          />
        </div>
        <div class="col-6 col-md-2">
          <q-input
            v-model="filter.from"
            outlined
            type="date"
            label="Von"
            stack-label
            data-testid="usage-filter-from"
          />
        </div>
        <div class="col-6 col-md-2">
          <q-input
            v-model="filter.to"
            outlined
            type="date"
            label="Bis"
            stack-label
            data-testid="usage-filter-to"
          />
        </div>
        <div class="col-12 col-md-2">
          <q-btn
            unelevated
            color="primary"
            label="Anzeigen"
            class="touch-button full-width"
            data-testid="usage-filter-apply"
            :loading="loading"
            @click="load"
          />
        </div>
      </div>
    </div>

    <div v-if="error" class="ms-section">
      <q-banner class="bg-negative text-white" data-testid="usage-error">{{ error }}</q-banner>
    </div>

    <!-- Totals -->
    <div v-if="result" class="ms-section">
      <div class="usage__totals" data-testid="usage-totals">
        <q-card flat bordered class="usage__total">
          <div class="text-caption text-grey-7">Nutzungen</div>
          <div class="text-h5" data-testid="usage-total-count">{{ result.totals.count }}</div>
        </q-card>
        <q-card flat bordered class="usage__total">
          <div class="text-caption text-grey-7">Dauer</div>
          <div class="text-h5" data-testid="usage-total-duration">
            {{ formatDuration(result.totals.durationSec) }}
          </div>
        </q-card>
        <q-card flat bordered class="usage__total">
          <div class="text-caption text-grey-7">Energie</div>
          <div class="text-h5" data-testid="usage-total-energy">
            {{ formatEnergy(result.totals.energyWh) }}
          </div>
        </q-card>
      </div>
    </div>

    <!-- List -->
    <div v-if="result" class="ms-section">
      <div v-if="result.usages.length === 0" class="text-grey-7" data-testid="usage-empty">
        Keine Nutzungen im gewählten Zeitraum.
      </div>
      <q-list v-else bordered separator class="usage__list" data-testid="usage-list">
        <q-item
          v-for="usage in result.usages"
          :key="usage.id"
          data-testid="usage-row"
          :data-usage-id="usage.id"
        >
          <q-item-section>
            <q-item-label class="text-subtitle1" data-testid="usage-row-equipment">
              {{ usage.equipmentName }}
            </q-item-label>
            <q-item-label caption data-testid="usage-row-member">
              {{ usage.memberName }}
              <q-chip v-if="usage.adminOverride" dense size="sm" color="grey-4"> als Admin </q-chip>
            </q-item-label>
            <q-item-label caption>{{ formatDateTime(usage.startedAt) }}</q-item-label>
          </q-item-section>
          <q-item-section side class="usage__side">
            <q-item-label>{{ formatDuration(usage.durationSec ?? 0) }}</q-item-label>
            <q-item-label caption data-testid="usage-row-energy">
              {{ usage.energyWh !== undefined ? formatEnergy(usage.energyWh) : '–' }}
            </q-item-label>
            <q-chip
              v-if="!usage.endedAt"
              dense
              color="positive"
              text-color="white"
              data-testid="usage-row-running"
            >
              läuft
            </q-chip>
            <q-item-label v-else caption data-testid="usage-row-reason">
              {{ END_REASONS[usage.endReason ?? 'system'] }}
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { UsageEndReason, UsageListResponse } from '@mks-control/shared-types';
import { usageService } from 'src/services/usageService';
import { useUserStore } from 'stores/user-store';

defineOptions({
  name: 'UsagePage',
});

interface SelectOption {
  label: string;
  value: string;
}

const END_REASONS: Record<UsageEndReason, string> = {
  logout: 'Abgemeldet',
  timeout: 'Keine Antwort auf „Noch da?“',
  admin: 'Durch Admin beendet',
  'device-offline': 'Shelly nicht erreichbar',
  'terminal-offline': 'Pi ohne Verbindung',
  system: 'Vom System beendet',
  handover: 'Übernommen',
};

const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<UsageListResponse | null>(null);
// Options come from everything the user may see, so they stay stable while filtering.
const equipmentOptions = ref<SelectOption[]>([]);
const memberOptions = ref<SelectOption[]>([]);

const filter = reactive({
  equipmentId: null as string | null,
  memberId: null as string | null,
  from: null as string | null,
  to: null as string | null,
});

const role = computed((): string | null => userStore.roleId);
const canFilterMembers = computed((): boolean => role.value !== 'mitglied');

const scopeText = computed((): string => {
  switch (role.value) {
    case 'admin':
    case 'vorstand':
      return 'Alle Freigaben aller Maschinen.';
    case 'bereichsleitung':
      return 'Freigaben der Maschinen in Ihren Bereichen und Ihre eigenen.';
    default:
      return 'Ihre eigenen Freigaben.';
  }
});

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} h ${minutes} min`;
  }
  return minutes > 0 ? `${minutes} min` : `${seconds} s`;
};

const formatEnergy = (wh: number): string =>
  `${(wh / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh`;

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

const uniqueOptions = (entries: Array<[string, string]>): SelectOption[] =>
  [...new Map(entries).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));

async function loadOptions(): Promise<void> {
  const all = await usageService.list();
  equipmentOptions.value = uniqueOptions(all.usages.map((u) => [u.equipmentId, u.equipmentName]));
  memberOptions.value = uniqueOptions(
    all.usages.filter((u) => u.memberId).map((u) => [u.memberId as string, u.memberName])
  );
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    result.value = await usageService.list(filter);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Nutzungen konnten nicht geladen werden';
  } finally {
    loading.value = false;
  }
}

function goBack(): void {
  void router.replace('/dashboard');
}

onMounted(async () => {
  await load();
  try {
    await loadOptions();
  } catch {
    // Filters stay empty; the list itself already shows the error if any.
  }
});
</script>

<style scoped lang="scss">
.usage {
  &__totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
  }

  &__total {
    border-radius: 12px;
    padding: 16px;
  }

  &__list {
    border-radius: 12px;
  }

  &__side {
    align-items: flex-end;
    gap: 4px;
  }
}

.touch-button {
  min-height: 44px;
}
</style>
