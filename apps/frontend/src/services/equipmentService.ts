import { getApiBaseUrl } from 'src/utils/apiUrl';

export interface Equipment {
  _id?: string;
  _rev?: string;
  type?: 'equipment';
  id: string;
  name: string;
  configuration?: string;
  areaId?: string;
  isAvailable: boolean;
  isActive?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const equipmentService = {
  async getEquipment(): Promise<Equipment[]> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = apiUrl + '/equipment';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch equipment: ' + response.statusText);
      }
      const data = (await response.json()) as Equipment[];
      return data || [];
    } catch (error) {
      console.error('[equipmentService] Error fetching equipment:', error);
      throw error;
    }
  },

  async getEquipmentById(id: string): Promise<Equipment> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/equipment/${id}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch equipment: ' + response.statusText);
      }
      return (await response.json()) as Equipment;
    } catch (error) {
      console.error('[equipmentService] Error fetching equipment:', error);
      throw error;
    }
  },

  async createEquipment(equipment: Omit<Equipment, '_id' | '_rev'>): Promise<Equipment> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = apiUrl + '/equipment';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(equipment),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to create equipment');
      }

      return (await response.json()) as Equipment;
    } catch (error) {
      console.error('[equipmentService] Error creating equipment:', error);
      throw error;
    }
  },

  async updateEquipment(
    id: string,
    equipment: Omit<Equipment, '_id' | '_rev'>
  ): Promise<Equipment> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/equipment/${id}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(equipment),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to update equipment');
      }

      return (await response.json()) as Equipment;
    } catch (error) {
      console.error('[equipmentService] Error updating equipment:', error);
      throw error;
    }
  },

  async deleteEquipment(id: string): Promise<void> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/equipment/${id}`;
      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || 'Failed to delete equipment');
      }
    } catch (error) {
      console.error('[equipmentService] Error deleting equipment:', error);
      throw error;
    }
  },
};
