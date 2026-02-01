<template>
  <div class="ms-container q-pa-md">
    <!-- Header -->
    <div class="row items-center justify-between q-mb-lg">
      <h1 class="text-h3 q-my-none">Ausstattungsberechtigungen</h1>
      <q-btn flat icon="arrow_back" @click="goBack" class="touch-button" />
    </div>

    <!-- Loading state -->
    <q-linear-progress v-if="store.loading" indeterminate />

    <!-- Error banner -->
    <q-banner v-if="store.error" class="bg-negative text-white q-mb-md">
      {{ store.error }}
    </q-banner>

    <!-- No areas available -->
    <q-card v-if="!store.loading && displayedAreas.length === 0" class="q-pa-lg text-center">
      <q-icon name="folder_off" size="48px" color="primary" class="q-mb-md" />
      <p class="text-h6">Keine Bereiche verfügbar</p>
      <p class="text-body2">
        Sie haben keinen Zugriff auf Bereiche zur Verwaltung von Ausstattungsberechtigungen.
      </p>
    </q-card>

    <!-- Main layout -->
    <div v-else class="ausstattung-layout">
      <!-- Desktop: 3-column layout -->
      <div class="row q-col-gutter-md ausstattung-desktop">
        <!-- Column 1: Areas -->
        <div class="col-12 col-md-4">
          <div class="ausstattung-panel">
            <h3 class="text-h6 q-my-none q-mb-md">Bereiche</h3>
            <q-linear-progress v-if="store.loading" indeterminate class="q-mb-md" />
            <q-list bordered separator>
              <q-item
                v-for="area in displayedAreas"
                :key="area.id"
                clickable
                :active="store.selectedAreaId === area.id"
                active-class="bg-primary text-white"
                @click="store.selectArea(area.id)"
                class="touch-item"
              >
                <q-item-section>
                  <q-item-label>{{ area.name }}</q-item-label>
                  <q-item-label caption>{{ area.description }}</q-item-label>
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </div>

        <!-- Column 2: Equipment -->
        <div class="col-12 col-md-4">
          <div class="ausstattung-panel">
            <div v-if="store.selectedAreaId">
              <h3 class="text-h6 q-my-none q-mb-md">{{ store.selectedArea?.name }} - Geräte</h3>
              <q-linear-progress v-if="store.loading" indeterminate class="q-mb-md" />
              <q-card v-if="store.areaEquipment.length === 0" class="bg-info text-white">
                <q-card-section>
                  <p class="q-my-none">Keine Geräte in diesem Bereich</p>
                </q-card-section>
              </q-card>
              <q-list v-else bordered separator>
                <q-item
                  v-for="equip in store.areaEquipment"
                  :key="equip.id"
                  clickable
                  :active="store.selectedEquipmentId === equip.id"
                  active-class="bg-primary text-white"
                  @click="store.selectEquipment(equip.id)"
                  class="touch-item"
                >
                  <q-item-section>
                    <q-item-label>{{ equip.name }}</q-item-label>
                    <q-item-label caption>{{ equip.configuration }}</q-item-label>
                  </q-item-section>
                  <q-item-section side top>
                    <q-icon
                      :name="equip.isAvailable ? 'check_circle' : 'cancel'"
                      :color="equip.isAvailable ? 'positive' : 'negative'"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
            <div v-else class="text-center text-muted q-pa-md">
              <p>Wählen Sie einen Bereich aus</p>
            </div>
          </div>
        </div>

        <!-- Column 3: Members & Permissions -->
        <div class="col-12 col-md-4">
          <div class="ausstattung-panel">
            <div v-if="store.selectedEquipmentId && store.selectedAreaId">
              <h3 class="text-h6 q-my-none q-mb-md">
                {{ store.selectedEquipment?.name }} - Mitglieder
              </h3>

              <!-- Search input -->
              <q-input
                v-model="store.searchQuery"
                filled
                dense
                placeholder="Mitglied suchen..."
                icon="search"
                class="q-mb-md"
              />

              <q-linear-progress v-if="store.loading" indeterminate class="q-mb-md" />

              <!-- Members list -->
              <q-card v-if="store.filteredMembers.length === 0" class="bg-info text-white">
                <q-card-section>
                  <p class="q-my-none">Keine Mitglieder gefunden</p>
                </q-card-section>
              </q-card>
              <q-list v-else bordered separator>
                <q-item v-for="member in store.filteredMembers" :key="member.id" class="touch-item">
                  <q-item-section>
                    <q-item-label> {{ member.firstName }} {{ member.lastName }} </q-item-label>
                    <q-item-label caption>{{ member.email }}</q-item-label>
                  </q-item-section>
                  <q-item-section side top>
                    <q-toggle
                      :model-value="store.getMemberPermission(member.id, store.selectedEquipmentId)"
                      @update:model-value="togglePermission(member.id, $event)"
                      :disable="store.loading"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
            <div v-else class="text-center text-muted q-pa-md">
              <p>Wählen Sie ein Gerät aus</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile: Step-by-step layout -->
      <div class="ausstattung-mobile">
        <!-- Step 1: Areas -->
        <div v-if="mobileStep === 'areas'" class="ausstattung-mobile-step">
          <div class="row items-center q-mb-md">
            <h2 class="text-h5 q-my-none flex-grow">Bereiche auswählen</h2>
          </div>

          <q-linear-progress v-if="store.loading" indeterminate class="q-mb-md" />

          <q-card v-if="displayedAreas.length === 0" class="bg-info text-white">
            <q-card-section>
              <p class="q-my-none">Keine Bereiche verfügbar</p>
            </q-card-section>
          </q-card>

          <q-list v-else bordered separator>
            <q-item
              v-for="area in displayedAreas"
              :key="area.id"
              clickable
              @click="selectAreaMobile(area.id)"
              class="touch-item"
            >
              <q-item-section>
                <q-item-label>{{ area.name }}</q-item-label>
                <q-item-label caption>{{ area.description }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-icon name="arrow_forward" />
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Step 2: Equipment -->
        <div v-if="mobileStep === 'equipment'" class="ausstattung-mobile-step">
          <div class="row items-center q-mb-md">
            <q-btn flat icon="arrow_back" @click="mobileStep = 'areas'" class="touch-button" />
            <h2 class="text-h5 q-my-none flex-grow q-ml-sm">
              {{ store.selectedArea?.name }}
            </h2>
          </div>

          <q-linear-progress v-if="store.loading" indeterminate class="q-mb-md" />

          <q-card v-if="store.areaEquipment.length === 0" class="bg-info text-white">
            <q-card-section>
              <p class="q-my-none">Keine Geräte in diesem Bereich</p>
            </q-card-section>
          </q-card>

          <q-list v-else bordered separator>
            <q-item
              v-for="equip in store.areaEquipment"
              :key="equip.id"
              clickable
              @click="selectEquipmentMobile(equip.id)"
              class="touch-item"
            >
              <q-item-section>
                <q-item-label>{{ equip.name }}</q-item-label>
                <q-item-label caption>{{ equip.configuration }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-icon name="arrow_forward" />
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Step 3: Members & Permissions -->
        <div v-if="mobileStep === 'members'" class="ausstattung-mobile-step">
          <div class="row items-center q-mb-md">
            <q-btn flat icon="arrow_back" @click="mobileStep = 'equipment'" class="touch-button" />
            <h2 class="text-h6 q-my-none flex-grow q-ml-sm">
              {{ store.selectedEquipment?.name }}
            </h2>
          </div>

          <!-- Search input -->
          <q-input
            v-model="store.searchQuery"
            filled
            dense
            placeholder="Mitglied suchen..."
            icon="search"
            class="q-mb-md"
          />

          <q-linear-progress v-if="store.loading" indeterminate class="q-mb-md" />

          <q-card v-if="store.filteredMembers.length === 0" class="bg-info text-white">
            <q-card-section>
              <p class="q-my-none">Keine Mitglieder gefunden</p>
            </q-card-section>
          </q-card>

          <q-list v-else bordered separator>
            <q-item v-for="member in store.filteredMembers" :key="member.id" class="touch-item">
              <q-item-section>
                <q-item-label> {{ member.firstName }} {{ member.lastName }} </q-item-label>
                <q-item-label caption>{{ member.email }}</q-item-label>
              </q-item-section>
              <q-item-section side top>
                <q-toggle
                  :model-value="
                    store.selectedEquipmentId
                      ? store.getMemberPermission(member.id, store.selectedEquipmentId)
                      : false
                  "
                  @update:model-value="togglePermission(member.id, $event)"
                  :disable="store.loading"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAusstattungStore } from '../stores/ausstattung-store';
import { useUserStore } from '../stores/user-store';

defineOptions({ name: 'AusstattungsPage' });

const router = useRouter();
const $q = useQuasar();
const store = useAusstattungStore();
const userStore = useUserStore();

const mobileStep = ref<'areas' | 'equipment' | 'members'>('areas');

const displayedAreas = computed(() => {
  const roleId = userStore.selectedRole?.id;
  if (roleId === 'admin' || roleId === 'vorstand') {
    return store.areas;
  }

  const memberId = userStore.memberId || localStorage.getItem('memberId');
  if (!memberId) {
    return [];
  }

  return store.areas.filter((area) => area.bereichsleiterIds?.includes(memberId));
});

const goBack = () => {
  router.replace('/dashboard');
};

const selectAreaMobile = (areaId: string) => {
  store.selectArea(areaId);
  mobileStep.value = 'equipment';
};

const selectEquipmentMobile = (equipmentId: string) => {
  store.selectEquipment(equipmentId);
  mobileStep.value = 'members';
};

const togglePermission = async (memberId: string, allowed: boolean) => {
  if (!store.selectedEquipmentId) return;

  try {
    await store.toggleMemberEquipmentPermission(memberId, store.selectedEquipmentId, allowed);
    $q.notify({
      type: 'positive',
      message: 'Berechtigung aktualisiert',
      position: 'top',
    });
  } catch (error) {
    $q.notify({
      type: 'negative',
      message: `Fehler beim Aktualisieren der Berechtigung: ${(error as Error).message}`,
      position: 'top',
    });
  }
};

onMounted(async () => {
  const roleId = userStore.selectedRole?.id || 'mitglied';
  await store.initializeStore(roleId);
});
</script>

<style scoped lang="scss">
.ausstattung-layout {
  display: flex;
  flex-direction: column;

  .ausstattung-desktop {
    display: none;

    @media (min-width: 1024px) {
      display: flex;
    }
  }

  .ausstattung-mobile {
    display: flex;
    flex-direction: column;

    @media (min-width: 1024px) {
      display: none;
    }
  }
}

.ausstattung-panel {
  background: var(--ms-surface);
  border-radius: 16px;
  padding: 16px;
  min-height: 400px;
}

.ausstattung-mobile-step {
  width: 100%;
}

.touch-item {
  min-height: 48px;
  padding: 12px 16px;

  &:hover {
    background-color: var(--ms-surface-2);
  }
}

.touch-button {
  min-width: 44px;
  min-height: 44px;
}

.text-muted {
  color: var(--ms-muted);
}

.flex-grow {
  flex-grow: 1;
}
</style>
