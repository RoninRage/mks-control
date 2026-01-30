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

        <!-- Status -->
        <div class="col-12 col-sm-6">
          <q-input
            :model-value="statusLabel"
            label="Status"
            outlined
            readonly
            dense
            class="full-width"
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
import { authEventSource } from 'src/services/authEventSource';
import { useUserStore } from 'stores/user-store';

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

const themeOptions = [
  { label: 'Hell', value: 'light' },
  { label: 'Dunkel', value: 'dark' },
  { label: 'Automatisch', value: 'auto' },
];

const memberId = computed(() => route.params.id as string);

const formattedJoinDate = computed(() => {
  if (!member.value?.joinDate) return '';
  try {
    return new Date(member.value.joinDate).toLocaleDateString('de-DE');
  } catch {
    return member.value.joinDate;
  }
});

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
    await loadTags();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Fehler beim Laden des Mitglieds';
    console.error('Error loading member:', err);
  } finally {
    loading.value = false;
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
    console.log('[EditMemberPage] Tag scanned:', event.uid);
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
    console.log('[EditMemberPage] Adding tag:', tagUid, 'to member:', memberId.value);
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
  router.back();
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
</style>
