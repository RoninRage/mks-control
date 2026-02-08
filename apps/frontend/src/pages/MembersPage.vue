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

    <!-- Members List -->
    <div v-if="!loading && members.length > 0" class="ms-section">
      <q-table
        flat
        bordered
        :rows="members"
        :columns="columns"
        row-key="id"
        class="members-table"
        v-model:pagination="pagination"
        :rows-per-page-options="[5, 10, 25, 50]"
      >
        <template #body-cell-name="props">
          <q-td :props="props">
            <span class="text-weight-medium"
              >{{ props.row.firstName }} {{ props.row.lastName }}</span
            >
          </q-td>
        </template>

        <template #body-cell-email="props">
          <q-td :props="props">
            <span class="text-body2">{{ props.row.email || '—' }}</span>
          </q-td>
        </template>

        <template #body-cell-roles="props">
          <q-td :props="props">
            <q-badge
              v-for="role in props.row.roles"
              :key="role"
              :color="getRoleColor(role)"
              :label="getRoleLabel(role)"
              class="q-mr-xs ms-badge"
            />
          </q-td>
        </template>

        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="props.row.isActive ? 'positive' : 'grey'"
              :label="props.row.isActive ? 'Aktiv' : 'Inaktiv'"
              class="ms-badge"
            />
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props" class="action-cell">
            <q-btn
              flat
              round
              icon="edit"
              color="primary"
              size="md"
              @click="editMember(props.row)"
              class="touch-button"
              aria-label="Edit member"
            />
            <q-btn
              flat
              round
              icon="delete"
              color="negative"
              size="md"
              @click="deleteMember(props.row.id)"
              class="touch-button"
              aria-label="Delete member"
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
import type { Member } from '@mks-control/shared-types';
import { memberService } from 'src/services/memberService';
import { useUserStore } from 'src/stores/user-store';
import { getRoleColor, getRoleLabel } from 'src/utils/roles';

defineOptions({
  name: 'MembersPage',
});

const router = useRouter();
const $q = useQuasar();
const userStore = useUserStore();

const members = ref<Member[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const pagination = ref({
  rowsPerPage: 50,
  sortBy: 'name',
  descending: false,
});

const columns = [
  {
    name: 'name',
    label: 'Name',
    field: 'firstName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'email',
    label: 'E-Mail',
    field: 'email',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'roles',
    label: 'Rollen',
    field: 'roles',
    align: 'left' as const,
  },
  {
    name: 'status',
    label: 'Status',
    field: 'isActive',
    align: 'center' as const,
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
  router.replace('/dashboard');
}

function editMember(member: Member) {
  router.replace({
    path: `/members/${member.id}/edit`,
    query: { source: 'members' },
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
  }).onOk(async () => {
    try {
      const currentUserId = userStore.memberId;
      const currentUserRole = userStore.selectedRole?.id;

      if (!currentUserId || !currentUserRole) {
        $q.notify({
          type: 'negative',
          message: 'Benutzerinformationen fehlen. Bitte melden Sie sich erneut an.',
        });
        return;
      }

      await memberService.deleteMember(id, currentUserId, currentUserRole);
      await loadMembers(); // Reload list after successful delete
      $q.notify({
        type: 'positive',
        message: 'Mitglied gelöscht',
      });
    } catch (error) {
      const errorMessage = (error as Error).message;
      $q.notify({
        type: 'negative',
        message: errorMessage || 'Fehler beim Löschen des Mitglieds',
      });
    }
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

  :deep(.q-table thead tr),
  :deep(.q-table tbody td) {
    height: 56px;
  }
}

.action-cell {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;

  .touch-button {
    min-width: 48px !important;
    min-height: 48px !important;
    width: 48px;
    height: 48px;
  }
}

// Dark mode support
:deep(.body--dark) {
  .members-table {
    background: var(--ms-surface);

    :deep(.q-table__card) {
      background: var(--ms-surface);
      border-color: var(--ms-border);
    }

    :deep(thead) {
      background: var(--ms-surface-2);
      color: #ffffff;
    }

    :deep(tbody tr) {
      background: var(--ms-surface);
      border-color: var(--ms-border);

      &:hover {
        background: var(--ms-surface-2);
      }
    }

    :deep(.q-table__card) {
      color: #ffffff;
    }
  }
}
</style>
