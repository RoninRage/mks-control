import { getDatabase, getTagDatabase } from './couchdb';
import type { Member } from '../types/member';

export interface TagLookupResult {
  member: Member | null;
  // True when the tag belongs to a member who is deactivated.
  isInactive: boolean;
}

/**
 * Resolves a tag UID to its member. Active tags win; inactive tags are still resolved so
 * a deactivated member can be told apart from an unknown tag.
 */
export const findMemberByTagUid = async (uid: string): Promise<TagLookupResult> => {
  const tagDb = getTagDatabase();
  let tagResult = await tagDb.find({
    selector: { tagUid: { $eq: uid }, isActive: { $eq: true } },
    limit: 1,
  });
  if (tagResult.docs.length === 0) {
    tagResult = await tagDb.find({ selector: { tagUid: { $eq: uid } }, limit: 1 });
  }
  if (tagResult.docs.length === 0) {
    return { member: null, isInactive: false };
  }

  const member = await findMemberById(tagResult.docs[0].memberId);
  return { member, isInactive: member?.isActive === false };
};

export const findMemberById = async (id: string): Promise<Member | null> => {
  const db = getDatabase<Member>();
  const result = await db.find({ selector: { id: { $eq: id } }, limit: 1 });
  return result.docs[0] ?? null;
};

export const getAdminTagUids = (): string[] =>
  (process.env.ADMIN_TAG_UIDS || '')
    .split(',')
    .map((uid) => uid.trim().toLowerCase())
    .filter((uid) => uid.length > 0);

export const isAdminTagUid = (uid: string): boolean =>
  getAdminTagUids().includes(uid.toLowerCase());
