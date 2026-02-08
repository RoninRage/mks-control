import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { areaService } from '../services/areaService';
import { equipmentService } from '../services/equipmentService';
import { memberService } from '../services/memberService';
import { useUserStore } from './user-store';

export interface Area {
  _id?: string;
  _rev?: string;
  type?: 'area';
  id: string;
  name: string;
  description: string;
  bereichsleiterIds?: string[];
}

export interface Equipment {
  _id?: string;
  _rev?: string;
  type?: 'equipment';
  id: string;
  name: string;
  configuration?: string;
  areaId?: string;
  isAvailable: boolean;
}

export interface Member {
  _id?: string;
  _rev?: string;
  id: string;
  firstName: string;
  lastName: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles: string[];
  joinDate: string;
  isActive: boolean;
  preferredTheme?: 'light' | 'dark' | 'auto';
  equipmentPermissions?: Record<string, boolean>;
  createdAt?: string;
  updatedAt?: string;
}

export const useAusstattungStore = defineStore('ausstattung', () => {
  // State
  const areas = ref<Area[]>([]);
  const equipment = ref<Equipment[]>([]);
  const members = ref<Member[]>([]);

  const selectedAreaId = ref<string | null>(null);
  const selectedEquipmentId = ref<string | null>(null);
  const searchQuery = ref('');

  const loading = ref(false);
  const error = ref<string | null>(null);

  // Computed
  const selectedArea = computed(() => areas.value.find((a) => a.id === selectedAreaId.value));

  const selectedEquipment = computed(() =>
    equipment.value.find((e) => e.id === selectedEquipmentId.value)
  );

  const areaEquipment = computed(() =>
    equipment.value.filter((e) => e.areaId === selectedAreaId.value)
  );

  const filteredMembers = computed(() => {
    return members.value.filter((m) => {
      const query = searchQuery.value.toLowerCase();
      const roleIds = m.roles.map((role) => role.toLowerCase());
      const isPrivileged = roleIds.includes('admin') || roleIds.includes('vorstand');
      return (
        m.isActive &&
        !isPrivileged &&
        (m.firstName.toLowerCase().includes(query) ||
          m.lastName.toLowerCase().includes(query) ||
          `${m.firstName} ${m.lastName}`.toLowerCase().includes(query) ||
          (m.email?.toLowerCase().includes(query) ?? false))
      );
    });
  });

  // Actions
  const loadAreas = async () => {
    try {
      loading.value = true;
      error.value = null;
      const allAreas = await areaService.getAreas();
      areas.value = Array.isArray(allAreas) ? allAreas : (allAreas as any).data || [];
    } catch (err) {
      error.value = `Failed to load areas: ${(err as Error).message}`;
      console.error('[ausstattung-store] Error loading areas:', err);
    } finally {
      loading.value = false;
    }
  };

  const loadEquipment = async () => {
    try {
      loading.value = true;
      error.value = null;
      const allEquipment = await equipmentService.getEquipment();
      equipment.value = allEquipment;
    } catch (err) {
      error.value = `Failed to load equipment: ${(err as Error).message}`;
      console.error('[ausstattung-store] Error loading equipment:', err);
    } finally {
      loading.value = false;
    }
  };

  const loadMembers = async () => {
    try {
      loading.value = true;
      error.value = null;
      const data = await memberService.getMembers();
      // Handle both wrapped and unwrapped response formats
      members.value = Array.isArray(data) ? data : (data as any).data || [];
    } catch (err) {
      error.value = `Failed to load members: ${(err as Error).message}`;
      console.error('[ausstattung-store] Error loading members:', err);
    } finally {
      loading.value = false;
    }
  };

  const selectArea = (areaId: string | null) => {
    selectedAreaId.value = areaId;
    selectedEquipmentId.value = null;
    searchQuery.value = '';
  };

  const selectEquipment = (equipmentId: string | null) => {
    selectedEquipmentId.value = equipmentId;
    searchQuery.value = '';
  };

  const setSearchQuery = (query: string) => {
    searchQuery.value = query;
  };

  const toggleMemberEquipmentPermission = async (
    memberId: string,
    equipmentId: string,
    allowed: boolean
  ): Promise<void> => {
    try {
      loading.value = true;
      error.value = null;

      // Call backend endpoint
      const userStore = useUserStore();
      const apiUrl = resolveApiUrl();
      const response = await fetch(
        `${apiUrl}/members/${memberId}/equipment-permissions/${equipmentId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userStore.memberId || '',
            'X-User-Role': userStore.roleId || '',
          },
          body: JSON.stringify({ allowed }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update permission');
      }

      const result = await response.json();

      // Update local state
      const member = members.value.find((m) => m.id === memberId);
      if (member) {
        if (!member.equipmentPermissions) {
          member.equipmentPermissions = {};
        }
        member.equipmentPermissions[equipmentId] = allowed;
      }
    } catch (err) {
      error.value = `Failed to update permission: ${(err as Error).message}`;
      console.error('[ausstattung-store] Error toggling permission:', err);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const getMemberPermission = (memberId: string, equipmentId: string): boolean => {
    const member = members.value.find((m) => m.id === memberId);
    if (!member) return false;

    // If member has bereichsleitung role and equipment is in their area
    if (member.roles.includes('bereichsleitung')) {
      const equip = equipment.value.find((e) => e.id === equipmentId);
      if (equip && member.roles.includes('bereichsleitung')) {
        // Check if member manages the equipment's area
        const managedArea = areas.value.find(
          (a) => a.id === equip.areaId && a.bereichsleiterIds?.includes(memberId)
        );
        if (managedArea) {
          return true; // Auto-granted for their area
        }
      }
    }

    // Otherwise check explicit permissions
    return member.equipmentPermissions?.[equipmentId] ?? false;
  };

  const initializeStore = async (userRole: string) => {
    try {
      loading.value = true;
      error.value = null;

      await Promise.all([loadAreas(), loadEquipment(), loadMembers()]);

      // For Bereichsleiter, pre-select their first area if available
      if (userRole === 'bereichsleitung' && areas.value.length > 0) {
        const userId = localStorage.getItem('memberId');
        const userArea = areas.value.find((a) => a.bereichsleiterIds?.includes(userId || ''));
        if (userArea) {
          selectArea(userArea.id);
        }
      }
    } finally {
      loading.value = false;
    }
  };

  const reset = () => {
    areas.value = [];
    equipment.value = [];
    members.value = [];
    selectedAreaId.value = null;
    selectedEquipmentId.value = null;
    searchQuery.value = '';
    error.value = null;
  };

  return {
    // State
    areas,
    equipment,
    members,
    selectedAreaId,
    selectedEquipmentId,
    searchQuery,
    loading,
    error,

    // Computed
    selectedArea,
    selectedEquipment,
    areaEquipment,
    filteredMembers,

    // Actions
    loadAreas,
    loadEquipment,
    loadMembers,
    selectArea,
    selectEquipment,
    setSearchQuery,
    toggleMemberEquipmentPermission,
    getMemberPermission,
    initializeStore,
    reset,
  };
});

const resolveApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, port } = window.location;

    if (port && port !== '3000') {
      return `http://${hostname}:3000/api`;
    }

    return '/api';
  }

  return 'http://localhost:3000/api';
};
