import { randomUUID } from 'crypto';
import { Member } from '../../apps/backend/src/types/member';
import { Tag } from '../../apps/backend/src/types/tag';

/**
 * Factory functions to create test data with realistic German names and values
 * Uses unique IDs per invocation for test isolation
 */

// Realistic German first names
const germanFirstNames = [
  'Max',
  'Anna',
  'Lukas',
  'Emma',
  'Leon',
  'Mia',
  'Felix',
  'Sophie',
  'Jonas',
  'Lena',
  'Paul',
  'Hannah',
  'Noah',
  'Marie',
  'Ben',
  'Laura',
  'Elias',
  'Julia',
  'Tim',
  'Lisa',
  'Finn',
  'Sarah',
  'Jan',
  'Lisa',
];

// Realistic German last names
const germanLastNames = [
  'Müller',
  'Schmidt',
  'Schneider',
  'Fischer',
  'Weber',
  'Meyer',
  'Wagner',
  'Becker',
  'Schulz',
  'Hoffmann',
  'Koch',
  'Bauer',
  'Richter',
  'Klein',
  'Wolf',
  'Schröder',
  'Neumann',
  'Schwarz',
  'Zimmermann',
  'Braun',
  'Krüger',
  'Hofmann',
  'Hartmann',
  'Lange',
  'Schmitt',
  'Werner',
  'Schmitz',
  'Krause',
];

let nameCounter = 0;

/**
 * Get a realistic German name pair
 */
function getGermanName(): { firstName: string; lastName: string } {
  const firstIdx = nameCounter % germanFirstNames.length;
  const lastIdx = Math.floor(nameCounter / germanFirstNames.length) % germanLastNames.length;
  nameCounter++;

  return {
    firstName: germanFirstNames[firstIdx],
    lastName: germanLastNames[lastIdx],
  };
}

/**
 * Create a test member with realistic German data
 */
export function createTestMember(overrides: Partial<Member> = {}): Member {
  const { firstName, lastName } = getGermanName();
  const id = overrides.id || `test-member-${randomUUID()}`;

  // Generate email from name
  const emailName = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace('ü', 'ue').replace('ö', 'oe').replace('ä', 'ae')}`;
  const email = `${emailName}@example.com`;

  return {
    id,
    firstName,
    lastName,
    email,
    phone: overrides.phone || undefined,
    roles: overrides.roles || ['mitglied'],
    joinDate: overrides.joinDate || new Date().toISOString(),
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    preferredTheme: overrides.preferredTheme || 'auto',
    equipmentPermissions: overrides.equipmentPermissions || {},
    ...overrides,
  };
}

/**
 * Create a test admin member
 */
export function createTestAdmin(overrides: Partial<Member> = {}): Member {
  return createTestMember({
    roles: ['admin', 'mitglied'],
    ...overrides,
  });
}

/**
 * Create a test vorstand member
 */
export function createTestVorstand(overrides: Partial<Member> = {}): Member {
  return createTestMember({
    roles: ['vorstand', 'mitglied'],
    ...overrides,
  });
}

/**
 * Create a test bereichsleitung member
 */
export function createTestBereichsleitung(overrides: Partial<Member> = {}): Member {
  return createTestMember({
    roles: ['bereichsleitung', 'mitglied'],
    ...overrides,
  });
}

/**
 * Create a test tag linked to a member
 */
export function createTestTag(memberId: string, overrides: Partial<Tag> = {}): Tag {
  const tagUid = overrides.tagUid || `test-tag-${randomUUID()}`;
  const id = overrides.id || `tag-${tagUid}`;

  return {
    id,
    tagUid,
    memberId,
    createdAt: overrides.createdAt || new Date().toISOString(),
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    ...overrides,
  };
}

/**
 * Create a test admin tag (for use with ADMIN_TAG_UIDS environment variable)
 */
export function createTestAdminTag(memberId: string, overrides: Partial<Tag> = {}): Tag {
  return createTestTag(memberId, {
    tagUid: 'test-admin-tag-001',
    ...overrides,
  });
}

/**
 * Create a full test user with member and tag
 */
export interface TestUser {
  member: Member;
  tag: Tag;
}

export function createTestUser(
  overrides: {
    member?: Partial<Member>;
    tag?: Partial<Tag>;
  } = {}
): TestUser {
  const member = createTestMember(overrides.member);
  const tag = createTestTag(member.id, overrides.tag);

  return { member, tag };
}

/**
 * Create a full test admin user with member and tag
 */
export function createTestAdminUser(
  overrides: {
    member?: Partial<Member>;
    tag?: Partial<Tag>;
  } = {}
): TestUser {
  const member = createTestAdmin(overrides.member);
  const tag = createTestAdminTag(member.id, overrides.tag);

  return { member, tag };
}

/**
 * Create multiple test users
 */
export function createTestUsers(
  count: number,
  baseOverrides: {
    member?: Partial<Member>;
    tag?: Partial<Tag>;
  } = {}
): TestUser[] {
  return Array.from({ length: count }, () => createTestUser(baseOverrides));
}

/**
 * Reset the name counter (useful for deterministic tests)
 */
export function resetNameCounter(): void {
  nameCounter = 0;
}
