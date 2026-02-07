import { boot } from 'quasar/wrappers';
import { useUserStore } from 'src/stores/user-store';

/**
 * Boot file to inject X-Source, X-User-ID, and X-User-Role headers to all fetch requests
 * This identifies the source machine (Control frontend) and authenticates requests
 */
export default boot(() => {
  const originalFetch = window.fetch;

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Create a new init object if not provided
    const newInit: RequestInit = {
      ...init,
      headers: {
        ...(init?.headers || {}),
      },
    };

    const headers = newInit.headers as Record<string, string>;

    // Add X-Source header if not already present
    if (!headers['X-Source'] && !headers['x-source']) {
      headers['X-Source'] = 'Control';
    }

    // Add user authentication headers from userStore
    try {
      const userStore = useUserStore();

      if (userStore.memberId && !headers['X-User-ID'] && !headers['x-user-id']) {
        headers['X-User-ID'] = userStore.memberId;
      }

      if (userStore.roleId && !headers['X-User-Role'] && !headers['x-user-role']) {
        headers['X-User-Role'] = userStore.roleId;
      }

      if (userStore.memberId && !headers['X-Device-ID'] && !headers['x-device-id']) {
        headers['X-Device-ID'] = userStore.memberId;
      }

      // Debug logging for API requests
      const urlStr = input instanceof URL ? input.href : typeof input === 'string' ? input : '?';
      if (urlStr.includes('/api/')) {
        console.log(
          '🔍 fetch-headers: memberId=%s, roleId=%s, headers=%o',
          userStore.memberId,
          userStore.roleId,
          {
            'X-Source': headers['X-Source'],
            'X-User-ID': headers['X-User-ID'],
            'X-User-Role': headers['X-User-Role'],
            'X-Device-ID': headers['X-Device-ID'],
          }
        );
      }
    } catch (error) {
      // If userStore is not ready yet, headers will be added on next request
      // This is fine - most requests happen after authentication
      console.debug('fetch-headers: userStore not yet ready:', error);
    }

    return originalFetch(input, newInit);
  };
});
