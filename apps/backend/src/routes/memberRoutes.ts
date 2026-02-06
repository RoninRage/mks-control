import { Request, Response, Router } from 'express';
import { getDatabase } from '../db/couchdb';
import { Member, CreateMemberRequest, UpdateMemberRequest } from '../types/member';
import { Equipment } from '../types/equipment';
import { Area } from '../types/area';

/**
 * Auto-grant equipment permissions when member is assigned bereichsleitung role
 * Queries all equipment in the specified area and grants access to the member
 */
const autoGrantEquipmentPermissions = async (
  memberId: string,
  areaIds: string[]
): Promise<Record<string, boolean>> => {
  try {
    const equipmentDb = getDatabase<Equipment>();
    const permissions: Record<string, boolean> = {};

    for (const areaId of areaIds) {
      const result = await equipmentDb.find({
        selector: { areaId: { $eq: areaId } },
      });

      for (const equipment of result.docs) {
        permissions[equipment.id] = true;
      }
    }

    return permissions;
  } catch (error) {
    return {};
  }
};

export const createMemberRoutes = (): Router => {
  const router = Router();

  // GET /members - Get all members
  router.get('/members', async (req: Request, res: Response) => {
    try {
      const { search, areaId, limit = '50', offset = '0' } = req.query;
      const searchQuery = (search as string) || '';
      const areaIdFilter = (areaId as string) || '';
      const pageLimit = Math.min(Math.max(parseInt(limit as string) || 50, 1), 100);
      const pageOffset = Math.max(parseInt(offset as string) || 0, 0);

      const db = getDatabase();
      const result = await db.list({ include_docs: true });

      let allMembers = result.rows
        .filter((row) => row.doc && !row.id.startsWith('_design') && row.doc.firstName)
        .map((row) => row.doc as Member);

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        allMembers = allMembers.filter(
          (member) =>
            member.firstName.toLowerCase().includes(query) ||
            member.lastName.toLowerCase().includes(query) ||
            `${member.firstName} ${member.lastName}`.toLowerCase().includes(query) ||
            (member.email?.toLowerCase().includes(query) ?? false)
        );
      }

      // Note: Area-based filtering would require member→area mapping
      // For now, we just provide the search results
      // In a full implementation, you'd filter by members in a specific area

      const totalCount = allMembers.length;
      const paginatedMembers = allMembers.slice(pageOffset, pageOffset + pageLimit);

      res.status(200).json({
        ok: true,
        data: paginatedMembers,
        pagination: {
          total: totalCount,
          limit: pageLimit,
          offset: pageOffset,
          hasMore: pageOffset + pageLimit < totalCount,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Failed to fetch members' });
    }
  });

  // GET /members/:id - Get member by ID
  router.get('/members/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
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
      res.status(500).json({ ok: false, error: 'Failed to fetch member' });
    }
  });

  // GET /members/by-tag/:tagUid - Get member by tag UID
  router.get('/members/by-tag/:tagUid', async (req: Request, res: Response) => {
    try {
      const { tagUid } = req.params;
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
      res.status(500).json({ ok: false, error: 'Failed to fetch member' });
    }
  });

  // POST /members - Create new member
  router.post('/members', async (req: Request, res: Response) => {
    try {
      const memberData: CreateMemberRequest = req.body;
      const db = getDatabase();

      // Generate new ID
      const allMembers = await db.list({ include_docs: false });
      const newId = (allMembers.rows.length + 1).toString();

      // Ensure 'mitglied' role is always present (default role for all users)
      let roles = memberData.roles || [];
      if (!roles.includes('mitglied')) {
        roles = [...roles, 'mitglied'];
      }
      // If no roles provided at all, default to ['mitglied']
      if (roles.length === 0) {
        roles = ['mitglied'];
      }

      const now = new Date().toISOString();
      const newMember: Omit<Member, '_id' | '_rev'> = {
        id: newId,
        firstName: memberData.firstName,
        lastName: memberData.lastName,
        tagUid: memberData.tagUid,
        email: memberData.email,
        phone: memberData.phone,
        roles: roles,
        joinDate: new Date().toISOString().split('T')[0],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      const result = await db.insert(newMember);
      res.status(201).json({ ok: true, data: { ...newMember, _id: result.id, _rev: result.rev } });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Failed to create member' });
    }
  });

  // PUT /members/:id - Update member
  router.put('/members/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates: UpdateMemberRequest = req.body;
      const currentUserId = req.headers['x-user-id'] as string;
      const currentUserRole = req.headers['x-user-role'] as string;

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
      const now = new Date().toISOString();

      // Special authorization checks for role updates
      if (updates.roles !== undefined) {
        // Only admin and vorstand can assign roles
        if (currentUserRole !== 'admin' && currentUserRole !== 'vorstand') {
          res.status(403).json({ ok: false, error: 'Keine Berechtigung zum Ändern von Rollen' });
          return;
        }

        // Validate role IDs
        const allowedRoles = ['admin', 'vorstand', 'bereichsleitung', 'mitglied'];
        const invalidRoles = updates.roles.filter((role) => !allowedRoles.includes(role));
        if (invalidRoles.length > 0) {
          res
            .status(400)
            .json({ ok: false, error: `Ungültige Rollen: ${invalidRoles.join(', ')}` });
          return;
        }

        // Ensure 'mitglied' role is always present (default role)
        if (!updates.roles.includes('mitglied')) {
          res
            .status(400)
            .json({ ok: false, error: 'Die Rolle "Mitglied" kann nicht entfernt werden' });
          return;
        }

        // Prevent users from modifying their own roles
        if (currentUserId === id) {
          res.status(403).json({ ok: false, error: 'Sie können Ihre eigenen Rollen nicht ändern' });
          return;
        }

        // Check if removing last admin
        const wasAdmin = existingMember.roles && existingMember.roles.includes('admin');
        const willBeAdmin = updates.roles.includes('admin');

        if (wasAdmin && !willBeAdmin) {
          // Query all active members with admin role
          const activeAdmins = await db.find({
            selector: {
              isActive: { $eq: true },
              roles: { $elemMatch: { $eq: 'admin' } },
            },
          });

          const adminCount = activeAdmins.docs.length;

          if (adminCount <= 1) {
            res
              .status(400)
              .json({ ok: false, error: 'Mindestens ein Administrator muss erhalten bleiben' });
            return;
          }
        }
      }

      const updatedMember: Member = {
        ...existingMember,
        ...updates,
        _id: existingMember._id,
        _rev: existingMember._rev,
        id: existingMember.id, // Prevent ID change
        createdAt: existingMember.createdAt ?? now,
        updatedAt: now,
      };

      // Auto-grant equipment permissions if assigning bereichsleitung role
      if (updates.roles && updates.roles.includes('bereichsleitung')) {
        // Find areas managed by this member (for now, we assume all areas if no specific mapping)
        // In a full implementation, you'd query a mapping of members to areas they manage
        const areaDb = getDatabase<Area>();
        const areas = await areaDb.find({
          selector: { bereichsleiterIds: { $elemMatch: { $eq: id } } },
        });

        if (areas.docs.length > 0) {
          const areaIds = areas.docs.map((area) => area.id);
          const autoGrantedPermissions = await autoGrantEquipmentPermissions(id, areaIds);
          updatedMember.equipmentPermissions = {
            ...updatedMember.equipmentPermissions,
            ...autoGrantedPermissions,
          };
        }
      }

      const updateResult = await db.insert(updatedMember);
      res.status(200).json({ ok: true, data: { ...updatedMember, _rev: updateResult.rev } });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Failed to update member' });
    }
  });

  // DELETE /members/:id - Delete member (soft delete)
  router.delete('/members/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const currentUserId = req.headers['x-user-id'] as string;
      const currentUserRole = req.headers['x-user-role'] as string;

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
        res
          .status(403)
          .json({ ok: false, error: 'Nur Administratoren können andere Administratoren löschen' });
        return;
      }

      // Soft delete by setting isActive to false
      const now = new Date().toISOString();
      member.isActive = false;
      member.createdAt = member.createdAt ?? now;
      member.updatedAt = now;
      await db.insert(member);

      res.status(200).json({ ok: true, message: 'Member deleted' });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Failed to delete member' });
    }
  });

  // PUT /members/:id/equipment-permissions/:equipmentId - Toggle equipment permission for a member
  router.put(
    '/members/:id/equipment-permissions/:equipmentId',
    async (req: Request, res: Response) => {
      try {
        const { id, equipmentId } = req.params;
        const { allowed } = req.body as { allowed: boolean };
        const currentUserId = req.headers['x-user-id'] as string;
        const currentUserRole = req.headers['x-user-role'] as string;

        // Check authorization
        if (currentUserRole !== 'admin' && currentUserRole !== 'vorstand') {
          // For Bereichsleiter, verify they manage the area containing this equipment
          if (currentUserRole === 'bereichsleitung') {
            // Get equipment to find its area
            const equipmentDb = getDatabase<Equipment>();
            const equipmentResult = await equipmentDb.find({
              selector: { id: { $eq: equipmentId } },
              limit: 1,
            });

            if (equipmentResult.docs.length === 0) {
              res.status(404).json({ ok: false, error: 'Equipment not found' });
              return;
            }

            const equipment = equipmentResult.docs[0];
            if (!equipment.areaId) {
              res.status(400).json({ ok: false, error: 'Equipment has no assigned area' });
              return;
            }

            // Check if current user manages this area
            const areaDb = getDatabase<Area>();
            const areaResult = await areaDb.find({
              selector: { id: { $eq: equipment.areaId } },
              limit: 1,
            });

            if (areaResult.docs.length === 0) {
              res.status(404).json({ ok: false, error: 'Area not found' });
              return;
            }

            const area = areaResult.docs[0];
            if (!area.bereichsleiterIds?.includes(currentUserId)) {
              res.status(403).json({ ok: false, error: 'Sie verwalten diese Fläche nicht' });
              return;
            }
          } else {
            res.status(403).json({
              ok: false,
              error: 'Keine Berechtigung zum Ändern von Ausrüstungsberechtigungen',
            });
            return;
          }
        }

        // Get the member
        const db = getDatabase<Member>();
        const memberResult = await db.find({
          selector: { id: { $eq: id } },
          limit: 1,
        });

        if (memberResult.docs.length === 0) {
          res.status(404).json({ ok: false, error: 'Member not found' });
          return;
        }

        const member = memberResult.docs[0];
        const now = new Date().toISOString();

        // Update permissions
        const permissions = member.equipmentPermissions || {};
        permissions[equipmentId] = allowed;

        const updatedMember: Member = {
          ...member,
          equipmentPermissions: permissions,
          createdAt: member.createdAt ?? now,
          updatedAt: now,
        };

        const result = await db.insert(updatedMember);
        res.status(200).json({ ok: true, data: { ...updatedMember, _rev: result.rev } });
      } catch (err) {
        res.status(500).json({ ok: false, error: 'Failed to update equipment permission' });
      }
    }
  );

  return router;
};
