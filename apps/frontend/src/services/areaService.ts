import type { Area } from '@mks-control/shared-types';
import { getApiBaseUrl } from 'src/utils/apiUrl';

export const areaService = {
  async getAreas(): Promise<Area[]> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = apiUrl + '/areas';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch areas: ' + response.statusText);
      }
      const data = (await response.json()) as Area[];
      return data || [];
    } catch (error) {
      console.error('[areaService] Error fetching areas:', error);
      throw error;
    }
  },

  async getArea(id: string): Promise<Area> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/areas/${id}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch area: ' + response.statusText);
      }
      return (await response.json()) as Area;
    } catch (error) {
      console.error('[areaService] Error fetching area:', error);
      throw error;
    }
  },

  async createArea(area: Omit<Area, '_id' | '_rev'>): Promise<Area> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = apiUrl + '/areas';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(area),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to create area');
      }

      return (await response.json()) as Area;
    } catch (error) {
      console.error('[areaService] Error creating area:', error);
      throw error;
    }
  },

  async updateArea(id: string, area: Omit<Area, '_id' | '_rev'>): Promise<Area> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/areas/${id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(area),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to update area');
      }

      return (await response.json()) as Area;
    } catch (error) {
      console.error('[areaService] Error updating area:', error);
      throw error;
    }
  },

  async deleteArea(id: string): Promise<void> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/areas/${id}`;
      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to delete area');
      }
    } catch (error) {
      console.error('[areaService] Error deleting area:', error);
      throw error;
    }
  },
};
