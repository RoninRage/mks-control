import { boot } from 'quasar/wrappers';
import {
  authEventSource,
  HeartbeatEvent,
  ReaderEvent,
  TagEvent,
} from 'src/services/authEventSource';
import { useAuthStore } from 'src/stores/auth';
import { useUserStore } from 'src/stores/user-store';

// Enforce monorepo dev entry point - check port instead of env var (works in browser)
if (typeof window !== 'undefined' && window.location.port && window.location.port !== '9000') {
  console.error('❌ ERROR: Frontend must be started via: npm run dev');
  console.error('Do not run frontend directly. Expected port 9000, got ' + window.location.port);
  window.location.href = 'about:blank';
}

export default boot(({ router }) => {
  const store = useAuthStore();
  const userStore = useUserStore();

  authEventSource.onTag((event: TagEvent): void => {
    console.log('[auth-boot] Tag event received:', event);
    store.unlock(event);

    // Auto-login admin tags
    if (event.isAdmin) {
      console.log('[auth-boot] Admin tag detected, auto-logging in as admin');
      userStore.setRole('admin', 'Admin');
      console.log('[auth-boot] isAuthenticated:', userStore.isAuthenticated);
      console.log('[auth-boot] selectedRole:', userStore.selectedRole);
      // Use setTimeout to ensure state is committed before navigation
      setTimeout(() => {
        console.log('[auth-boot] Navigating to dashboard');
        console.log('[auth-boot] router exists:', !!router);
        void router.push('/dashboard');
      }, 0);
    } else {
      console.log('[auth-boot] Non-admin tag, proceeding to role selection');
    }
  });

  authEventSource.onReader((event: ReaderEvent): void => {
    store.setReaderStatus(event);
  });

  authEventSource.onHeartbeat((event: HeartbeatEvent): void => {
    store.setHeartbeat(event);
  });

  authEventSource.connect();
});
