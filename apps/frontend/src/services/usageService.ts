import type { UsageListResponse } from '@mks-control/shared-types';
import { getApiBaseUrl } from 'src/utils/apiUrl';

export interface UsageFilter {
  equipmentId?: string | null;
  memberId?: string | null;
  from?: string | null; // YYYY-MM-DD
  to?: string | null; // YYYY-MM-DD
}

export const usageService = {
  // What is returned depends on the role (backend: routes/usageRoutes.ts).
  async list(filter: UsageFilter = {}): Promise<UsageListResponse> {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    const query = params.toString();
    const response = await fetch(`${getApiBaseUrl()}/usage${query ? `?${query}` : ''}`);
    if (!response.ok) {
      let message = 'Nutzungen konnten nicht geladen werden';
      try {
        message = ((await response.json()) as { error?: string }).error || message;
      } catch {
        // keep fallback
      }
      throw new Error(message);
    }
    return (await response.json()) as UsageListResponse;
  },
};
