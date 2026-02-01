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
}

export interface CreateMemberRequest {
  firstName: string;
  lastName: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles?: string[];
}

export interface UpdateMemberRequest {
  firstName?: string;
  lastName?: string;
  tagUid?: string;
  email?: string;
  phone?: string;
  roles?: string[];
  preferredTheme?: 'light' | 'dark' | 'auto';
  isActive?: boolean;
  equipmentPermissions?: Record<string, boolean>;
}
