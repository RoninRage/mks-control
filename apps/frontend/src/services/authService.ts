import { getApiBaseUrl } from 'src/utils/apiUrl';

export const authService = {
  async logoutWithAudit(memberId: string, reason: string = 'user-initiated'): Promise<void> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/auth/logout`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ memberId, reason }),
      });

      if (!response.ok) {
        console.warn(`[authService] Failed to log audit for logout: ${response.statusText}`);
        // Don't throw here - logout should proceed even if audit fails
      }
    } catch (error) {
      console.warn('[authService] Error logging logout audit:', error);
      // Don't throw here - logout should proceed even if audit fails
    }
  },
};
