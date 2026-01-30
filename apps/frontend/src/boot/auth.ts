import { boot } from 'quasar/wrappers';
import { authEventSource, HeartbeatEvent, TagEvent } from 'src/services/authEventSource';
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

  // Restore session if it exists
  userStore.restoreSession();

  authEventSource.onTag((event: TagEvent): void => {
    console.log('[auth-boot] Tag event received:', event);
    console.log('[auth-boot] Event details:', {
      uid: event.uid,
      isAdmin: event.isAdmin,
      memberFound: event.memberFound,
    });
    console.log('[auth-boot] Current authentication state:', {
      isAuthenticated: userStore.isAuthenticated,
      selectedRole: userStore.selectedRole,
    });

    // If a user is currently logged in, log them out and stop processing
    // UNLESS we're in tag assignment mode (e.g., adding tags in EditMemberPage)
    if (userStore.isAuthenticated) {
      if (authEventSource.isInTagAssignmentMode()) {
        console.log('[auth-boot] User logged in, but in tag assignment mode - skipping logout');
        return;
      }
      console.log('[auth-boot] User currently logged in, logging out');
      // First, clear all authentication state
      userStore.logout();
      store.lock();
      console.log('[auth-boot] Logout complete, state cleared');
      // Navigate to home/login page
      void router.push('/');
      // Don't process the tag further - just logout
      return;
    }

    // Check for unknown user (tag not found in database and not admin)
    if (event.memberFound === false && event.isAdmin !== true) {
      console.log('[auth-boot] Unknown tag detected - member not found and not admin');
      console.log('[auth-boot] Emitting unknown tag event');
      authEventSource.emitUnknownTag(event);
      return;
    }

    // Only process tag if no user is logged in
    console.log('[auth-boot] No user logged in, processing tag');
    store.unlock(event);

    const rolePriority = ['admin', 'vorstand', 'bereichsleitung', 'mitglied'] as const;
    const roleNameMap: Record<string, string> = {
      admin: 'Admin',
      vorstand: 'Vorstand',
      bereichsleitung: 'Bereichsleitung',
      mitglied: 'Mitglied',
    };

    const memberRoles = event.member?.roles ?? [];
    const resolvedRoleId =
      rolePriority.find((roleId) => memberRoles.includes(roleId)) ?? 'mitglied';
    const resolvedRoleName = roleNameMap[resolvedRoleId] ?? 'Mitglied';

    if (event.isAdmin) {
      console.log('[auth-boot] Admin tag detected, auto-logging in as admin');
      const memberId = event.member?.id;
      const firstName = event.member?.firstName;
      const lastName = event.member?.lastName;
      const preferredTheme = event.member?.preferredTheme;
      userStore.setRole('admin', 'Admin', memberId, firstName, lastName, preferredTheme);
    } else {
      console.log('[auth-boot] Assigning role based on permissions:', resolvedRoleId);
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

    console.log('[auth-boot] isAuthenticated:', userStore.isAuthenticated);
    console.log('[auth-boot] selectedRole:', userStore.selectedRole);
    // Use setTimeout to ensure state is committed before navigation
    setTimeout(() => {
      console.log('[auth-boot] Navigating to dashboard');
      console.log('[auth-boot] router exists:', !!router);
      void router.push('/dashboard');
    }, 0);
  });

  authEventSource.onHeartbeat((event: HeartbeatEvent): void => {
    store.setHeartbeat(event);
  });

  authEventSource.connect();
});
