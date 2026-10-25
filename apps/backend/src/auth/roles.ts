import type { RoleId } from '../types/auth';

// Roles from highest to lowest. A member's effective role is the highest one they have.
export const ROLE_PRIORITY: RoleId[] = ['admin', 'vorstand', 'bereichsleitung', 'mitglied'];

export const isRoleId = (value: unknown): value is RoleId =>
  typeof value === 'string' && (ROLE_PRIORITY as string[]).includes(value);

export const normalizeRoles = (roles: unknown): RoleId[] => {
  const list = Array.isArray(roles) ? roles.filter(isRoleId) : [];
  return list.length > 0 ? list : ['mitglied'];
};

export const highestRole = (roles: RoleId[]): RoleId =>
  ROLE_PRIORITY.find((role) => roles.includes(role)) ?? 'mitglied';

// Roles that manage members (see the table in docs/auth-plan.md).
export const MEMBER_MANAGERS: RoleId[] = ['admin', 'vorstand', 'bereichsleitung'];
export const BOARD: RoleId[] = ['admin', 'vorstand'];

const rank = (role: RoleId): number => ROLE_PRIORITY.indexOf(role);

/**
 * True when someone with `actorRole` may change a member with `targetRoles` (tags, profile,
 * active state). Nobody may act on a member with a higher role than their own; otherwise a
 * Bereichsleitung could, for example, give their own tag to an admin and log in as admin.
 */
export const canActOn = (actorRole: RoleId | undefined, targetRoles: unknown): boolean => {
  if (!actorRole) {
    return false;
  }
  if (actorRole === 'admin') {
    return true;
  }
  return rank(actorRole) <= rank(highestRole(normalizeRoles(targetRoles)));
};
