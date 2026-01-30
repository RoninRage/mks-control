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
  isActive?: boolean;
}
