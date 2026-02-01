<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">{{ pageTitle }}</h1>
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

    <!-- Loading State -->
    <div v-if="loading" class="ms-section">
      <q-linear-progress indeterminate color="primary" />
    </div>

    <!-- Error State -->
    <div v-if="error" class="ms-section">
      <q-banner class="bg-negative text-white">
        <template #avatar>
          <q-icon name="error" />
        </template>
        {{ error }}
      </q-banner>
    </div>

    <!-- Area Details -->
    <div v-if="area && !loading" class="ms-section">
      <div class="row q-col-gutter-lg">
        <!-- Name -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="area.name"
            label="Name"
            outlined
            :disable="loading || saving"
            dense
            class="full-width"
          />
        </div>

        <!-- ID (for reference) -->
        <div v-if="!isCreate" class="col-12 col-sm-6">
          <q-input
            v-model="area.id"
            label="Bereichs-ID"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Description -->
        <div class="col-12">
          <q-input
            v-model="area.description"
            label="Beschreibung"
            type="textarea"
            autogrow
            outlined
            :disable="loading || saving"
            dense
            class="full-width"
          />
        </div>

        <!-- Bereichsleiter Management -->
        <div class="col-12">
          <div class="q-mb-md">
            <h3 class="q-mb-md q-mt-lg">Bereichsleitung zuweisen</h3>
            <p class="text-caption text-grey">
              Wählen Sie Mitglieder aus, die als Bereichsleitung für diesen Bereich verantwortlich
              sind
            </p>
          </div>

          <!-- Assigned Bereichsleiter -->
          <div v-if="assignedBereichsleiter.length > 0" class="q-mb-lg">
            <div class="text-subtitle2 q-mb-md">
              Zugewiesene Bereichsleiter ({{ assignedBereichsleiter.length }})
            </div>
            <div class="row q-gutter-md">
              <div
                v-for="member in assignedBereichsleiter"
                :key="member.id"
                class="bereichsleiter-chip"
              >
                <q-chip
                  removable
                  @remove="removeBereichsleiter(member.id)"
                  class="full-width"
                  :disable="loading || saving"
                >
                  <q-avatar>
                    <q-icon name="person" />
                  </q-avatar>
                  {{ member.firstName }} {{ member.lastName }}
                </q-chip>
              </div>
            </div>
          </div>
          <div v-else class="text-caption text-grey q-mb-lg">
            Noch keine Bereichsleiter zugewiesen
          </div>

          <!-- Add Bereichsleiter -->
          <q-select
            v-model="selectedMember"
            :options="availableMembers"
            label="Bereichsleiter hinzufügen"
            outlined
            dense
            emit-value
            map-options
            clearable
            behavior="dialog"
            :disable="loading || saving"
            @update:model-value="addBereichsleiter"
            class="full-width"
          >
            <template #prepend>
              <q-icon name="person_add" />
            </template>
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-icon name="person" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption>{{ scope.opt.email }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>
      </div>

      <!-- Footer with action buttons -->
      <div class="row q-mt-lg q-gutter-md">
        <q-btn
          :loading="saving"
          :label="saveLabel"
          color="primary"
          @click="saveArea"
          class="touch-target"
        />
        <q-btn flat label="Zurück" color="primary" @click="goBack" class="touch-target" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { areaService, type Area } from 'src/services/areaService';
import { memberService, type Member } from 'src/services/memberService';

defineOptions({
  name: 'EditAreaPage',
});

const router = useRouter();
const route = useRoute();
const $q = useQuasar();

const loading = ref(false);
const error = ref<string | null>(null);
const area = ref<Area | null>(null);
const saving = ref(false);
const members = ref<Member[]>([]);
const selectedMember = ref<string | null>(null);

const areaId = computed(() => route.params.id as string | undefined);
const isCreate = computed(() => !areaId.value);
const pageTitle = computed(() => (isCreate.value ? 'Bereich erstellen' : 'Bereich bearbeiten'));
const saveLabel = computed(() => (isCreate.value ? 'Erstellen' : 'Speichern'));

const isBereichsleitungOnly = (member: Member): boolean =>
  member.roles.includes('bereichsleitung') && !member.roles.includes('admin');

const assignedBereichsleiter = computed(() => {
  if (!area.value?.bereichsleiterIds || members.value.length === 0) return [];
  return members.value.filter(
    (m) => isBereichsleitungOnly(m) && area.value?.bereichsleiterIds?.includes(m.id)
  );
});

const availableMembers = computed(() => {
  const assignedIds = area.value?.bereichsleiterIds || [];
  return members.value
    .filter((m) => isBereichsleitungOnly(m) && !assignedIds.includes(m.id))
    .map((m) => ({
      label: `${m.firstName} ${m.lastName}`,
      value: m.id,
      email: m.email || '',
    }));
});

async function loadArea() {
  if (isCreate.value) {
    area.value = {
      id: '',
      name: '',
      description: '',
      bereichsleiterIds: [],
    };
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    area.value = await areaService.getArea(areaId.value as string);
    if (!area.value.bereichsleiterIds) {
      area.value.bereichsleiterIds = [];
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Fehler beim Laden des Bereichs';
    console.error('Error loading area:', err);
  } finally {
    loading.value = false;
  }
}

async function loadMembers() {
  try {
    members.value = await memberService.getMembers();
  } catch (err) {
    console.error('Error loading members:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Laden der Mitglieder',
      position: 'top',
    });
  }
}

function goBack() {
  router.back();
}

function addBereichsleiter(memberId: string | null) {
  if (!memberId || !area.value) return;
  if (!area.value.bereichsleiterIds) {
    area.value.bereichsleiterIds = [];
  }
  if (!area.value.bereichsleiterIds.includes(memberId)) {
    area.value.bereichsleiterIds.push(memberId);
  }
  selectedMember.value = null;
}

function removeBereichsleiter(memberId: string) {
  if (!area.value?.bereichsleiterIds) return;
  area.value.bereichsleiterIds = area.value.bereichsleiterIds.filter((id) => id !== memberId);
}

async function saveArea() {
  if (!area.value) return;
  saving.value = true;
  try {
    if (isCreate.value) {
      const created = await areaService.createArea({
        id: area.value.id,
        name: area.value.name,
        description: area.value.description,
        bereichsleiterIds: area.value.bereichsleiterIds,
      });
      area.value = { ...area.value, ...created };
      $q.notify({
        type: 'positive',
        message: 'Bereich erstellt',
        position: 'top',
      });
      await router.push('/areas');
      return;
    }
    const updated = await areaService.updateArea(areaId.value as string, {
      id: area.value.id,
      name: area.value.name,
      description: area.value.description,
      bereichsleiterIds: area.value.bereichsleiterIds,
    });
    area.value = { ...area.value, ...updated };
    $q.notify({
      type: 'positive',
      message: 'Bereich gespeichert',
      position: 'top',
    });
  } catch (err) {
    console.error('Error saving area:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Speichern des Bereichs',
      position: 'top',
    });
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadMembers(), loadArea()]);
});
</script>

<style scoped lang="scss">
.touch-target {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 24px;
}

.bereichsleiter-chip {
  max-width: 300px;
}
</style>
