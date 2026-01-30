import { boot } from 'quasar/wrappers';
import { Dark } from 'quasar';
import { useUserStore } from 'src/stores/user-store';
import { watch } from 'vue';

export default boot(() => {
  const userStore = useUserStore();

  // Apply theme when user logs in or theme preference changes
  watch(
    () => userStore.preferredTheme,
    (theme) => {
      if (!userStore.isAuthenticated) return;

      if (theme === 'dark') {
        Dark.set(true);
      } else if (theme === 'light') {
        Dark.set(false);
      } else {
        // 'auto' - use system preference
        Dark.set('auto');
      }
    },
    { immediate: true }
  );
});
