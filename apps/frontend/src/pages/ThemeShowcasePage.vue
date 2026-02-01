<template>
  <q-page class="ms-container">
    <div class="ms-section">
      <h1 class="text-h2 q-mb-sm">MakerSpace Theme</h1>
      <p class="text-h6 ms-muted q-mb-lg">
        Clean, monochrome design with minimal shadows and consistent rounded corners
      </p>
    </div>

    <!-- Dark Mode Toggle -->
    <div class="ms-section">
      <q-card flat bordered class="q-pa-md">
        <div class="row items-center justify-between">
          <div>
            <div class="text-h6 q-mb-xs">Dark Mode</div>
            <div class="text-body2 ms-muted">Toggle between light and dark themes</div>
          </div>
          <q-toggle v-model="isDark" size="lg" color="primary" @update:model-value="toggleDark" />
        </div>
      </q-card>
    </div>

    <!-- Buttons Section -->
    <div class="ms-section">
      <h2 class="text-h4 q-mb-md">Buttons</h2>
      <q-card flat bordered class="q-pa-lg">
        <div class="column q-gutter-md">
          <div class="row q-gutter-sm items-center">
            <q-btn label="Primary" color="primary" />
            <q-btn label="Secondary" color="secondary" text-color="primary" />
            <q-btn label="Accent" color="accent" />
            <q-btn label="Positive" color="positive" />
            <q-btn label="Negative" color="negative" />
          </div>

          <div class="row q-gutter-sm items-center">
            <q-btn label="Outline Primary" color="primary" outline />
            <q-btn label="Outline Secondary" color="secondary" outline />
            <q-btn label="Outline Accent" color="accent" outline />
          </div>

          <div class="row q-gutter-sm items-center">
            <q-btn label="Flat Primary" color="primary" flat />
            <q-btn label="Flat Secondary" color="secondary" flat />
            <q-btn label="Flat Accent" color="accent" flat />
          </div>

          <div class="row q-gutter-sm items-center">
            <q-btn icon="home" color="primary" round />
            <q-btn icon="search" color="secondary" text-color="primary" round />
            <q-btn icon="settings" color="accent" round />
          </div>
        </div>
      </q-card>
    </div>

    <!-- Form Inputs Section -->
    <div class="ms-section">
      <h2 class="text-h4 q-mb-md">Form Inputs</h2>
      <q-card flat bordered class="q-pa-lg">
        <div class="column q-gutter-md" style="max-width: 500px">
          <q-input v-model="sampleText" outlined label="Text Input" hint="Enter some text" />

          <q-input
            v-model="sampleEmail"
            outlined
            type="email"
            label="Email"
            placeholder="user@example.com"
          />

          <q-select
            v-model="sampleSelect"
            outlined
            :options="selectOptions"
            label="Select Option"
          />

          <q-input v-model="sampleTextarea" outlined type="textarea" label="Textarea" rows="3" />
        </div>
      </q-card>
    </div>

    <!-- Cards Section -->
    <div class="ms-section">
      <h2 class="text-h4 q-mb-md">Cards</h2>
      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-4">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-h6 q-mb-sm">Simple Card</div>
              <p class="ms-muted">
                Cards have subtle borders instead of heavy shadows, maintaining the minimal
                aesthetic.
              </p>
            </q-card-section>
            <q-card-actions>
              <q-btn flat label="Action" color="primary" />
            </q-card-actions>
          </q-card>
        </div>

        <div class="col-12 col-md-4">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-h6 q-mb-sm">With Icon</div>
              <div class="row items-start q-gutter-sm">
                <q-icon name="info" color="info" size="md" />
                <p class="ms-muted col">
                  Information is presented clearly with consistent spacing.
                </p>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <div class="col-12 col-md-4">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-h6 q-mb-sm">Status Card</div>
              <div class="row items-center q-gutter-sm">
                <q-badge color="positive" label="Active" class="ms-badge" />
                <span class="ms-muted">System operational</span>
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>

    <!-- List Section -->
    <div class="ms-section">
      <h2 class="text-h4 q-mb-md">Lists</h2>
      <q-card flat bordered>
        <q-list>
          <q-item>
            <q-item-section avatar>
              <q-icon name="inbox" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Inbox</q-item-label>
              <q-item-label caption class="ms-muted">5 new messages</q-item-label>
            </q-item-section>
          </q-item>

          <q-item>
            <q-item-section avatar>
              <q-icon name="star" color="warning" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Starred</q-item-label>
              <q-item-label caption class="ms-muted">Important items</q-item-label>
            </q-item-section>
          </q-item>

          <q-item>
            <q-item-section avatar>
              <q-icon name="send" color="info" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Sent</q-item-label>
              <q-item-label caption class="ms-muted">12 sent today</q-item-label>
            </q-item-section>
          </q-item>

          <q-item>
            <q-item-section avatar>
              <q-icon name="delete" color="negative" />
            </q-item-section>
            <q-item-section>
              <q-item-label>Trash</q-item-label>
              <q-item-label caption class="ms-muted">3 items</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </div>

    <!-- Table Section -->
    <div class="ms-section">
      <h2 class="text-h4 q-mb-md">Table</h2>
      <q-table
        flat
        bordered
        :rows="tableRows"
        :columns="tableColumns"
        row-key="name"
        :rows-per-page-options="[5]"
      >
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="props.row.status === 'Active' ? 'positive' : 'muted'"
              :label="props.row.status"
              class="ms-badge"
            />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Typography Section -->
    <div class="ms-section">
      <h2 class="text-h4 q-mb-md">Typography</h2>
      <q-card flat bordered class="q-pa-lg">
        <h1 class="text-h1 q-mb-sm">Heading 1</h1>
        <h2 class="text-h2 q-mb-sm">Heading 2</h2>
        <h3 class="text-h3 q-mb-sm">Heading 3</h3>
        <h4 class="text-h4 q-mb-sm">Heading 4</h4>
        <h5 class="text-h5 q-mb-sm">Heading 5</h5>
        <h6 class="text-h6 q-mb-md">Heading 6</h6>

        <p class="text-body1 q-mb-sm">
          Body 1: This is regular body text using the Nunito font family. It's clean, readable, and
          maintains the minimal aesthetic of the MakerSpace theme.
        </p>

        <p class="text-body2 q-mb-sm">
          Body 2: Slightly smaller body text for secondary information or captions.
        </p>

        <p class="text-caption ms-muted">Caption: Muted text for less important information.</p>
      </q-card>
    </div>

    <!-- Color Palette Section -->
    <div class="ms-section q-mb-xl">
      <h2 class="text-h4 q-mb-md">Color Palette</h2>
      <div class="row q-col-gutter-md">
        <div class="col-6 col-md-3">
          <q-card flat bordered class="q-pa-md text-center">
            <div
              style="width: 100%; height: 80px; background: #111111; border-radius: 8px"
              class="q-mb-sm"
            />
            <div class="text-weight-bold">Primary</div>
            <div class="text-caption ms-muted">#111111</div>
          </q-card>
        </div>

        <div class="col-6 col-md-3">
          <q-card flat bordered class="q-pa-md text-center">
            <div
              style="
                width: 100%;
                height: 80px;
                background: #ffffff;
                border: 1px solid var(--ms-border);
                border-radius: 8px;
              "
              class="q-mb-sm"
            />
            <div class="text-weight-bold">Secondary</div>
            <div class="text-caption ms-muted">#FFFFFF</div>
          </q-card>
        </div>

        <div class="col-6 col-md-3">
          <q-card flat bordered class="q-pa-md text-center">
            <div
              style="width: 100%; height: 80px; background: #1f7a4d; border-radius: 8px"
              class="q-mb-sm"
            />
            <div class="text-weight-bold">Positive</div>
            <div class="text-caption ms-muted">#1F7A4D</div>
          </q-card>
        </div>

        <div class="col-6 col-md-3">
          <q-card flat bordered class="q-pa-md text-center">
            <div
              style="width: 100%; height: 80px; background: #b42318; border-radius: 8px"
              class="q-mb-sm"
            />
            <div class="text-weight-bold">Negative</div>
            <div class="text-caption ms-muted">#B42318</div>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useQuasar } from 'quasar';

defineOptions({
  name: 'ThemeShowcasePage',
});

const $q = useQuasar();
const isDark = ref($q.dark.isActive);

const sampleText = ref('');
const sampleEmail = ref('');
const sampleSelect = ref(null);
const sampleTextarea = ref('');

const selectOptions = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];

const tableColumns = [
  {
    name: 'name',
    label: 'Name',
    field: 'name',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'email',
    label: 'Email',
    field: 'email',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'role',
    label: 'Role',
    field: 'role',
    align: 'left' as const,
  },
  {
    name: 'status',
    label: 'Status',
    field: 'status',
    align: 'center' as const,
  },
];

const tableRows = [
  {
    name: 'John Doe',
    email: 'john@example.com',
    role: 'Admin',
    status: 'Active',
  },
  {
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'Member',
    status: 'Active',
  },
  {
    name: 'Bob Johnson',
    email: 'bob@example.com',
    role: 'Member',
    status: 'Inactive',
  },
  {
    name: 'Alice Williams',
    email: 'alice@example.com',
    role: 'Moderator',
    status: 'Active',
  },
];

function toggleDark(val: boolean) {
  $q.dark.set(val);
}
</script>

<style lang="scss">
:deep(.body--dark) {
  .q-toggle {
    .q-toggle__track {
      background-color: #555555;
    }

    .q-toggle__thumb {
      background-color: #ffffff;
    }
  }
}
</style>
