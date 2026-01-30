import { Request, Response, Router } from 'express';
import { getDatabase } from '../db/couchdb';
import { Member, CreateMemberRequest, UpdateMemberRequest } from '../types/member';

const log = (message: string): void => {
  console.log(`[member-routes] ${message}`);
};

export const createMemberRoutes = (): Router => {
  const router = Router();

  // GET /members - Get all members
  router.get('/members', async (_req: Request, res: Response) => {
    try {
      log('Fetching all members');
      const db = getDatabase();
      const result = await db.list({ include_docs: true });
      const members = result.rows
        .filter((row) => row.doc && !row.id.startsWith('_design') && row.doc.firstName)
        .map((row) => row.doc as Member);

      log(`Found ${members.length} members`);
      res.status(200).json({ ok: true, data: members });
    } catch (err) {
      log(`Error fetching members: ${(err as Error).message}`);
      res.status(500).json({ ok: false, error: 'Failed to fetch members' });
    }
  });

  // GET /members/:id - Get member by ID
  router.get('/members/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      log(`Fetching member: ${id}`);
      const db = getDatabase();

      // Find member by id field (not _id)
      const result = await db.find({
        selector: { id: { $eq: id } },
        limit: 1,
      });

      if (result.docs.length === 0) {
        res.status(404).json({ ok: false, error: 'Member not found' });
        return;
      }

      res.status(200).json({ ok: true, data: result.docs[0] });
    } catch (err) {
      log(`Error fetching member: ${(err as Error).message}`);
      res.status(500).json({ ok: false, error: 'Failed to fetch member' });
    }
  });

  // GET /members/by-tag/:tagUid - Get member by tag UID
  router.get('/members/by-tag/:tagUid', async (req: Request, res: Response) => {
    try {
      const { tagUid } = req.params;
      log(`Fetching member by tag: ${tagUid}`);
      const db = getDatabase();

      const result = await db.find({
        selector: { tagUid: { $eq: tagUid } },
        limit: 1,
      });

      if (result.docs.length === 0) {
        res.status(404).json({ ok: false, error: 'Member not found' });
        return;
      }

      res.status(200).json({ ok: true, data: result.docs[0] });
    } catch (err) {
      log(`Error fetching member by tag: ${(err as Error).message}`);
      res.status(500).json({ ok: false, error: 'Failed to fetch member' });
    }
  });

  // POST /members - Create new member
  router.post('/members', async (req: Request, res: Response) => {
    try {
      const memberData: CreateMemberRequest = req.body;
      log(`Creating member: ${memberData.firstName} ${memberData.lastName}`);
      const db = getDatabase();

      // Generate new ID
      const allMembers = await db.list({ include_docs: false });
      const newId = (allMembers.rows.length + 1).toString();

      const newMember: Omit<Member, '_id' | '_rev'> = {
        id: newId,
        firstName: memberData.firstName,
        lastName: memberData.lastName,
        tagUid: memberData.tagUid,
        email: memberData.email,
        phone: memberData.phone,
        roles: memberData.roles ?? ['mitglied'],
        joinDate: new Date().toISOString().split('T')[0],
        isActive: true,
      };

      const result = await db.insert(newMember);
      log(`Member created with ID: ${newId}`);

      res.status(201).json({ ok: true, data: { ...newMember, _id: result.id, _rev: result.rev } });
    } catch (err) {
      log(`Error creating member: ${(err as Error).message}`);
      res.status(500).json({ ok: false, error: 'Failed to create member' });
    }
  });

  // PUT /members/:id - Update member
  router.put('/members/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates: UpdateMemberRequest = req.body;
      log(`Updating member: ${id}`);
      const db = getDatabase();

      // Find existing member
      const result = await db.find({
        selector: { id: { $eq: id } },
        limit: 1,
      });

      if (result.docs.length === 0) {
        res.status(404).json({ ok: false, error: 'Member not found' });
        return;
      }

      const existingMember = result.docs[0];
      const updatedMember: Member = {
        ...existingMember,
        ...updates,
        _id: existingMember._id,
        _rev: existingMember._rev,
        id: existingMember.id, // Prevent ID change
      };

      const updateResult = await db.insert(updatedMember);
      log(`Member updated: ${id}`);

      res.status(200).json({ ok: true, data: { ...updatedMember, _rev: updateResult.rev } });
    } catch (err) {
      log(`Error updating member: ${(err as Error).message}`);
      res.status(500).json({ ok: false, error: 'Failed to update member' });
    }
  });

  // DELETE /members/:id - Delete member (soft delete)
  router.delete('/members/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUserId = req.headers['x-user-id'] as string;
      const currentUserRole = req.headers['x-user-role'] as string;
      
      log(`Deleting member: ${id}, requested by: ${currentUserId} (${currentUserRole})`);
      
      // Check if user is trying to delete themselves
      if (currentUserId === id) {
        res.status(403).json({ ok: false, error: 'Sie können sich nicht selbst löschen' });
        return;
      }
      
      const db = getDatabase();

      // Find existing member
      const result = await db.find({
        selector: { id: { $eq: id } },
        limit: 1,
      });

      if (result.docs.length === 0) {
        res.status(404).json({ ok: false, error: 'Member not found' });
        return;
      }

      const member = result.docs[0];
      
      // Check if trying to delete an admin user
      const isTargetAdmin = member.roles && member.roles.includes('admin');
      const isCurrentUserAdmin = currentUserRole === 'admin';
      
      if (isTargetAdmin && !isCurrentUserAdmin) {
        res.status(403).json({ ok: false, error: 'Nur Administratoren können andere Administratoren löschen' });
        return;
      }

      // Soft delete by setting isActive to false
      member.isActive = false;
      await db.insert(member);

      log(`Member soft deleted: ${id}`);
      res.status(200).json({ ok: true, message: 'Member deleted' });
    } catch (err) {
      log(`Error deleting member: ${(err as Error).message}`);
      res.status(500).json({ ok: false, error: 'Failed to delete member' });
    }
  });

  return router;
};
