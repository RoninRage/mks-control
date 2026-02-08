import { ROLE_NAME_MAP, RoleId } from 'src/stores/user-store';

export interface RoleOption {
  label: string;
  value: RoleId;
}

export const ROLE_IDS: RoleId[] = ['admin', 'vorstand', 'bereichsleitung', 'mitglied'];

export const ROLE_COLORS: Record<RoleId, string> = {
  admin: 'negative',
  vorstand: 'info',
  bereichsleitung: 'warning',
  mitglied: 'primary',
};

export const isRoleId = (value: string): value is RoleId => {
  return ROLE_IDS.includes(value as RoleId);
};

export const getRoleLabel = (roleId: string): string => {
  if (!isRoleId(roleId)) {
    return roleId;
  }

  return ROLE_NAME_MAP[roleId];
};

export const getRoleColor = (roleId: string): string => {
  if (!isRoleId(roleId)) {
    return 'grey';
  }

  return ROLE_COLORS[roleId];
};

export const ROLE_OPTIONS: RoleOption[] = ROLE_IDS.map((roleId) => ({
  label: ROLE_NAME_MAP[roleId],
  value: roleId,
}));

export const isPrivilegedRole = (roleId: string): boolean => {
  return roleId === 'admin' || roleId === 'vorstand';
};
