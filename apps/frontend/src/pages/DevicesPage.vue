<template>
  <q-page class="ms-container" data-testid="devices-page">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Shelly-Geräte</h1>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          size="lg"
          padding="md"
          aria-label="Zurück"
          class="touch-button"
          data-testid="devices-back"
          @click="goBack"
        />
      </div>
    </div>

    <div v-if="loading" class="ms-section">
      <q-linear-progress indeterminate color="primary" />
    </div>

    <div v-if="error" class="ms-section">
      <q-banner class="bg-negative text-white" data-testid="devices-error">
        <template #avatar>
          <q-icon name="error" />
        </template>
        {{ error }}
      </q-banner>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && devices.length === 0" class="ms-section" data-testid="devices-empty">
      <q-card flat bordered class="text-center q-pa-lg">
        <q-icon name="settings_remote" size="64px" color="grey-5" class="q-mb-md" />
        <div class="text-h6 q-mb-sm">Noch keine Shelly-Geräte</div>
        <p class="text-body2 text-grey-7">
          Fügen Sie ein Gerät über seine IP-Adresse im lokalen Netz hinzu.
        </p>
        <q-btn
          unelevated
          color="primary"
          label="Gerät hinzufügen"
          icon="add"
          size="lg"
          class="q-mt-md touch-button"
          data-testid="devices-empty-add"
          @click="openAddDialog"
        />
      </q-card>
    </div>

    <!-- Device list -->
    <div v-if="!loading && devices.length > 0" class="ms-section" data-testid="devices-list">
      <div class="row items-center justify-between q-mb-lg devices__toolbar">
        <div class="text-h6" data-testid="devices-count">{{ devices.length }} Geräte</div>
        <div class="row devices__toolbar-actions">
          <q-btn
            outline
            color="primary"
            label="Status aktualisieren"
            icon="refresh"
            class="touch-button"
            data-testid="devices-refresh-status"
            @click="loadAllStatuses"
          />
          <q-btn
            unelevated
            color="primary"
            label="Gerät hinzufügen"
            icon="add"
            class="touch-button"
            data-testid="devices-add"
            @click="openAddDialog"
          />
        </div>
      </div>

      <div class="devices__grid">
        <q-card
          v-for="device in devices"
          :key="device.id"
          flat
          bordered
          class="device-card"
          data-testid="device-card"
          :data-device-id="device.id"
        >
          <q-card-section>
            <div class="row items-start justify-between no-wrap">
              <div class="device-card__title">
                <div class="text-h6" data-testid="device-name">{{ device.name }}</div>
                <div class="text-body2 text-grey-7" data-testid="device-meta">
                  {{ device.model }} · Gen{{ device.gen }} · {{ device.host }}
                </div>
                <q-chip
                  v-if="device.maintenance"
                  dense
                  size="sm"
                  color="warning"
                  icon="build"
                  data-testid="device-maintenance"
                >
                  Wartung
                </q-chip>
                <q-chip
                  v-if="device.push"
                  dense
                  size="sm"
                  :color="PUSH_COLORS[device.push.state]"
                  text-color="white"
                  class="q-ml-none"
                  data-testid="device-push"
                  :data-state="device.push.state"
                >
                  {{ PUSH_LABELS[device.push.state] }}
                  <q-tooltip v-if="device.push.error">{{ device.push.error }}</q-tooltip>
                </q-chip>
              </div>
              <q-chip
                :color="healthColor(device)"
                text-color="white"
                dense
                data-testid="device-health"
                :data-health="healthOf(device)"
              >
                {{ healthLabel(device) }}
              </q-chip>
            </div>
          </q-card-section>

          <q-separator />

          <q-list dense class="device-card__components" data-testid="device-components">
            <q-item
              v-for="row in componentRows(device)"
              :key="`${row.kind}-${row.index}`"
              data-testid="device-component"
              :data-kind="row.kind"
              :data-index="row.index"
            >
              <q-item-section avatar>
                <q-icon :name="KIND_ICONS[row.kind]" />
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ componentLabel(row) }}</q-item-label>
              </q-item-section>
              <q-item-section side data-testid="device-component-state">
                {{ row.text }}
              </q-item-section>
            </q-item>
            <q-item v-if="device.components.length === 0">
              <q-item-section class="text-grey-7">Keine steuerbaren Komponenten</q-item-section>
            </q-item>
          </q-list>

          <div
            v-if="statuses[device.id]?.error"
            class="q-px-md q-pb-sm text-negative text-body2"
            data-testid="device-status-error"
          >
            {{ statuses[device.id]?.error }}
          </div>

          <!-- Firmware -->
          <div class="q-px-md q-pb-sm device-card__firmware" data-testid="device-firmware">
            <template v-if="firmware[device.id]">
              <span data-testid="device-firmware-current">
                Firmware {{ firmware[device.id]?.current ?? 'unbekannt' }}
              </span>
              <span
                v-if="firmware[device.id]?.available"
                class="text-warning"
                data-testid="device-firmware-available"
              >
                · Update auf {{ firmware[device.id]?.available }} verfügbar
              </span>
              <span v-else class="text-positive"> · aktuell</span>
            </template>
            <q-btn
              v-if="firmware[device.id]?.available"
              dense
              unelevated
              color="warning"
              label="Firmware installieren"
              class="touch-button q-ml-sm"
              data-testid="device-firmware-update"
              :disable="!device.maintenance"
              @click="confirmFirmwareUpdate(device)"
            >
              <q-tooltip v-if="!device.maintenance">Nur im Wartungsmodus möglich</q-tooltip>
            </q-btn>
            <q-btn
              v-else
              dense
              flat
              color="primary"
              label="Firmware prüfen"
              icon="system_update"
              class="touch-button"
              data-testid="device-firmware-check"
              :loading="busy[device.id] === 'firmware'"
              @click="checkFirmware(device)"
            />
          </div>

          <q-card-actions class="device-card__actions">
            <q-btn
              flat
              color="primary"
              label="Identifizieren"
              icon="flash_on"
              class="touch-button"
              data-testid="device-identify"
              :loading="busy[device.id] === 'identify'"
              @click="confirmIdentify(device)"
            />
            <q-btn
              flat
              color="primary"
              label="Bearbeiten"
              icon="edit"
              class="touch-button"
              data-testid="device-edit"
              @click="openEditDialog(device)"
            />
            <q-btn
              flat
              color="primary"
              :label="device.maintenance ? 'Wartung beenden' : 'Wartung'"
              icon="build"
              class="touch-button"
              data-testid="device-maintenance-toggle"
              @click="toggleMaintenance(device)"
            />
            <q-btn
              flat
              color="negative"
              label="Ausmustern"
              icon="delete"
              class="touch-button"
              data-testid="device-retire"
              @click="confirmRetire(device)"
            />
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Add dialog -->
    <q-dialog v-model="addDialog.open" persistent>
      <q-card class="device-dialog" data-testid="devices-add-dialog">
        <q-card-section>
          <div class="text-h6">Gerät hinzufügen</div>
          <div class="text-body2 text-grey-7">
            IP-Adresse des Shelly im lokalen Netz, optional mit Port.
          </div>
        </q-card-section>

        <q-card-section class="q-gutter-md">
          <div v-if="discovered.length > 0" data-testid="devices-discovered">
            <div class="text-subtitle2 q-mb-sm">Im Netz gefunden</div>
            <div class="device-dialog__found">
              <q-btn
                v-for="found in discovered"
                :key="found.host"
                outline
                no-caps
                color="primary"
                class="touch-button"
                data-testid="devices-discovered-item"
                :data-host="found.host"
                @click="pickDiscovered(found.host)"
              >
                <div class="text-left">
                  <div>{{ found.name }}</div>
                  <div class="text-caption text-grey-7">{{ found.host }}</div>
                </div>
              </q-btn>
            </div>
          </div>
          <div class="row no-wrap items-start device-dialog__host">
            <q-input
              v-model="addDialog.host"
              outlined
              label="IP-Adresse"
              placeholder="192.168.1.50"
              class="col"
              autofocus
              data-testid="devices-add-host"
              @keyup.enter="probeHost"
            />
            <q-btn
              unelevated
              color="primary"
              label="Prüfen"
              class="touch-button"
              data-testid="devices-add-probe"
              :loading="addDialog.probing"
              :disable="!addDialog.host.trim()"
              @click="probeHost"
            />
          </div>

          <q-banner
            v-if="addDialog.error"
            class="bg-negative text-white"
            data-testid="devices-add-error"
          >
            {{ addDialog.error }}
          </q-banner>

          <div v-if="addDialog.probe" data-testid="devices-add-probe-result">
            <q-list bordered separator>
              <q-item>
                <q-item-section>
                  <q-item-label caption>Modell</q-item-label>
                  <q-item-label data-testid="devices-add-model">
                    {{ addDialog.probe.model }} · Gen{{ addDialog.probe.gen }}
                  </q-item-label>
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-item-label caption>Kennung / MAC</q-item-label>
                  <q-item-label>
                    {{ addDialog.probe.shellyId }} · {{ addDialog.probe.mac }}
                  </q-item-label>
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-item-label caption>Komponenten</q-item-label>
                  <q-item-label data-testid="devices-add-components">
                    {{ describeComponents(addDialog.probe.components) }}
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-list>

            <q-banner
              v-if="addDialog.probe.existingDeviceId"
              class="bg-warning q-mt-md"
              data-testid="devices-add-exists"
            >
              Dieses Gerät ist bereits angelegt.
            </q-banner>

            <q-input
              v-model="addDialog.name"
              outlined
              label="Name"
              class="q-mt-md"
              maxlength="100"
              data-testid="devices-add-name"
            />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="device-dialog__actions">
          <q-btn
            flat
            color="primary"
            label="Abbrechen"
            class="touch-button"
            data-testid="devices-add-cancel"
            @click="addDialog.open = false"
          />
          <q-btn
            unelevated
            color="primary"
            label="Hinzufügen"
            class="touch-button"
            data-testid="devices-add-submit"
            :loading="addDialog.saving"
            :disable="!canAdd"
            @click="addDevice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Edit dialog -->
    <q-dialog v-model="editDialog.open" persistent>
      <q-card class="device-dialog" data-testid="devices-edit-dialog">
        <q-card-section>
          <div class="text-h6">Gerät bearbeiten</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            v-model="editDialog.name"
            outlined
            label="Name"
            maxlength="100"
            data-testid="devices-edit-name"
          />
          <q-input
            v-model="editDialog.host"
            outlined
            label="IP-Adresse"
            hint="Bei einer neuen Adresse muss dasselbe Gerät (gleiche MAC) antworten."
            data-testid="devices-edit-host"
          />
          <q-banner
            v-if="editDialog.error"
            class="bg-negative text-white"
            data-testid="devices-edit-error"
          >
            {{ editDialog.error }}
          </q-banner>
        </q-card-section>
        <q-card-actions class="device-dialog__actions">
          <q-btn
            flat
            color="primary"
            label="Neu einlesen"
            icon="sync"
            class="touch-button"
            data-testid="devices-edit-refresh"
            :loading="editDialog.refreshing"
            @click="refreshDevice"
          />
          <q-space />
          <q-btn
            flat
            color="primary"
            label="Abbrechen"
            class="touch-button"
            @click="editDialog.open = false"
          />
          <q-btn
            unelevated
            color="primary"
            label="Speichern"
            class="touch-button"
            data-testid="devices-edit-save"
            :loading="editDialog.saving"
            :disable="!editDialog.name.trim() || !editDialog.host.trim()"
            @click="saveDevice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type {
  ShellyComponent,
  ShellyComponentKind,
  ShellyDevice,
  ShellyDeviceStatus,
  ShellyHealth,
  ShellyDiscovery,
  ShellyFirmwareInfo,
  ShellyPushStatus,
} from '@mks-control/shared-types';
import { shellyService, type ShellyProbeResponse } from 'src/services/shellyService';
import { useUserStore } from 'stores/user-store';
import { authEventSource } from 'src/services/authEventSource';
import {
  HEALTH_COLORS,
  HEALTH_LABELS,
  KIND_ICONS,
  KIND_LABELS,
  componentLabel,
  describeStatus,
} from 'src/utils/shellyLabels';

defineOptions({
  name: 'DevicesPage',
});

interface ComponentRow {
  kind: ShellyComponentKind;
  index: number;
  text: string;
}

const STATUS_POLL_INTERVAL_MS = 10_000;

// Push of safety inputs from the Shelly (webhooks, Gen2+).
const PUSH_LABELS: Record<ShellyPushStatus['state'], string> = {
  active: 'Push aktiv',
  error: 'Push-Fehler',
  unsupported: 'Nur Abfrage (Gen1)',
};
const PUSH_COLORS: Record<ShellyPushStatus['state'], string> = {
  active: 'positive',
  error: 'negative',
  unsupported: 'grey-6',
};

const router = useRouter();
const $q = useQuasar();
const userStore = useUserStore();

const loading = ref(false);
const error = ref<string | null>(null);
const devices = ref<ShellyDevice[]>([]);
const statuses = ref<Record<string, ShellyDeviceStatus>>({});
const busy = ref<Record<string, string | undefined>>({});
let pollTimer: ReturnType<typeof setInterval> | null = null;
let removeHealthListener: (() => void) | null = null;

const addDialog = reactive({
  open: false,
  host: '',
  name: '',
  probing: false,
  saving: false,
  error: null as string | null,
  probe: null as ShellyProbeResponse | null,
});

const editDialog = reactive({
  open: false,
  deviceId: '',
  name: '',
  host: '',
  saving: false,
  refreshing: false,
  error: null as string | null,
});

const canAdd = computed(
  (): boolean =>
    Boolean(addDialog.probe) &&
    !addDialog.probe?.existingDeviceId &&
    Boolean(addDialog.name.trim()) &&
    !addDialog.saving
);

onMounted(async () => {
  if (!userStore.can('manage:devices')) {
    void router.replace('/dashboard');
    return;
  }
  await loadDevices();
  pollTimer = setInterval(() => {
    void loadAllStatuses();
  }, STATUS_POLL_INTERVAL_MS);
  // The backend's health monitor reports online/offline changes right away.
  removeHealthListener = authEventSource.onShellyHealth((event) => {
    const device = devices.value.find((d) => d.id === event.deviceId);
    if (device) {
      device.health = event.health;
      void loadStatus(device.id);
    }
  });
});

onBeforeUnmount(() => {
  removeHealthListener?.();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

async function loadDevices(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    devices.value = await shellyService.getDevices();
  } catch (err) {
    error.value = errorMessage(err, 'Fehler beim Laden der Geräte');
  } finally {
    loading.value = false;
  }
  await loadAllStatuses();
}

async function loadStatus(deviceId: string): Promise<void> {
  try {
    const status = await shellyService.getStatus(deviceId);
    statuses.value = { ...statuses.value, [deviceId]: status };
  } catch (err) {
    console.error('[DevicesPage] Status error:', err);
  }
}

async function loadAllStatuses(): Promise<void> {
  await Promise.all(devices.value.map((device) => loadStatus(device.id)));
}

function healthOf(device: ShellyDevice): ShellyHealth {
  return statuses.value[device.id]?.health ?? device.health ?? 'unknown';
}

function healthLabel(device: ShellyDevice): string {
  return HEALTH_LABELS[healthOf(device)];
}

function healthColor(device: ShellyDevice): string {
  return HEALTH_COLORS[healthOf(device)];
}

function componentRows(device: ShellyDevice): ComponentRow[] {
  const status = statuses.value[device.id];
  return device.components.map((component): ComponentRow => {
    const live = status?.components.find(
      (s) => s.kind === component.kind && s.index === component.index
    );
    return {
      kind: component.kind,
      index: component.index,
      text: live ? describeStatus(live) : '–',
    };
  });
}

function describeComponents(components: ShellyComponent[]): string {
  if (components.length === 0) {
    return 'Keine';
  }
  const counts = new Map<ShellyComponentKind, number>();
  components.forEach((c) => counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1));
  const parts = [...counts.entries()].map(([kind, count]) => `${count}× ${KIND_LABELS[kind]}`);
  if (components.some((c) => c.hasPowerMeter)) {
    parts.push('mit Leistungsmessung');
  }
  return parts.join(', ');
}

function goBack(): void {
  void router.replace('/dashboard');
}

function openAddDialog(): void {
  addDialog.open = true;
  addDialog.host = '';
  addDialog.name = '';
  addDialog.error = null;
  addDialog.probe = null;
  void loadDiscovered();
}

// Shellys found automatically in the network (mDNS), not registered yet.
const discovered = ref<ShellyDiscovery[]>([]);

async function loadDiscovered(): Promise<void> {
  try {
    discovered.value = await shellyService.discovered();
  } catch {
    discovered.value = [];
  }
}

function pickDiscovered(host: string): void {
  addDialog.host = host;
  void probeHost();
}

async function probeHost(): Promise<void> {
  if (!addDialog.host.trim()) {
    return;
  }
  addDialog.probing = true;
  addDialog.error = null;
  addDialog.probe = null;
  try {
    const probe = await shellyService.probe(addDialog.host.trim());
    addDialog.probe = probe;
    addDialog.name = probe.name ?? probe.shellyId;
  } catch (err) {
    addDialog.error = errorMessage(err, 'Gerät konnte nicht geprüft werden');
  } finally {
    addDialog.probing = false;
  }
}

async function addDevice(): Promise<void> {
  if (!addDialog.probe) {
    return;
  }
  addDialog.saving = true;
  addDialog.error = null;
  try {
    await shellyService.createDevice(addDialog.probe.host, addDialog.name.trim());
    addDialog.open = false;
    $q.notify({ type: 'positive', message: 'Gerät hinzugefügt', position: 'top' });
    await loadDevices();
  } catch (err) {
    addDialog.error = errorMessage(err, 'Gerät konnte nicht angelegt werden');
  } finally {
    addDialog.saving = false;
  }
}

function openEditDialog(device: ShellyDevice): void {
  editDialog.open = true;
  editDialog.deviceId = device.id;
  editDialog.name = device.name;
  editDialog.host = device.host;
  editDialog.error = null;
}

async function saveDevice(): Promise<void> {
  editDialog.saving = true;
  editDialog.error = null;
  try {
    await shellyService.updateDevice(editDialog.deviceId, {
      name: editDialog.name.trim(),
      host: editDialog.host.trim(),
    });
    editDialog.open = false;
    $q.notify({ type: 'positive', message: 'Gerät gespeichert', position: 'top' });
    await loadDevices();
  } catch (err) {
    editDialog.error = errorMessage(err, 'Gerät konnte nicht gespeichert werden');
  } finally {
    editDialog.saving = false;
  }
}

async function refreshDevice(): Promise<void> {
  editDialog.refreshing = true;
  editDialog.error = null;
  try {
    await shellyService.refreshDevice(editDialog.deviceId);
    $q.notify({ type: 'positive', message: 'Gerät neu eingelesen', position: 'top' });
    await loadDevices();
  } catch (err) {
    editDialog.error = errorMessage(err, 'Gerät konnte nicht neu eingelesen werden');
  } finally {
    editDialog.refreshing = false;
  }
}

function confirmIdentify(device: ShellyDevice): void {
  $q.dialog({
    title: 'Gerät identifizieren',
    message:
      'Das erste Relais bzw. Licht von „' +
      device.name +
      '" schaltet für eine Sekunde um und dann zurück. ' +
      'Nur ausführen, wenn dadurch keine Maschine gefährlich an- oder ausgeht.',
    cancel: { flat: true, label: 'Abbrechen' },
    ok: { unelevated: true, color: 'primary', label: 'Identifizieren' },
    persistent: true,
  }).onOk(() => {
    void identify(device);
  });
}

async function identify(device: ShellyDevice): Promise<void> {
  busy.value = { ...busy.value, [device.id]: 'identify' };
  try {
    await shellyService.identify(device.id);
    $q.notify({ type: 'positive', message: 'Gerät schaltet kurz um', position: 'top' });
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: errorMessage(err, 'Identifizieren fehlgeschlagen'),
      position: 'top',
    });
  } finally {
    busy.value = { ...busy.value, [device.id]: undefined };
  }
}

const firmware = ref<Record<string, ShellyFirmwareInfo | undefined>>({});

async function checkFirmware(device: ShellyDevice): Promise<void> {
  busy.value = { ...busy.value, [device.id]: 'firmware' };
  try {
    const info = await shellyService.checkFirmware(device.id);
    firmware.value = { ...firmware.value, [device.id]: info };
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: errorMessage(err, 'Firmware-Prüfung fehlgeschlagen'),
      position: 'top',
    });
  } finally {
    busy.value = { ...busy.value, [device.id]: undefined };
  }
}

function confirmFirmwareUpdate(device: ShellyDevice): void {
  $q.dialog({
    title: 'Firmware installieren',
    message:
      '„' +
      device.name +
      '“ installiert Firmware ' +
      (firmware.value[device.id]?.available ?? '') +
      ' und startet danach neu. Die Ausgänge können dabei kurz schalten.',
    cancel: { flat: true, label: 'Abbrechen' },
    ok: { unelevated: true, color: 'warning', label: 'Installieren' },
    persistent: true,
  }).onOk(() => {
    void updateFirmware(device);
  });
}

async function updateFirmware(device: ShellyDevice): Promise<void> {
  try {
    await shellyService.updateFirmware(device.id);
    $q.notify({
      type: 'positive',
      message: 'Update gestartet. Das Gerät startet gleich neu.',
      position: 'top',
    });
    firmware.value = { ...firmware.value, [device.id]: undefined };
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: errorMessage(err, 'Firmware-Update fehlgeschlagen'),
      position: 'top',
    });
  }
}

async function toggleMaintenance(device: ShellyDevice): Promise<void> {
  try {
    await shellyService.setMaintenance(device.id, !device.maintenance);
    $q.notify({
      type: 'positive',
      message: device.maintenance ? 'Wartung beendet' : 'Gerät ist in Wartung',
      position: 'top',
    });
    await loadDevices();
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: errorMessage(err, 'Wartungsmodus konnte nicht geändert werden'),
      position: 'top',
    });
  }
}

function confirmRetire(device: ShellyDevice): void {
  $q.dialog({
    title: 'Gerät ausmustern',
    message:
      '„' +
      device.name +
      '" wird aus der Liste entfernt. Wird es später wieder hinzugefügt, ' +
      'erhält es seinen alten Eintrag zurück.',
    cancel: { flat: true, label: 'Abbrechen' },
    ok: { flat: true, color: 'negative', label: 'Ausmustern' },
    persistent: true,
  }).onOk(() => {
    void retire(device);
  });
}

async function retire(device: ShellyDevice): Promise<void> {
  try {
    await shellyService.retireDevice(device.id);
    $q.notify({ type: 'positive', message: 'Gerät ausgemustert', position: 'top' });
    await loadDevices();
  } catch (err) {
    $q.notify({
      type: 'negative',
      message: errorMessage(err, 'Ausmustern fehlgeschlagen'),
      position: 'top',
    });
  }
}
</script>

<style scoped lang="scss">
.devices {
  &__toolbar {
    gap: 12px;
  }

  &__toolbar-actions {
    gap: 12px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 16px;
  }
}

.device-card {
  border-radius: 16px;
  display: flex;
  flex-direction: column;

  &__title {
    min-width: 0;
    word-break: break-word;
  }

  &__components {
    flex-grow: 1;
    padding: 8px 0;
  }

  &__firmware {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  &__actions {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
  }
}

.device-dialog {
  width: 560px;
  max-width: 95vw;

  &__host {
    gap: 12px;
  }

  &__found {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__actions {
    gap: 8px;
    padding: 12px 16px;
  }
}

.touch-button {
  min-height: 44px;
  min-width: 44px;
}

@media (max-width: 599px) {
  .devices__grid {
    grid-template-columns: 1fr;
  }
}
</style>
