import { defineStore } from 'pinia';

export interface UserRole {
  id: string;
  name: string;
}

export type RoleId = 'admin' | 'vorstand' | 'bereichsleitung' | 'mitglied';

export type Permission =
  | 'view:profile'
  | 'view:permissions'
  | 'view:about'
  | 'manage:area-permissions'
  | 'manage:areas'
  | 'manage:equipment';

// Define which permissions each role has
const ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  mitglied: ['view:profile', 'view:permissions', 'view:about'],
  bereichsleitung: ['view:profile', 'view:permissions', 'view:about', 'manage:area-permissions'],
  vorstand: [
    'view:profile',
    'view:permissions',
    'view:about',
    'manage:area-permissions',
    'manage:areas',
  ],
  admin: [
    'view:profile',
    'view:permissions',
    'view:about',
    'manage:area-permissions',
    'manage:areas',
    'manage:equipment',
  ],
};

export const useUserStore = defineStore('user', {
  state: () => ({
    selectedRole: null as UserRole | null,
    isAuthenticated: false,
    memberId: null as string | null,
    firstName: null as string | null,
    lastName: null as string | null,
    preferredTheme: 'auto' as 'light' | 'dark' | 'auto',
  }),

  getters: {
    roleId: (state): string | null => state.selectedRole?.id || null,
    roleName: (state): string | null => state.selectedRole?.name || null,
    fullName: (state): string => {
      const parts = [state.firstName, state.lastName].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : 'Unbekannter Benutzer';
    },

    // Legacy permission checks (kept for backward compatibility)
    isAdmin: (state): boolean => state.selectedRole?.id === 'admin',
    isVorstand: (state): boolean => state.selectedRole?.id === 'vorstand',
    isBereichsleiter: (state): boolean => state.selectedRole?.id === 'bereichsleitung',
    isMitglied: (state): boolean => state.selectedRole?.id === 'mitglied',

    // Feature-based permissions system
    permissions: (state): Set<Permission> => {
      const perms = new Set<Permission>();
      const roleId = state.selectedRole?.id as RoleId;

      if (roleId && ROLE_PERMISSIONS[roleId]) {
        ROLE_PERMISSIONS[roleId].forEach((perm) => perms.add(perm));
      }

      return perms;
    },

    can(state): (permission: Permission) => boolean {
      return (permission: Permission) => {
        return (this.permissions as Set<Permission>).has(permission);
      };
    },

    // Legacy role-based permissions (kept for backward compatibility)
    canManageAreas: (state): boolean => state.selectedRole?.id === 'admin',
    canManageMembers: (state): boolean =>
      state.selectedRole?.id === 'admin' || state.selectedRole?.id === 'bereichsleitung',
    canAssignRoles: (state): boolean =>
      state.selectedRole?.id === 'admin' || state.selectedRole?.id === 'vorstand',
    canViewDashboard: (state): boolean => state.isAuthenticated,
  },

  actions: {
    setRole(
      roleId: string,
      roleName: string,
      memberId?: string,
      firstName?: string,
      lastName?: string,
      preferredTheme?: 'light' | 'dark' | 'auto'
    ) {
      this.selectedRole = { id: roleId, name: roleName };
      this.isAuthenticated = true;
      this.memberId = memberId || null;
      this.firstName = firstName || null;
      this.lastName = lastName || null;
      this.preferredTheme = preferredTheme || 'auto';

      // Persist to localStorage
      localStorage.setItem('userRole', JSON.stringify(this.selectedRole));
      localStorage.setItem('isAuthenticated', 'true');
      if (memberId) {
        localStorage.setItem('memberId', memberId);
      }
      if (firstName) {
        localStorage.setItem('firstName', firstName);
      }
      if (lastName) {
        localStorage.setItem('lastName', lastName);
      }
      if (preferredTheme) {
        localStorage.setItem('preferredTheme', preferredTheme);
      }
    },

    setPreferredTheme(theme: 'light' | 'dark' | 'auto') {
      this.preferredTheme = theme;
      localStorage.setItem('preferredTheme', theme);
    },

    logout() {
      this.selectedRole = null;
      this.isAuthenticated = false;
      this.memberId = null;
      this.firstName = null;
      this.lastName = null;
      this.preferredTheme = 'auto';

      // Clear localStorage immediately to ensure state is persisted
      localStorage.removeItem('userRole');
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('memberId');
      localStorage.removeItem('firstName');
      localStorage.removeItem('lastName');
      localStorage.removeItem('preferredTheme');
    },

    // Restore session from localStorage
    restoreSession() {
      const storedRole = localStorage.getItem('userRole');
      const isAuth = localStorage.getItem('isAuthenticated');
      const storedMemberId = localStorage.getItem('memberId');
      const storedFirstName = localStorage.getItem('firstName');
      const storedLastName = localStorage.getItem('lastName');
      const storedTheme = localStorage.getItem('preferredTheme') as
        | 'light'
        | 'dark'
        | 'auto'
        | null;

      if (storedRole && isAuth === 'true') {
        this.selectedRole = JSON.parse(storedRole);
        this.isAuthenticated = true;
        this.memberId = storedMemberId;
        this.firstName = storedFirstName;
        this.lastName = storedLastName;
        this.preferredTheme = storedTheme || 'auto';
      }
    },

    hasRole(requiredRoleId: string): boolean {
      return this.selectedRole?.id === requiredRoleId;
    },
  },
});
