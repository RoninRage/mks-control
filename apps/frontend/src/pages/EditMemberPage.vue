<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Mitglied bearbeiten</h1>
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

    <!-- Member Details -->
    <div v-if="member && !loading" class="ms-section">
      <div class="row q-col-gutter-lg">
        <!-- First Name -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="member.firstName"
            label="Vorname"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Last Name -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="member.lastName"
            label="Nachname"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Email -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="member.email"
            label="E-Mail"
            type="email"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Phone -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="member.phone"
            label="Telefon"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Join Date -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="formattedJoinDate"
            label="Beitrittsdatum"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Created At -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="formattedCreatedAt"
            label="Erstellt am"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Updated At -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="formattedUpdatedAt"
            label="Aktualisiert am"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Status -->
        <div class="col-12 col-sm-6">
          <q-toggle
            v-model="member.isActive"
            label="Aktiv"
            color="primary"
            :disable="loading || savingStatus"
            @update:model-value="updateStatus"
          />
        </div>

        <!-- ID (for reference) -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="member.id"
            label="Mitglieds-ID"
            outlined
            readonly
            dense
            class="full-width"
          />
        </div>

        <!-- Theme Preference -->
        <div class="col-12 col-sm-6">
          <q-select
            v-model="themePreference"
            :options="themeOptions"
            label="Bevorzugtes Design"
            outlined
            dense
            emit-value
            map-options
            @update:model-value="updateThemePreference"
            class="full-width"
          >
            <template #prepend>
              <q-icon name="palette" />
            </template>
          </q-select>
        </div>

        <!-- Rolle zuweisen Section -->
        <div v-if="userStore.canAssignRoles" class="col-12 q-mt-lg">
          <div class="q-mb-md">
            <h3 class="q-mb-md">Rolle zuweisen</h3>
            <p class="text-caption text-grey">
              Nur Administratoren und Vorstand können Rollen zuweisen
            </p>
          </div>

          <!-- Current Roles Display -->
          <div class="q-mb-md">
            <div class="text-subtitle2 q-mb-sm">Aktuelle Rollen:</div>
            <div class="row q-gutter-xs">
              <q-badge
                v-for="role in member.roles"
                :key="role"
                :color="getRoleColor(role)"
                class="q-pa-sm role-badge ms-badge"
              >
                <role-icon :role-id="role" class="role-badge-icon" />
                <span class="q-ml-xs">{{ getRoleLabel(role) }}</span>
                <q-icon
                  v-if="
                    role !== 'mitglied' &&
                    userStore.canAssignRoles &&
                    member.id !== userStore.memberId
                  "
                  name="close"
                  size="14px"
                  class="q-ml-xs cursor-pointer role-remove-icon"
                  @click="removeRole(role)"
                />
              </q-badge>
              <q-badge
                v-if="member.roles.length === 0"
                color="grey"
                label="Keine Rollen"
                class="ms-badge"
              />
            </div>
          </div>

          <!-- Role Selection -->
          <q-select
            v-if="availableRoleOptions.length > 0"
            v-model="selectedRoles"
            :options="availableRoleOptions"
            multiple
            outlined
            dense
            label="Rolle wählen"
            emit-value
            map-options
            :loading="isSavingRoles"
            :disable="member.id === userStore.memberId || isSavingRoles"
            @update:model-value="updateRoles"
            class="full-width"
          >
            <template #prepend>
              <q-icon name="admin_panel_settings" />
            </template>
            <template #selected>
              <span class="text-grey">Rolle wählen</span>
            </template>
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <role-icon :role-id="scope.opt.value" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>

          <div v-if="member.id === userStore.memberId" class="text-caption text-warning q-mt-sm">
            <q-icon name="warning" size="xs" class="q-mr-xs" />
            Sie können Ihre eigenen Rollen nicht ändern
          </div>
        </div>

        <!-- Bereichsleitung Areas Section -->
        <div v-if="member.roles.includes('bereichsleitung')" class="col-12 q-mt-lg">
          <div class="q-mb-md">
            <h3 class="q-mb-md">Bereichsleitung</h3>
            <p class="text-caption text-grey">Zugewiesene Bereiche für diese Bereichsleitung</p>
          </div>

          <q-card v-if="managedAreas.length === 0" flat bordered class="q-pa-md">
            <div class="text-caption text-grey">Keine Bereiche zugewiesen</div>
          </q-card>

          <div v-else class="row q-gutter-xs">
            <q-badge
              v-for="area in managedAreas"
              :key="area.id"
              color="primary"
              class="q-pa-sm ms-badge"
            >
              {{ area.name }}
            </q-badge>
          </div>
        </div>

        <!-- Tags Section -->
        <div class="col-12">
          <div class="q-mb-md">
            <h3 class="q-mb-md q-mt-lg">Tags verwalten</h3>
            <p class="text-caption text-grey">
              Scanne einen NFC-Tag um ihn diesem Mitglied zuzuweisen
            </p>
          </div>

          <!-- Assigned Tags List -->
          <div v-if="tags.length > 0" class="q-mb-lg">
            <div class="text-subtitle2 q-mb-md">Zugewiesene Tags ({{ tags.length }})</div>
            <div class="row q-gutter-md">
              <div v-for="tag in tags" :key="tag.id" class="tag-chip">
                <q-chip removable @remove="removeTag(tag.id)" class="full-width">
                  <q-icon name="nfc" size="sm" class="q-mr-sm" />
                  {{ tag.tagUid }}
                </q-chip>
              </div>
            </div>
          </div>
          <div v-else class="text-caption text-grey q-mb-lg">Noch keine Tags zugewiesen</div>

          <!-- Add Tag Button -->
          <q-btn
            :loading="scanningTag"
            label="Tag Scannen"
            color="primary"
            icon="nfc"
            @click="startTagScanning"
            class="touch-target"
          />
        </div>
      </div>

      <!-- Footer with action buttons -->
      <div class="row q-mt-lg q-gutter-md">
        <q-btn flat label="Zurück" color="primary" @click="goBack" class="touch-target" />
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import type { Member, Tag } from 'src/services/memberService';
import { memberService } from 'src/services/memberService';
import { areaService, type Area } from 'src/services/areaService';
import { authEventSource } from 'src/services/authEventSource';
import { useUserStore } from 'stores/user-store';
import RoleIcon from 'components/RoleIcon.vue';

defineOptions({
  name: 'EditMemberPage',
});

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const userStore = useUserStore();
const member = ref<Member | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const tags = ref<Tag[]>([]);
const scanningTag = ref(false);
const themePreference = ref<'light' | 'dark' | 'auto'>('auto');
const selectedRoles = ref<string[]>([]);
const isSavingRoles = ref(false);
const savingStatus = ref(false);
const areas = ref<Area[]>([]);

const themeOptions = [
  { label: 'Hell', value: 'light' },
  { label: 'Dunkel', value: 'dark' },
  { label: 'Automatisch', value: 'auto' },
];

const roleOptions = [
  { label: 'Admin', value: 'admin' },
  { label: 'Vorstand', value: 'vorstand' },
  { label: 'Bereichsleitung', value: 'bereichsleitung' },
  { label: 'Mitglied', value: 'mitglied' },
];

const availableRoleOptions = computed(() => {
  if (!member.value) return [];
  return roleOptions.filter((option) => !member.value.roles.includes(option.value));
});

const memberId = computed(() => route.params.id as string);

const managedAreas = computed(() => {
  if (!member.value) return [];
  return areas.value.filter((area) => area.bereichsleiterIds?.includes(member.value?.id || ''));
});

const formattedJoinDate = computed(() => {
  if (!member.value?.joinDate) return '';
  try {
    return new Date(member.value.joinDate).toLocaleDateString('de-DE');
  } catch {
    return member.value.joinDate;
  }
});

const formatDateTime = (value?: string): string => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('de-DE');
  } catch {
    return value;
  }
};

const formattedCreatedAt = computed(() => formatDateTime(member.value?.createdAt));
const formattedUpdatedAt = computed(() => formatDateTime(member.value?.updatedAt));

async function updateStatus(isActive: boolean) {
  if (!member.value) return;

  savingStatus.value = true;
  try {
    await memberService.updateMember(memberId.value, { isActive });
    member.value.isActive = isActive;
    $q.notify({
      type: 'positive',
      message: isActive ? 'Mitglied aktiviert' : 'Mitglied deaktiviert',
    });
  } catch (err) {
    console.error('Error updating status:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Aktualisieren des Status',
    });
    // Revert the toggle
    member.value.isActive = !isActive;
  } finally {
    savingStatus.value = false;
  }
}

async function updateThemePreference(theme: 'light' | 'dark' | 'auto') {
  try {
    await memberService.updateMemberTheme(memberId.value, theme);

    // If editing current user's profile, apply theme immediately
    if (memberId.value === userStore.memberId) {
      userStore.setPreferredTheme(theme);

      if (theme === 'dark') {
        $q.dark.set(true);
      } else if (theme === 'light') {
        $q.dark.set(false);
      } else {
        $q.dark.set('auto');
      }
    }

    $q.notify({
      type: 'positive',
      message: 'Design-Einstellung gespeichert',
    });
  } catch (err) {
    console.error('Error updating theme:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Speichern der Design-Einstellung',
    });
  }
}

const statusLabel = computed(() => {
  return member.value?.isActive ? 'Aktiv' : 'Inaktiv';
});

function getRoleColor(role: string): string {
  const roleColors: Record<string, string> = {
    admin: 'negative',
    vorstand: 'info',
    bereichsleitung: 'warning',
    mitglied: 'primary',
  };
  return roleColors[role] || 'grey';
}

function getRoleLabel(role: string): string {
  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    vorstand: 'Vorstand',
    bereichsleitung: 'Bereichsleitung',
    mitglied: 'Mitglied',
  };
  return roleLabels[role] || role;
}

async function updateRoles(newRoles: string[]) {
  if (!member.value || !userStore.memberId || !userStore.selectedRole?.id) {
    return;
  }

  // Ensure 'mitglied' role is always included
  if (!newRoles.includes('mitglied')) {
    $q.notify({
      type: 'warning',
      message: 'Die Rolle "Mitglied" kann nicht entfernt werden',
    });
    // Revert to current roles
    selectedRoles.value = member.value.roles;
    return;
  }

  isSavingRoles.value = true;

  try {
    const updatedMember = await memberService.updateMemberRoles(
      memberId.value,
      newRoles,
      userStore.memberId,
      userStore.selectedRole.id
    );

    // Update local member data
    member.value.roles = updatedMember.roles;
    selectedRoles.value = updatedMember.roles;

    $q.notify({
      type: 'positive',
      message: 'Rollen erfolgreich aktualisiert',
    });
  } catch (err) {
    console.error('Error updating roles:', err);
    const errorMessage =
      err instanceof Error ? err.message : 'Fehler beim Aktualisieren der Rollen';

    // Display specific error messages
    let notificationMessage = errorMessage;
    let notificationType: 'negative' | 'warning' = 'negative';

    if (errorMessage.includes('eigenen Rollen')) {
      notificationMessage = 'Sie können Ihre eigenen Rollen nicht ändern';
      notificationType = 'warning';
    } else if (errorMessage.includes('Administrator muss erhalten bleiben')) {
      notificationMessage = 'Mindestens ein Administrator muss erhalten bleiben';
      notificationType = 'warning';
    } else if (errorMessage.includes('Keine Berechtigung')) {
      notificationMessage = 'Sie haben keine Berechtigung zum Ändern von Rollen';
      notificationType = 'warning';
    } else if (errorMessage.includes('Mitglied') && errorMessage.includes('entfernt')) {
      notificationMessage = 'Die Rolle "Mitglied" kann nicht entfernt werden';
      notificationType = 'warning';
    }

    $q.notify({
      type: notificationType,
      message: notificationMessage,
    });

    // Revert to current roles
    selectedRoles.value = member.value.roles;
  } finally {
    isSavingRoles.value = false;
  }
}

async function removeRole(roleToRemove: string) {
  if (!member.value) return;

  // Prevent removing 'mitglied' role
  if (roleToRemove === 'mitglied') {
    $q.notify({
      type: 'warning',
      message: 'Die Rolle "Mitglied" kann nicht entfernt werden',
    });
    return;
  }

  // Check if removing last admin
  if (roleToRemove === 'admin') {
    try {
      const allMembers = await memberService.getMembers();
      const activeAdmins = allMembers.filter(
        (m) => m.isActive && m.roles.includes('admin') && m.id !== member.value?.id
      );

      if (activeAdmins.length === 0) {
        $q.notify({
          type: 'warning',
          message: 'Mindestens ein aktiver Administrator muss erhalten bleiben',
        });
        return;
      }
    } catch (err) {
      console.error('Error checking for other admins:', err);
      $q.notify({
        type: 'negative',
        message: 'Fehler beim Überprüfen der Administratoren',
      });
      return;
    }
  }

  const newRoles = member.value.roles.filter((r) => r !== roleToRemove);
  await updateRoles(newRoles);
}

async function loadMember() {
  loading.value = true;
  error.value = null;
  try {
    const members = await memberService.getMembers();
    const foundMember = members.find((m) => m.id === memberId.value);
    if (!foundMember) {
      error.value = 'Mitglied nicht gefunden';
      return;
    }
    member.value = foundMember;
    themePreference.value = foundMember.preferredTheme || 'auto';
    selectedRoles.value = foundMember.roles || [];
    await loadAreas();
    await loadTags();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Fehler beim Laden des Mitglieds';
    console.error('Error loading member:', err);
  } finally {
    loading.value = false;
  }
}

async function loadAreas() {
  try {
    areas.value = await areaService.getAreas();
  } catch (err) {
    console.error('Error loading areas:', err);
  }
}

async function loadTags() {
  try {
    const fetchedTags = await memberService.getTags(memberId.value);
    tags.value = fetchedTags.sort((a, b) => {
      const aTime = Date.parse(a.createdAt);
      const bTime = Date.parse(b.createdAt);
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return a.createdAt.localeCompare(b.createdAt);
      }
      return aTime - bTime;
    });
  } catch (err) {
    console.error('Error loading tags:', err);
    $q.notify({
      type: 'negative',
      message: 'Fehler beim Laden der Tags',
    });
  }
}

function startTagScanning() {
  scanningTag.value = true;
  let tagReceived = false;

  // Enable tag assignment mode to prevent logout during scanning
  authEventSource.setTagAssignmentMode(true);

  const handleTag = (event: { uid: string }) => {
    if (tagReceived) return; // Ignore additional scans
    tagReceived = true;
    handleTagScanned(event.uid);
  };

  authEventSource.onTag(handleTag);

  // Set timeout for scanning (30 seconds)
  const scanTimeout = setTimeout(() => {
    scanningTag.value = false;
    authEventSource.setTagAssignmentMode(false); // Disable tag assignment mode on timeout
    if (!tagReceived) {
      $q.notify({
        type: 'info',
        message: 'Tag-Scan abgebrochen',
      });
    }
  }, 30000);
}

async function handleTagScanned(tagUid: string) {
  try {
    scanningTag.value = true;
    await memberService.addTag(memberId.value, tagUid);
    await loadTags();
    $q.notify({
      type: 'positive',
      message: 'Tag erfolgreich zugewiesen',
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Fehler beim Zuweisen des Tags';
    console.error('Error adding tag:', err);
    $q.notify({
      type: 'negative',
      message: errorMessage,
    });
  } finally {
    scanningTag.value = false;
    authEventSource.setTagAssignmentMode(false); // Disable tag assignment mode after handling
  }
}

async function removeTag(tagId: string) {
  try {
    $q.dialog({
      title: 'Tag entfernen',
      message: 'Möchten Sie diesen Tag wirklich entfernen?',
      cancel: {
        flat: true,
        label: 'Abbrechen',
      },
      ok: {
        flat: true,
        label: 'Entfernen',
        color: 'negative',
      },
    }).onOk(async () => {
      try {
        await memberService.removeTag(tagId);
        await loadTags();
        $q.notify({
          type: 'positive',
          message: 'Tag entfernt',
        });
      } catch (err) {
        console.error('Error removing tag:', err);
        $q.notify({
          type: 'negative',
          message: 'Fehler beim Entfernen des Tags',
        });
      }
    });
  } catch (err) {
    console.error('Error in removeTag:', err);
  }
}

function goBack() {
  const sourceValue = Array.isArray(route.query.source)
    ? route.query.source[0]
    : route.query.source;
  if (sourceValue === 'profile') {
    router.replace('/dashboard');
    return;
  }
  router.replace('/members');
}

onMounted(() => {
  loadMember();
});
</script>

<style scoped lang="scss">
.touch-target {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 24px;
}

.tag-chip {
  max-width: 200px;
}

.role-badge {
  display: inline-flex;
  align-items: center;
}

.role-badge-icon {
  width: 16px;
  height: 16px;
}

.role-remove-icon {
  opacity: 0.7;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}
</style>
