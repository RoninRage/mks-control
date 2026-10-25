import { boot } from 'quasar/wrappers';
import { useUserStore } from 'src/stores/user-store';
import { getTerminalToken, isTerminalApiUrl } from 'src/utils/terminalConfig';
import { getApiBaseUrl } from 'src/utils/apiUrl';

/**
 * Adds the credentials to every fetch request to the backend:
 *   - machine terminals (kiosk at a Pi): their terminal key on /api/terminal requests
 *   - everyone else: the login session ("Authorization: Bearer mks_…")
 * Role and member are never sent; the backend reads them from the session.
 * When the backend says the session ended (401), the browser logs out and goes to the start page.
 */
export default boot(({ router }) => {
  const originalFetch = window.fetch;

  const urlOf = (input: RequestInfo | URL): string =>
    input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    const requestUrl = urlOf(input);
    const isApi = requestUrl.startsWith(getApiBaseUrl()) || requestUrl.includes('/api/');

    if (!headers.has('X-Source')) {
      headers.set('X-Source', 'Control');
    }

    let sentSession = false;
    if (isApi && !headers.has('Authorization')) {
      const terminalToken = getTerminalToken();
      if (terminalToken && isTerminalApiUrl(requestUrl)) {
        headers.set('Authorization', `Bearer ${terminalToken}`);
      } else {
        const userStore = useUserStore();
        if (userStore.token) {
          headers.set('Authorization', `Bearer ${userStore.token}`);
          sentSession = true;
        }
      }
    }

    const response = await originalFetch(input, { ...init, headers });

    if (sentSession && response.status === 401 && !requestUrl.includes('/auth/')) {
      const userStore = useUserStore();
      if (userStore.isAuthenticated) {
        userStore.logout();
      }
      if (router.currentRoute.value.meta.requiresAuth) {
        void router.replace('/');
      }
    }
    return response;
  };
});
