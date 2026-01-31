<template>
  <img
    v-if="roleId === 'admin'"
    src="../assets/icons/user-admin.svg"
    :alt="roleName"
    class="role-icon"
  />
  <img
    v-else-if="roleId === 'vorstand'"
    src="../assets/icons/user-vorstand.svg"
    :alt="roleName"
    class="role-icon"
  />
  <img
    v-else-if="roleId === 'bereichsleitung'"
    src="../assets/icons/user-bereichsleitung.svg"
    :alt="roleName"
    class="role-icon"
  />
  <img
    v-else-if="roleId === 'mitglied'"
    src="../assets/icons/user.svg"
    :alt="roleName"
    class="role-icon"
  />
  <rfid-icon v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import RfidIcon from 'components/RfidIcon.vue';

const props = defineProps<{
  roleId: string;
}>();

defineOptions({
  name: 'RoleIcon',
});

const roleName = computed(() => {
  const names: Record<string, string> = {
    admin: 'Admin',
    vorstand: 'Vorstand',
    bereichsleitung: 'Bereichsleitung',
    mitglied: 'Mitglied',
  };
  return names[props.roleId] || 'Unknown';
});
</script>

<style scoped lang="scss">
.role-icon {
  width: 20px;
  height: 20px;
  display: inline-block;
  vertical-align: middle;
  filter: none; // Black icon in light mode (default)
}

.body--dark .role-icon {
  filter: invert(1) brightness(2); // White icon in dark mode
}
</style>
