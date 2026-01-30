export interface Tag {
  _id?: string;
  _rev?: string;
  id: string;
  tagUid: string;
  memberId: string;
  createdAt: string;
  isActive: boolean;
}

export interface CreateTagRequest {
  tagUid: string;
  memberId: string;
}
