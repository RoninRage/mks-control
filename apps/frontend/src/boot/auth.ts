import { boot } from 'quasar/wrappers';
import { authEventSource, HeartbeatEvent, TagEvent } from 'src/services/authEventSource';
import { useAuthStore } from 'src/stores/auth';
import { ROLE_NAME_MAP, ROLE_PRIORITY, useUserStore } from 'src/stores/user-store';

const isMonorepoDev = typeof process !== 'undefined' && process.env.MONOREPO_DEV === 'true';

// Enforce monorepo dev entry point - check env var
if (typeof window !== 'undefined' && !isMonorepoDev) {
  console.error('❌ ERROR: Frontend must be started via: npm run dev');
  console.error('Do not run frontend directly. MONOREPO_DEV is not set to true.');
  window.location.href = 'about:blank';
}

export default boot(({ router }) => {
  const store = useAuthStore();
  const userStore = useUserStore();

  // Restore session if it exists
  userStore.restoreSession();

  authEventSource.onTag((event: TagEvent): void => {
    // If a user is currently logged in, log them out and stop processing
    // UNLESS we're in tag assignment mode
    if (userStore.isAuthenticated) {
      if (authEventSource.isInTagAssignmentMode()) {
        return;
      }
      // Clear all authentication state
      userStore.logout();
      store.lock();
      // Navigate to home/login page
      void router.replace('/');
      // Don't process the tag further - just logout
      return;
    }

    // Check for inactive user first (before unknown user check)
    if (event.isInactive === true) {
      authEventSource.emitInactiveUser(event);
      return;
    }

    // Check for unknown user (tag not found in database and not admin)
    if (event.memberFound === false && event.isAdmin !== true) {
      authEventSource.emitUnknownTag(event);
      return;
    }

    // Only process tag if no user is logged in
    store.unlock(event);

    const memberRoles = event.member?.roles ?? [];
    const resolvedRoleId =
      ROLE_PRIORITY.find((roleId) => memberRoles.includes(roleId)) ?? 'mitglied';
    const resolvedRoleName = ROLE_NAME_MAP[resolvedRoleId] ?? 'Mitglied';

    if (event.isAdmin) {
      const memberId = event.member?.id;
      const firstName = event.member?.firstName;
      const lastName = event.member?.lastName;
      const preferredTheme = event.member?.preferredTheme;
      userStore.setRole('admin', 'Admin', memberId, firstName, lastName, preferredTheme);
    } else {
      const memberId = event.member?.id;
      const firstName = event.member?.firstName;
      const lastName = event.member?.lastName;
      const preferredTheme = event.member?.preferredTheme;
      userStore.setRole(
        resolvedRoleId,
        resolvedRoleName,
        memberId,
        firstName,
        lastName,
        preferredTheme
      );
    }

    // Use setTimeout to ensure state is committed before navigation
    setTimeout(() => {
      router.replace('/dashboard').catch((err) => {
        console.error('[auth-boot] Navigation to dashboard failed:', err);
      });
    }, 100);
  });

  authEventSource.onHeartbeat((event: HeartbeatEvent): void => {
    store.setHeartbeat(event);
  });

  authEventSource.connect();
});
