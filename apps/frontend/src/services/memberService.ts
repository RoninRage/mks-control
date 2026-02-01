export interface Tag {
  _id?: string;
  _rev?: string;
  id: string;
  tagUid: string;
  memberId: string;
  createdAt: string;
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
}

interface MemberResponse {
  ok: boolean;
  data: Member[];
}

interface TagResponse {
  ok: boolean;
  data: Tag[];
}

const resolveApiUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, port } = window.location;

    // If frontend is on a different port than 3000, connect to backend on 3000
    if (port && port !== '3000') {
      return `http://${hostname}:3000/api`;
    }

    // Otherwise use same origin
    return '/api';
  }

  return 'http://localhost:3000/api';
};

export const memberService = {
  async getMembers(): Promise<Member[]> {
    try {
      const apiUrl = resolveApiUrl();
      const url = apiUrl + '/members';
      console.log('[memberService] Fetching members from:', url);
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
      const apiUrl = resolveApiUrl();
      const url = `${apiUrl}/members/${memberId}`;
      console.log('[memberService] Deleting member:', memberId);
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
      const apiUrl = resolveApiUrl();
      const url = `${apiUrl}/members/${memberId}/tags`;
      console.log('[memberService] Adding tag:', tagUid, 'to member:', memberId);
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
      const apiUrl = resolveApiUrl();
      const url = `${apiUrl}/members/${memberId}/tags`;
      console.log('[memberService] Fetching tags for member:', memberId);
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
      const apiUrl = resolveApiUrl();
      const url = `${apiUrl}/tags/${tagId}`;
      console.log('[memberService] Removing tag:', tagId);
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
      const apiUrl = resolveApiUrl();
      const url = `${apiUrl}/members/${memberId}`;
      console.log('[memberService] Updating member:', memberId, 'with:', updates);
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
      const apiUrl = resolveApiUrl();
      const url = `${apiUrl}/members/${memberId}`;
      console.log('[memberService] Updating theme for member:', memberId, 'to:', preferredTheme);
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
      const apiUrl = resolveApiUrl();
      const url = `${apiUrl}/members/${memberId}`;
      console.log('[memberService] Updating roles for member:', memberId, 'to:', roles);
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
