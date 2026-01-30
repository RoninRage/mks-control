<template>
  <q-page class="ms-container">
    <!-- Header -->
    <div class="ms-section">
      <div class="row items-center justify-between q-mb-lg">
        <h1 class="text-h3 q-mb-none">Mitglieder verwalten</h1>
        <q-btn
          flat
          icon="arrow_back"
          color="primary"
          @click="goBack"
          size="md"
          padding="md"
          min-width="44px"
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

    <!-- Members List -->
    <div v-if="!loading && members.length > 0" class="ms-section">
      <q-table flat bordered :rows="members" :columns="columns" row-key="id" class="members-table">
        <template #body-cell-name="props">
          <q-td :props="props">
            <span class="text-weight-medium"
              >{{ props.row.firstName }} {{ props.row.lastName }}</span
            >
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="edit"
              color="primary"
              size="sm"
              @click="editMember(props.row)"
            />
            <q-btn
              flat
              dense
              round
              icon="delete"
              color="negative"
              size="sm"
              @click="deleteMember(props.row.id)"
            />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && members.length === 0" class="ms-section">
      <q-card flat bordered class="text-center q-pa-lg">
        <q-icon name="person" size="64px" color="grey-7" />
        <div class="text-h6 q-mt-md text-grey-7">Keine Mitglieder gefunden</div>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { Member } from 'src/services/memberService';
import { memberService } from 'src/services/memberService';

defineOptions({
  name: 'MembersPage',
});

const router = useRouter();
const $q = useQuasar();

const members = ref<Member[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const columns = [
  {
    name: 'name',
    label: 'Name',
    field: 'firstName',
    align: 'left' as const,
  },
  {
    name: 'actions',
    label: 'Aktionen',
    field: 'id',
    align: 'center' as const,
  },
];

async function loadMembers() {
  loading.value = true;
  error.value = null;
  try {
    members.value = await memberService.getMembers();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Fehler beim Laden der Mitglieder';
    console.error('Error loading members:', err);
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.back();
}

function editMember(member: Member) {
  const fullName = member.firstName + ' ' + member.lastName;
  $q.notify({
    type: 'info',
    message: 'Bearbeiten von ' + fullName + ' - Wird in Zukunft implementiert',
  });
}

function deleteMember(id: string) {
  $q.dialog({
    title: 'Mitglied löschen',
    message: 'Möchten Sie dieses Mitglied wirklich löschen?',
    cancel: {
      flat: true,
      label: 'Abbrechen',
    },
    ok: {
      flat: true,
      label: 'Löschen',
      color: 'negative',
    },
  }).onOk(() => {
    members.value = members.value.filter((m) => m.id !== id);
    $q.notify({
      type: 'positive',
      message: 'Mitglied gelöscht',
    });
  });
}

onMounted(() => {
  loadMembers();
});
</script>

<style scoped lang="scss">
.members-table {
  :deep(.q-table__card) {
    border-radius: 16px;
  }
}
</style>
