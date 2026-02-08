import { getApiBaseUrl } from 'src/utils/apiUrl';

export interface Tag {
  _id?: string;
  _rev?: string;
  id: string;
  tagUid: string;
  memberId: string;
  createdAt: string;
  updatedAt?: string;
  isActive: boolean;
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
  tags?: Tag[];
  createdAt?: string;
  updatedAt?: string;
}

interface MemberResponse {
  ok: boolean;
  data: Member[];
}

interface TagResponse {
  ok: boolean;
  data: Tag[];
}

export const memberService = {
  async getMembers(): Promise<Member[]> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = apiUrl + '/members';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch members: ' + response.statusText);
      }
      const data = (await response.json()) as MemberResponse;
      return data.data || [];
    } catch (error) {
      console.error('[memberService] Error fetching members:', error);
      throw error;
    }
  },

  async deleteMember(
    memberId: string,
    currentUserId: string,
    currentUserRole: string
  ): Promise<void> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/members/${memberId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUserId,
          'x-user-role': currentUserRole,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete member');
      }
    } catch (error) {
      console.error('[memberService] Error deleting member:', error);
      throw error;
    }
  },

  async addTag(memberId: string, tagUid: string): Promise<Tag> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/members/${memberId}/tags`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tagUid }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add tag');
      }

      const data = (await response.json()) as { ok: boolean; data: Tag };
      return data.data;
    } catch (error) {
      console.error('[memberService] Error adding tag:', error);
      throw error;
    }
  },

  async getTags(memberId: string): Promise<Tag[]> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/members/${memberId}/tags`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch tags: ' + response.statusText);
      }

      const data = (await response.json()) as TagResponse;
      return data.data || [];
    } catch (error) {
      console.error('[memberService] Error fetching tags:', error);
      throw error;
    }
  },

  async removeTag(tagId: string): Promise<void> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/tags/${tagId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove tag');
      }
    } catch (error) {
      console.error('[memberService] Error removing tag:', error);
      throw error;
    }
  },

  async updateMember(memberId: string, updates: Partial<Member>): Promise<Member> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/members/${memberId}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update member');
      }

      const data = (await response.json()) as { ok: boolean; data: Member };
      return data.data;
    } catch (error) {
      console.error('[memberService] Error updating member:', error);
      throw error;
    }
  },

  async updateMemberTheme(
    memberId: string,
    preferredTheme: 'light' | 'dark' | 'auto'
  ): Promise<Member> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/members/${memberId}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferredTheme }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update theme preference');
      }

      const data = (await response.json()) as { ok: boolean; data: Member };
      return data.data;
    } catch (error) {
      console.error('[memberService] Error updating theme:', error);
      throw error;
    }
  },

  async updateMemberRoles(
    memberId: string,
    roles: string[],
    currentUserId: string,
    currentUserRole: string
  ): Promise<Member> {
    try {
      const apiUrl = getApiBaseUrl();
      const url = `${apiUrl}/members/${memberId}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUserId,
          'x-user-role': currentUserRole,
        },
        body: JSON.stringify({ roles }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update roles');
      }

      const data = (await response.json()) as { ok: boolean; data: Member };
      return data.data;
    } catch (error) {
      console.error('[memberService] Error updating roles:', error);
      throw error;
    }
  },
};
