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

        <!-- Tag UID -->
        <div class="col-12 col-sm-6">
          <q-input
            v-model="member.tagUid"
            label="Tag UID"
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
import type { Member } from 'src/services/memberService';
import { memberService } from 'src/services/memberService';

defineOptions({
  name: 'EditMemberPage',
});

const router = useRouter();
const route = useRoute();
const member = ref<Member | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const memberId = computed(() => route.params.id as string);

const formattedJoinDate = computed(() => {
  if (!member.value?.joinDate) return '';
  try {
    return new Date(member.value.joinDate).toLocaleDateString('de-DE');
  } catch {
    return member.value.joinDate;
  }
});

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
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Fehler beim Laden des Mitglieds';
    console.error('Error loading member:', err);
  } finally {
    loading.value = false;
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
</style>
