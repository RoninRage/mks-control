import { boot } from 'quasar/wrappers';
import { authEventSource, HeartbeatEvent, TagEvent } from 'src/services/authEventSource';
import { authService, LoginError } from 'src/services/authService';
import { useAuthStore } from 'src/stores/auth';
import { useUserStore } from 'src/stores/user-store';
import { isTerminalMode } from 'src/utils/terminalConfig';

// Login at the entrance kiosk (docs/auth-plan.md): only the kiosk receives scans of the entrance
// reader, each with a one-time code that is exchanged for a session. Scanning again logs out.
// At the kiosk the session also ends after a few minutes without activity.

const PING_INTERVAL_MS = 30_000;
const IDLE_CHECK_MS = 1_000;

export default boot(({ router }) => {
  const store = useAuthStore();
  const userStore = useUserStore();

  const goHome = (): void => {
    void router.replace('/');
  };

  const logOut = async (reason: string): Promise<void> => {
    await userStore.endSession(reason);
    store.lock();
    goHome();
  };

  // Restore the login after a reload and check it with the backend.
  userStore.restoreSession();
  void Promise.all([userStore.refreshSession(), router.isReady()]).then(([valid]) => {
    if (!valid && router.currentRoute.value.meta.requiresAuth) {
      goHome();
    }
  });

  authEventSource.onTag((event: TagEvent): void => {
    // A machine terminal only reacts to scans at its own reader (handled by the backend
    // and shown on the terminal page), never to the entrance reader.
    if (isTerminalMode()) {
      return;
    }

    // While assigning a tag to a member, the scan is only used for that.
    if (authEventSource.isInTagAssignmentMode()) {
      return;
    }

    // Scanning while logged in logs out.
    if (userStore.isAuthenticated) {
      void logOut('tag-scan');
      return;
    }

    if (event.isInactive === true) {
      authEventSource.emitInactiveUser(event);
      return;
    }

    if (!event.loginCode) {
      authEventSource.emitUnknownTag(event);
      return;
    }

    void authService
      .exchangeLoginCode(event.loginCode)
      .then((session) => {
        store.unlock(event);
        userStore.setSession(session);
        lastActivity = Date.now();
        return router.replace('/dashboard');
      })
      .catch((err: unknown) => {
        console.error('[auth-boot] Login failed:', err instanceof LoginError ? err.message : err);
        authEventSource.emitUnknownTag(event);
      });
  });

  authEventSource.onHeartbeat((event: HeartbeatEvent): void => {
    store.setHeartbeat(event);
  });

  // Kiosk: log out after idleTimeoutMs without touch or key press. Activity is reported to the
  // backend at most every PING_INTERVAL_MS so its session does not time out first.
  let lastActivity = Date.now();
  let lastPing = 0;
  const onActivity = (): void => {
    lastActivity = Date.now();
    if (!userStore.isAuthenticated || !userStore.idleTimeoutMs || !userStore.token) {
      return;
    }
    if (lastActivity - lastPing >= PING_INTERVAL_MS) {
      lastPing = lastActivity;
      void authService.ping(userStore.token);
    }
  };
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((type) => {
    window.addEventListener(type, onActivity, { passive: true, capture: true });
  });
  window.setInterval(() => {
    const idleMs = userStore.idleTimeoutMs;
    if (!userStore.isAuthenticated || !idleMs) {
      return;
    }
    if (Date.now() - lastActivity >= idleMs) {
      void logOut('idle');
    }
  }, IDLE_CHECK_MS);

  authEventSource.connect();
});
