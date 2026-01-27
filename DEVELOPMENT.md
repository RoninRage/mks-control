# Development Guide

## Adding a New Page

1. Create a new component in `apps/frontend/src/pages/`:

```vue
<template>
  <q-page padding>
    <h1>My New Page</h1>
  </q-page>
</template>

<script setup lang="ts">
defineOptions({
  name: 'MyNewPage',
});
</script>
```

2. Add the route in `apps/frontend/src/router/routes.ts`:

```typescript
{
  path: '/my-page',
  component: () => import('pages/MyNewPage.vue'),
}
```

## Creating a Store

1. Create a new store in `apps/frontend/src/stores/`:

```typescript
import { defineStore } from 'pinia';

export const useMyStore = defineStore('myStore', {
  state: () => ({
    items: [] as string[],
  }),

  getters: {
    itemCount: (state) => state.items.length,
  },

  actions: {
    addItem(item: string) {
      this.items.push(item);
    },
  },
});
```

2. Use it in a component:

```vue
<script setup lang="ts">
import { useMyStore } from 'stores/my-store';

const store = useMyStore();

function handleClick() {
  store.addItem('New Item');
}
</script>
```

## Adding a Component

1. Create in `apps/frontend/src/components/`:

```vue
<template>
  <div class="my-component">
    <q-btn @click="handleClick" color="primary">
      {{ label }}
    </q-btn>
  </div>
</template>

<script setup lang="ts">
interface Props {
  label: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  click: [];
}>();

function handleClick() {
  emit('click');
}
</script>
```

2. Use it in a page:

```vue
<template>
  <q-page>
    <my-component label="Click me" @click="onComponentClick" />
  </q-page>
</template>

<script setup lang="ts">
import MyComponent from 'components/MyComponent.vue';

function onComponentClick() {
  console.log('Component clicked!');
}
</script>
```

## Adding a Boot File

Boot files run before the app starts. Create in `apps/frontend/src/boot/`:

```typescript
import { boot } from 'quasar/wrappers';

export default boot(({ app, router, store }) => {
  // Initialize something here
  console.log('App is starting...');
});
```

Then register it in `quasar.config.ts`:

```typescript
boot: ['my-boot-file']
```

## Using Quasar Plugins

1. Add plugin to `quasar.config.ts`:

```typescript
framework: {
  plugins: ['Notify', 'Dialog', 'Loading']
}
```

2. Use in components:

```vue
<script setup lang="ts">
import { useQuasar } from 'quasar';

const $q = useQuasar();

function showNotification() {
  $q.notify({
    message: 'Hello!',
    color: 'positive',
  });
}
</script>
```

## Styling Guidelines

### Using Quasar Classes

Quasar provides utility classes:

```vue
<template>
  <!-- Spacing -->
  <div class="q-pa-md q-ma-sm">
    <!-- Flexbox -->
    <div class="row q-gutter-md">
      <div class="col">Column 1</div>
      <div class="col">Column 2</div>
    </div>
    
    <!-- Typography -->
    <div class="text-h4 text-center text-primary">
      Title
    </div>
  </div>
</template>
```

### Custom Styles

Add global styles in `apps/frontend/src/css/app.scss`:

```scss
.my-custom-class {
  background-color: var(--q-primary);
  padding: 1rem;
}
```

Use scoped styles in components:

```vue
<style scoped lang="scss">
.my-component {
  padding: 1rem;
  
  &__title {
    font-size: 1.5rem;
    color: $primary;
  }
}
</style>
```

## Environment Variables

1. Create `.env` files in `apps/frontend/`:

```bash
# .env (defaults)
VITE_API_URL=http://localhost:3000

# .env.local (local overrides, not committed)
VITE_API_URL=http://localhost:8080

# .env.production
VITE_API_URL=https://api.production.com
```

2. Use in code:

```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

## PWA Configuration

Customize PWA in `quasar.config.ts`:

```typescript
pwa: {
  workboxMode: 'generateSW',
  manifest: {
    name: 'My App',
    short_name: 'MyApp',
    description: 'My awesome app',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#027be3',
  },
}
```

## API Integration

Create an API service in `apps/frontend/src/services/`:

```typescript
// services/api.ts
import { api } from 'boot/axios'; // After setting up axios boot file

export const userService = {
  async getUsers() {
    const { data } = await api.get('/users');
    return data;
  },
  
  async createUser(user: User) {
    const { data } = await api.post('/users', user);
    return data;
  },
};
```

## Testing (Future)

When adding tests:

```bash
# Add testing extension
quasar ext add @quasar/testing-unit-vitest

# Run tests
npm test
```

## Building for Production

```bash
# SPA build
npm run build

# PWA build
npm run build:pwa

# Output in dist/spa or dist/pwa
```

## Common Patterns

### Loading State

```vue
<script setup lang="ts">
import { ref } from 'vue';

const loading = ref(false);

async function fetchData() {
  loading.value = true;
  try {
    // Fetch data
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <q-page>
    <q-inner-loading :showing="loading" />
    <!-- Content -->
  </q-page>
</template>
```

### Form Validation

```vue
<script setup lang="ts">
import { ref } from 'vue';

const email = ref('');
const emailRules = [
  (val: string) => !!val || 'Email is required',
  (val: string) => /.+@.+\..+/.test(val) || 'Email is invalid',
];
</script>

<template>
  <q-form @submit="onSubmit">
    <q-input
      v-model="email"
      :rules="emailRules"
      label="Email"
    />
    <q-btn type="submit" label="Submit" />
  </q-form>
</template>
```

## Best Practices

1. **Use TypeScript** - Type everything for better IDE support
2. **Composition API** - Prefer `<script setup>` syntax
3. **Component Organization** - Keep components small and focused
4. **State Management** - Use Pinia stores for shared state
5. **Code Formatting** - Run `npm run format` before committing
6. **Linting** - Fix linting errors with `npm run lint`
