import { defineStore } from 'pinia';
import type { AuthSessionInfo, AuthSessionKind } from '@mks-control/shared-types';
import { authService } from 'src/services/authService';

const TOKEN_KEY = 'mks.sessionToken';
const SESSION_KEYS = [
  TOKEN_KEY,
  'userRole',
  'isAuthenticated',
  'sessionKind',
  'idleTimeoutMs',
  'memberId',
  'firstName',
  'lastName',
  'preferredTheme',
];

const writeOrRemove = (key: string, value: string | null): void => {
  if (value) {
    localStorage.setItem(key, value);
  } else {
    localStorage.removeItem(key);
  }
};

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
  | 'manage:equipment'
  | 'manage:devices';

export const ROLE_PRIORITY: RoleId[] = ['admin', 'vorstand', 'bereichsleitung', 'mitglied'];

export const ROLE_NAME_MAP: Record<RoleId, string> = {
  admin: 'Admin',
  vorstand: 'Vorstand',
  bereichsleitung: 'Bereichsleitung',
  mitglied: 'Mitglied',
};

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
    'manage:devices',
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
    // Session token (Authorization: Bearer mks_…); role and member come from the backend.
    token: null as string | null,
    sessionKind: null as AuthSessionKind | null,
    // Entrance kiosk: logged out after this long without activity.
    idleTimeoutMs: null as number | null,
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

    can(): (permission: Permission) => boolean {
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
    /** Stores a login session from the backend (scan at the entrance or Web NFC). */
    setSession(info: AuthSessionInfo): void {
      const roleId = info.role;
      this.selectedRole = { id: roleId, name: ROLE_NAME_MAP[roleId] ?? roleId };
      this.isAuthenticated = true;
      if (info.token) {
        this.token = info.token;
      }
      this.sessionKind = info.kind;
      this.idleTimeoutMs = info.idleTimeoutMs ?? null;
      this.memberId = info.member?.id ?? null;
      this.firstName = info.member?.firstName ?? null;
      this.lastName = info.member?.lastName ?? (info.member ? null : 'Admin-Tag');
      this.preferredTheme = info.member?.preferredTheme ?? 'auto';

      try {
        if (this.token) {
          localStorage.setItem(TOKEN_KEY, this.token);
        }
        localStorage.setItem('userRole', JSON.stringify(this.selectedRole));
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('sessionKind', info.kind);
        writeOrRemove('idleTimeoutMs', this.idleTimeoutMs ? String(this.idleTimeoutMs) : null);
        writeOrRemove('memberId', this.memberId);
        writeOrRemove('firstName', this.firstName);
        writeOrRemove('lastName', this.lastName);
        localStorage.setItem('preferredTheme', this.preferredTheme);
      } catch {
        // Storage blocked: the session lasts until the page is reloaded.
      }
    },

    setPreferredTheme(theme: 'light' | 'dark' | 'auto') {
      this.preferredTheme = theme;
      localStorage.setItem('preferredTheme', theme);
    },

    /** Forgets the login in this browser (the backend session is ended by endSession). */
    logout() {
      this.selectedRole = null;
      this.isAuthenticated = false;
      this.token = null;
      this.sessionKind = null;
      this.idleTimeoutMs = null;
      this.memberId = null;
      this.firstName = null;
      this.lastName = null;
      this.preferredTheme = 'auto';

      SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
    },

    /** Ends the session in the backend (with audit entry) and here. */
    async endSession(reason = 'user-initiated'): Promise<void> {
      const token = this.token;
      this.logout();
      if (token) {
        await authService.logout(token, reason);
      }
    },

    // Restores the login after a reload. The backend is asked whether the session is still
    // valid (refreshSession); until then the stored data is used.
    restoreSession() {
      const token = localStorage.getItem(TOKEN_KEY);
      const storedRole = localStorage.getItem('userRole');
      if (!token || !storedRole) {
        // Logins from before the switch to sessions carry no token: they are gone.
        SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
        return;
      }
      try {
        this.selectedRole = JSON.parse(storedRole) as UserRole;
      } catch {
        this.logout();
        return;
      }
      const kind = localStorage.getItem('sessionKind');
      const idle = Number(localStorage.getItem('idleTimeoutMs'));
      this.token = token;
      this.isAuthenticated = true;
      this.sessionKind = kind === 'entrance' || kind === 'webnfc' ? kind : null;
      this.idleTimeoutMs = Number.isFinite(idle) && idle > 0 ? idle : null;
      this.memberId = localStorage.getItem('memberId');
      this.firstName = localStorage.getItem('firstName');
      this.lastName = localStorage.getItem('lastName');
      const storedTheme = localStorage.getItem('preferredTheme');
      this.preferredTheme =
        storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'auto';
    },

    /** Checks the stored session with the backend; logs out when it ended. */
    async refreshSession(): Promise<boolean> {
      if (!this.token) {
        return false;
      }
      const info = await authService.me(this.token);
      if (info === 'ended') {
        this.logout();
        return false;
      }
      if (info) {
        this.setSession(info);
      }
      return true;
    },

    hasRole(requiredRoleId: string): boolean {
      return this.selectedRole?.id === requiredRoleId;
    },
  },
});
