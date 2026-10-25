<template>
  <q-card flat bordered class="control-card" data-testid="equipment-control">
    <q-card-section>
      <div class="text-h6">Steuerung</div>
      <div class="text-body2 text-grey-7">
        Shelly-Ausgang, der diese Maschine mit Strom versorgt. Am Terminal der Maschine wird er bei
        der Freigabe ein- und beim Abmelden ausgeschaltet.
      </div>
    </q-card-section>

    <q-card-section v-if="loading">
      <q-linear-progress indeterminate color="primary" />
    </q-card-section>

    <q-card-section v-else class="q-gutter-md">
      <q-banner
        v-if="devices.length === 0"
        class="bg-grey-3"
        data-testid="equipment-control-no-devices"
      >
        Noch keine Shelly-Geräte angelegt. Bitte zuerst unter „Shelly-Geräte“ hinzufügen.
      </q-banner>

      <template v-else>
        <q-select
          v-model="deviceId"
          outlined
          emit-value
          map-options
          clearable
          label="Shelly-Gerät"
          :options="deviceOptions"
          data-testid="equipment-control-device"
        />
        <q-select
          v-model="outputKey"
          outlined
          emit-value
          map-options
          label="Ausgang"
          :options="outputOptions"
          :disable="!deviceId"
          data-testid="equipment-control-output"
        />
        <q-input
          v-model.number="watchdogMinutes"
          outlined
          type="number"
          min="1"
          max="60"
          label="Sicherheits-Timer (Minuten)"
          hint="Fällt der Server oder der Pi aus, schaltet der Shelly die Maschine nach dieser Zeit selbst ab."
          data-testid="equipment-control-watchdog"
        />
        <q-select
          v-model="meterKey"
          outlined
          emit-value
          map-options
          label="Leistungsmessung"
          :options="meterOptions"
          :hint="meterHint"
          data-testid="equipment-control-meter"
        />
        <q-select
          v-model="shutdownMode"
          outlined
          emit-value
          map-options
          label="Beim Abmelden"
          :options="shutdownOptions"
          data-testid="equipment-control-shutdown"
        />
        <div v-if="shutdownMode === 'when-idle'" class="row q-col-gutter-md">
          <div class="col-12 col-sm-4">
            <q-input
              v-model.number="idleThresholdW"
              outlined
              type="number"
              min="1"
              label="Leerlauf unter (W)"
              data-testid="equipment-control-idle-threshold"
            />
          </div>
          <div class="col-12 col-sm-4">
            <q-input
              v-model.number="idleSeconds"
              outlined
              type="number"
              min="1"
              label="für (Sekunden)"
              data-testid="equipment-control-idle-seconds"
            />
          </div>
          <div class="col-12 col-sm-4">
            <q-input
              v-model.number="maxWaitMinutes"
              outlined
              type="number"
              min="1"
              label="spätestens nach (Minuten)"
              data-testid="equipment-control-max-wait"
            />
          </div>
          <div class="col-12 text-body2 text-grey-7">
            Nach dem Abmelden läuft die Maschine weiter, bis die Leistung so lange unter der
            Schwelle liegt (Job fertig), spätestens bis zur maximalen Wartezeit.
          </div>
        </div>
      </template>

      <q-banner v-if="error" class="bg-negative text-white" data-testid="equipment-control-error">
        {{ error }}
      </q-banner>
    </q-card-section>

    <q-card-actions v-if="!loading && devices.length > 0" class="control-card__actions">
      <q-btn
        unelevated
        color="primary"
        label="Steuerung speichern"
        class="touch-button"
        data-testid="equipment-control-save"
        :loading="saving"
        :disable="!deviceId || !outputKey"
        @click="save"
      />
      <q-btn
        v-if="equipment.control"
        flat
        color="negative"
        label="Zuordnung entfernen"
        class="touch-button"
        data-testid="equipment-control-remove"
        :loading="saving"
        @click="remove"
      />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import type {
  Equipment,
  MachineControlKind,
  MachineShutdown,
  ShellyComponentKind,
  ShellyDevice,
} from '@mks-control/shared-types';
import { machineService } from 'src/services/machineService';
import { shellyService } from 'src/services/shellyService';
import { componentLabel } from 'src/utils/shellyLabels';

defineOptions({
  name: 'EquipmentControlCard',
});

interface Props {
  equipment: Equipment;
}

interface SelectOption {
  label: string;
  value: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'updated', equipment: Equipment): void }>();

const $q = useQuasar();

const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const devices = ref<ShellyDevice[]>([]);
const deviceId = ref<string | null>(props.equipment.control?.deviceId ?? null);
const outputKey = ref<string | null>(
  props.equipment.control
    ? `${props.equipment.control.kind}:${props.equipment.control.index}`
    : null
);
const watchdogMinutes = ref<number>(props.equipment.control?.watchdogMinutes ?? 3);

// '' = use the output's own metering (if it has one).
const initialMeter = props.equipment.control?.meter;
const meterKey = ref<string>(
  initialMeter ? `${initialMeter.deviceId}|${initialMeter.kind}|${initialMeter.index}` : ''
);
const initialShutdown = props.equipment.control?.shutdown;
const shutdownMode = ref<MachineShutdown['mode']>(initialShutdown?.mode ?? 'immediate');
const idleThresholdW = ref<number>(
  initialShutdown?.mode === 'when-idle' ? initialShutdown.idleThresholdW : 20
);
const idleSeconds = ref<number>(
  initialShutdown?.mode === 'when-idle' ? initialShutdown.idleSeconds : 60
);
const maxWaitMinutes = ref<number>(
  initialShutdown?.mode === 'when-idle' ? initialShutdown.maxWaitMinutes : 30
);

const outputMeasures = computed((): boolean => {
  if (!outputKey.value) {
    return false;
  }
  const [kind, index] = outputKey.value.split(':');
  const device = devices.value.find((d) => d.id === deviceId.value);
  return Boolean(
    device?.components.some((c) => c.kind === kind && c.index === Number(index) && c.hasPowerMeter)
  );
});

// Every component of any Shelly that measures power.
const meterOptions = computed((): SelectOption[] => [
  {
    label: outputMeasures.value ? 'Am Ausgang selbst' : 'Keine (Ausgang misst nicht)',
    value: '',
  },
  ...devices.value.flatMap((device) =>
    device.components
      .filter((c) => c.kind === 'meter' || c.hasPowerMeter)
      .map((c) => ({
        label: `${device.name} · ${componentLabel(c)}`,
        value: `${device.id}|${c.kind}|${c.index}`,
      }))
  ),
]);

const hasMetering = computed((): boolean => meterKey.value !== '' || outputMeasures.value);

const meterHint = computed((): string =>
  hasMetering.value
    ? 'Zeigt die Leistung am Pi und zählt die kWh je Nutzung.'
    : 'Ohne Messung gibt es keine Leistungsanzeige, keine kWh und kein Abschalten im Leerlauf.'
);

const shutdownOptions = computed(() => [
  { label: 'Sofort ausschalten', value: 'immediate' },
  {
    label: 'Erst im Leerlauf ausschalten (Job zu Ende laufen lassen)',
    value: 'when-idle',
    disable: !hasMetering.value,
  },
]);

watch(hasMetering, (measures) => {
  if (!measures) {
    shutdownMode.value = 'immediate';
  }
});

const deviceOptions = computed((): SelectOption[] =>
  devices.value.map((d) => ({ label: `${d.name} (${d.model}, ${d.host})`, value: d.id }))
);

// Only relays and lights can power a machine.
const outputOptions = computed((): SelectOption[] => {
  const device = devices.value.find((d) => d.id === deviceId.value);
  return (device?.components ?? [])
    .filter((c) => c.kind === 'switch' || c.kind === 'light')
    .map((c) => ({ label: componentLabel(c), value: `${c.kind}:${c.index}` }));
});

watch(deviceId, (next, previous) => {
  if (previous !== undefined && next !== previous) {
    outputKey.value = outputOptions.value[0]?.value ?? null;
  }
});

onMounted(async () => {
  try {
    devices.value = await shellyService.getDevices();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Shelly-Geräte konnten nicht geladen werden';
  } finally {
    loading.value = false;
  }
});

async function save(): Promise<void> {
  if (!deviceId.value || !outputKey.value) {
    return;
  }
  const [kind, index] = outputKey.value.split(':');
  saving.value = true;
  error.value = null;
  try {
    const [meterDeviceId, meterKind, meterIndex] = meterKey.value.split('|');
    const shutdown: MachineShutdown =
      shutdownMode.value === 'when-idle'
        ? {
            mode: 'when-idle',
            idleThresholdW: Number(idleThresholdW.value),
            idleSeconds: Number(idleSeconds.value),
            maxWaitMinutes: Number(maxWaitMinutes.value),
          }
        : { mode: 'immediate' };
    const updated = await machineService.setControl(props.equipment.id, {
      deviceId: deviceId.value,
      kind: kind as MachineControlKind,
      index: Number(index),
      watchdogMinutes: Number(watchdogMinutes.value),
      shutdown,
      meter:
        meterKey.value && meterDeviceId
          ? {
              deviceId: meterDeviceId,
              kind: meterKind as ShellyComponentKind,
              index: Number(meterIndex),
            }
          : null,
    });
    emit('updated', updated);
    $q.notify({ type: 'positive', message: 'Steuerung gespeichert', position: 'top' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Steuerung konnte nicht gespeichert werden';
  } finally {
    saving.value = false;
  }
}

async function remove(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const updated = await machineService.removeControl(props.equipment.id);
    deviceId.value = null;
    outputKey.value = null;
    emit('updated', updated);
    $q.notify({ type: 'positive', message: 'Zuordnung entfernt', position: 'top' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Zuordnung konnte nicht entfernt werden';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.control-card {
  border-radius: 16px;

  &__actions {
    gap: 8px;
    padding: 12px 16px;
    flex-wrap: wrap;
  }
}

.touch-button {
  min-height: 44px;
}
</style>
