<template>
  <q-page class="ms-container" data-testid="terminals-page">
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Terminals</h1>
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
      <p class="text-body1 text-grey-7">
        Ein Terminal ist der Raspberry Pi an einer Maschine. Mitglieder melden sich dort per Tag an.
      </p>
    </div>

    <div v-if="loading" class="ms-section">
      <q-linear-progress indeterminate color="primary" />
    </div>

    <div v-if="error" class="ms-section">
      <q-banner class="bg-negative text-white" data-testid="terminals-error">
        {{ error }}
      </q-banner>
    </div>

    <div v-if="!loading && terminals.length === 0" class="ms-section" data-testid="terminals-empty">
      <q-card flat bordered class="text-center q-pa-lg">
        <q-icon name="tablet_mac" size="64px" color="grey-5" class="q-mb-md" />
        <div class="text-h6 q-mb-sm">Noch keine Terminals</div>
        <q-btn
          unelevated
          color="primary"
          label="Terminal anlegen"
          icon="add"
          size="lg"
          class="q-mt-md touch-button"
          data-testid="terminals-empty-add"
          @click="openCreateDialog"
        />
      </q-card>
    </div>

    <div v-if="!loading && terminals.length > 0" class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <div class="text-h6" data-testid="terminals-count">{{ terminals.length }} Terminals</div>
        <q-btn
          unelevated
          color="primary"
          label="Terminal anlegen"
          icon="add"
          class="touch-button"
          data-testid="terminals-add"
          @click="openCreateDialog"
        />
      </div>

      <div class="terminals__grid">
        <q-card
          v-for="terminal in terminals"
          :key="terminal.id"
          flat
          bordered
          class="terminal-card"
          data-testid="terminal-card"
          :data-terminal-id="terminal.id"
        >
          <q-card-section>
            <div class="text-h6" data-testid="terminal-card-name">{{ terminal.name }}</div>
            <div class="text-body2 text-grey-7" data-testid="terminal-card-equipment">
              Maschine: {{ equipmentName(terminal.equipmentId) }}
            </div>
          </q-card-section>
          <q-list dense>
            <q-item>
              <q-item-section>Höchstdauer je Freigabe</q-item-section>
              <q-item-section side>
                {{ terminal.maxSessionMinutes ? `${terminal.maxSessionMinutes} min` : 'keine' }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Antwortzeit „Noch da?"</q-item-section>
              <q-item-section side>{{ terminal.stillThereTimeoutMinutes ?? 5 }} min</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Letzter Kontakt</q-item-section>
              <q-item-section side data-testid="terminal-card-last-seen">
                {{ formatDate(terminal.lastSeenAt) }}
              </q-item-section>
            </q-item>
          </q-list>
          <q-card-actions class="terminal-card__actions">
            <q-btn
              flat
              color="primary"
              label="Bearbeiten"
              icon="edit"
              class="touch-button"
              data-testid="terminal-card-edit"
              @click="openEditDialog(terminal)"
            />
            <q-btn
              flat
              color="primary"
              label="Neuer Schlüssel"
              icon="key"
              class="touch-button"
              data-testid="terminal-card-rotate"
              @click="confirmRotate(terminal)"
            />
            <q-btn
              flat
              color="negative"
              label="Löschen"
              icon="delete"
              class="touch-button"
              data-testid="terminal-card-delete"
              @click="confirmDelete(terminal)"
            />
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Create / edit -->
    <q-dialog v-model="form.open" persistent>
      <q-card class="terminal-dialog" data-testid="terminal-form">
        <q-card-section>
          <div class="text-h6">{{ form.id ? 'Terminal bearbeiten' : 'Terminal anlegen' }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            v-model="form.name"
            outlined
            label="Name"
            maxlength="100"
            data-testid="terminal-form-name"
          />
          <q-select
            v-model="form.equipmentId"
            outlined
            emit-value
            map-options
            label="Maschine"
            :options="equipmentOptions"
            data-testid="terminal-form-equipment"
          />
          <q-input
            v-model.number="form.maxSessionMinutes"
            outlined
            type="number"
            min="1"
            label="Höchstdauer je Freigabe (Minuten)"
            hint="Danach fragt der Pi „Noch da?“. Leer = keine Höchstdauer."
            data-testid="terminal-form-max-session"
          />
          <q-input
            v-model.number="form.stillThereTimeoutMinutes"
            outlined
            type="number"
            min="1"
            label="Antwortzeit für „Noch da?“ (Minuten)"
            data-testid="terminal-form-still-there"
          />
          <q-banner
            v-if="form.error"
            class="bg-negative text-white"
            data-testid="terminal-form-error"
          >
            {{ form.error }}
          </q-banner>
        </q-card-section>
        <q-card-actions align="right" class="terminal-dialog__actions">
          <q-btn
            flat
            color="primary"
            label="Abbrechen"
            class="touch-button"
            @click="form.open = false"
          />
          <q-btn
            unelevated
            color="primary"
            :label="form.id ? 'Speichern' : 'Anlegen'"
            class="touch-button"
            data-testid="terminal-form-submit"
            :loading="form.saving"
            :disable="!form.name.trim() || !form.equipmentId"
            @click="submitForm"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Key shown once -->
    <q-dialog v-model="tokenDialog.open" persistent>
      <q-card class="terminal-dialog" data-testid="terminal-token-dialog">
        <q-card-section>
          <div class="text-h6">Schlüssel für „{{ tokenDialog.terminalName }}“</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-banner class="bg-warning">
            Der Schlüssel wird nur jetzt angezeigt. Bitte sofort auf dem Pi eintragen.
          </q-banner>
          <q-input
            :model-value="tokenDialog.token"
            outlined
            readonly
            label="Terminal-Schlüssel"
            data-testid="terminal-token-value"
          >
            <template #append>
              <q-btn
                flat
                round
                icon="content_copy"
                aria-label="Kopieren"
                class="touch-button"
                data-testid="terminal-token-copy"
                @click="copyToken"
              />
            </template>
          </q-input>
          <div class="text-body2">
            Auf dem Pi:
            <ol class="q-my-sm">
              <li>In <code>nfc-bridge/.env</code> als <code>TERMINAL_TOKEN=…</code> eintragen.</li>
              <li>Im Browser <code>/terminal</code> öffnen und den Schlüssel dort einfügen.</li>
            </ol>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            unelevated
            color="primary"
            label="Fertig"
            class="touch-button"
            data-testid="terminal-token-done"
            @click="tokenDialog.open = false"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { copyToClipboard, useQuasar } from 'quasar';
import type { Equipment, TerminalSummary } from '@mks-control/shared-types';
import { equipmentService } from 'src/services/equipmentService';
import { terminalAdminService } from 'src/services/terminalService';
import { useUserStore } from 'stores/user-store';

defineOptions({
  name: 'TerminalsPage',
});

interface SelectOption {
  label: string;
  value: string;
}

const router = useRouter();
const $q = useQuasar();
const userStore = useUserStore();

const loading = ref(false);
const error = ref<string | null>(null);
const terminals = ref<TerminalSummary[]>([]);
const equipment = ref<Equipment[]>([]);

const form = reactive({
  open: false,
  id: null as string | null,
  name: '',
  equipmentId: '' as string,
  maxSessionMinutes: null as number | null,
  stillThereTimeoutMinutes: 5 as number | null,
  saving: false,
  error: null as string | null,
});

const tokenDialog = reactive({
  open: false,
  terminalName: '',
  token: '',
});

// Machines without a terminal, plus the one of the terminal being edited.
const equipmentOptions = computed((): SelectOption[] => {
  const taken = new Set(terminals.value.filter((t) => t.id !== form.id).map((t) => t.equipmentId));
  return equipment.value
    .filter((e) => !taken.has(e.id))
    .map((e) => ({ label: e.name, value: e.id }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
});

onMounted(async () => {
  if (!userStore.can('manage:devices')) {
    void router.replace('/dashboard');
    return;
  }
  await load();
});

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [terminalList, equipmentList] = await Promise.all([
      terminalAdminService.list(),
      equipmentService.getEquipment(),
    ]);
    terminals.value = terminalList;
    equipment.value = equipmentList;
  } catch (err) {
    error.value = errorMessage(err, 'Fehler beim Laden der Terminals');
  } finally {
    loading.value = false;
  }
}

function equipmentName(id: string): string {
  return equipment.value.find((e) => e.id === id)?.name ?? 'unbekannt';
}

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString('de-DE') : 'noch nie';
}

function goBack(): void {
  void router.replace('/dashboard');
}

function openCreateDialog(): void {
  Object.assign(form, {
    open: true,
    id: null,
    name: '',
    equipmentId: '',
    maxSessionMinutes: null,
    stillThereTimeoutMinutes: 5,
    error: null,
  });
}

function openEditDialog(terminal: TerminalSummary): void {
  Object.assign(form, {
    open: true,
    id: terminal.id,
    name: terminal.name,
    equipmentId: terminal.equipmentId,
    maxSessionMinutes: terminal.maxSessionMinutes ?? null,
    stillThereTimeoutMinutes: terminal.stillThereTimeoutMinutes ?? 5,
    error: null,
  });
}

// q-input with type=number yields '' when cleared.
const minutesOrNull = (value: number | null | string): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function showToken(terminalName: string, token: string): void {
  Object.assign(tokenDialog, { open: true, terminalName, token });
}

async function submitForm(): Promise<void> {
  form.saving = true;
  form.error = null;
  const data = {
    name: form.name.trim(),
    equipmentId: form.equipmentId,
    maxSessionMinutes: minutesOrNull(form.maxSessionMinutes),
    stillThereTimeoutMinutes: minutesOrNull(form.stillThereTimeoutMinutes),
  };
  try {
    if (form.id) {
      await terminalAdminService.update(form.id, data);
      $q.notify({ type: 'positive', message: 'Terminal gespeichert', position: 'top' });
    } else {
      const created = await terminalAdminService.create(data);
      showToken(created.terminal.name, created.token);
    }
    form.open = false;
    await load();
  } catch (err) {
    form.error = errorMessage(err, 'Terminal konnte nicht gespeichert werden');
  } finally {
    form.saving = false;
  }
}

function confirmRotate(terminal: TerminalSummary): void {
  $q.dialog({
    title: 'Neuen Schlüssel erzeugen',
    message:
      'Der bisherige Schlüssel von „' +
      terminal.name +
      '“ funktioniert danach nicht mehr. Der Pi muss neu eingerichtet werden.',
    cancel: { flat: true, label: 'Abbrechen' },
    ok: { unelevated: true, color: 'primary', label: 'Neuer Schlüssel' },
    persistent: true,
  }).onOk(() => {
    void rotate(terminal);
  });
}

async function rotate(terminal: TerminalSummary): Promise<void> {
  try {
    const result = await terminalAdminService.rotateToken(terminal.id);
    showToken(result.terminal.name, result.token);
  } catch (err) {
    $q.notify({ type: 'negative', message: errorMessage(err, 'Fehler'), position: 'top' });
  }
}

function confirmDelete(terminal: TerminalSummary): void {
  $q.dialog({
    title: 'Terminal löschen',
    message:
      '„' + terminal.name + '“ wird gelöscht. Sein Schlüssel funktioniert danach nicht mehr.',
    cancel: { flat: true, label: 'Abbrechen' },
    ok: { flat: true, color: 'negative', label: 'Löschen' },
    persistent: true,
  }).onOk(() => {
    void remove(terminal);
  });
}

async function remove(terminal: TerminalSummary): Promise<void> {
  try {
    await terminalAdminService.remove(terminal.id);
    $q.notify({ type: 'positive', message: 'Terminal gelöscht', position: 'top' });
    await load();
  } catch (err) {
    $q.notify({ type: 'negative', message: errorMessage(err, 'Fehler'), position: 'top' });
  }
}

function copyToken(): void {
  copyToClipboard(tokenDialog.token)
    .then(() => $q.notify({ type: 'positive', message: 'Schlüssel kopiert', position: 'top' }))
    .catch(() =>
      $q.notify({ type: 'warning', message: 'Bitte manuell kopieren', position: 'top' })
    );
}
</script>

<style scoped lang="scss">
.terminals__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.terminal-card {
  border-radius: 16px;
  display: flex;
  flex-direction: column;

  &__actions {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
    margin-top: auto;
  }
}

.terminal-dialog {
  width: 560px;
  max-width: 95vw;

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
  .terminals__grid {
    grid-template-columns: 1fr;
  }
}
</style>
