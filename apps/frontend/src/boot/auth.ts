import { boot } from 'quasar/wrappers';
import type { RouteLocationNormalized } from 'vue-router';
import { authEventSource, TagEvent } from 'src/services/authEventSource';
import { useAuthStore } from 'src/stores/auth';

export default boot(({ router }) => {
  const store = useAuthStore();
  let redirectTimer: number | null = null;

  authEventSource.onTag((event: TagEvent): void => {
    store.unlock(event);
    if (router.currentRoute.value.path === '/lock') {
      if (redirectTimer !== null) {
        window.clearTimeout(redirectTimer);
      }
      redirectTimer = window.setTimeout(() => {
        redirectTimer = null;
        void router.replace('/');
      }, 800);
    }
  });

  authEventSource.connect();

  if (store.locked && router.currentRoute.value.path !== '/lock') {
    void router.replace('/lock');
  }

  router.beforeEach((to: RouteLocationNormalized) => {
    if (store.locked && to.path !== '/lock') {
      return { path: '/lock' };
    }
    return true;
  });
});
