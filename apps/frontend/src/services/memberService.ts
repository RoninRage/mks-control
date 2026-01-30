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

interface MemberResponse {
  ok: boolean;
  data: Member[];
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
};
