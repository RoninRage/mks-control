import { Request, Response, Router } from 'express';
import { nanoid } from 'nanoid';
import { getTagDatabase, getDatabase } from '../db/couchdb';
import { Tag, CreateTagRequest } from '../types/tag';
import { Member } from '../types/member';

export const createTagRoutes = (): Router => {
  const router = Router();

  // POST /members/:memberId/tags - Add a tag to a member
  router.post('/members/:memberId/tags', async (req: Request, res: Response) => {
    try {
      const { memberId } = req.params;
      const { tagUid } = req.body as CreateTagRequest;

      if (!tagUid || typeof tagUid !== 'string') {
        res.status(400).json({ ok: false, error: 'Tag-UID ist erforderlich' });
        return;
      }

      const db = getDatabase();
      const tagDb = getTagDatabase();

      // Verify member exists
      const memberResult = await db.find({
        selector: { id: { $eq: memberId } },
        limit: 1,
      });

      if (memberResult.docs.length === 0) {
        res.status(404).json({ ok: false, error: 'Mitglied nicht gefunden' });
        return;
      }

      // Check if tag is already assigned to another member
      const existingTagResult = await tagDb.find({
        selector: { tagUid: { $eq: tagUid }, isActive: { $eq: true } },
        limit: 1,
      });

      if (existingTagResult.docs.length > 0) {
        const existingTag = existingTagResult.docs[0];
        if (existingTag.memberId !== memberId) {
          res.status(409).json({
            ok: false,
            error: `Tag ist bereits einem anderen Mitglied zugewiesen`,
          });
          return;
        }
        // Tag already assigned to this member, return it
        res.status(200).json({ ok: true, data: existingTag });
        return;
      }

      // Create new tag
      const tagId = nanoid();
      const newTag: Tag = {
        id: tagId,
        tagUid,
        memberId,
        createdAt: new Date().toISOString(),
        isActive: true,
      };

      await tagDb.insert(newTag);
      res.status(201).json({ ok: true, data: newTag });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Fehler beim Hinzufügen des Tags' });
    }
  });

  // GET /members/:memberId/tags - Get all tags for a member
  router.get('/members/:memberId/tags', async (req: Request, res: Response) => {
    try {
      const { memberId } = req.params;

      const tagDb = getTagDatabase();
      const result = await tagDb.find({
        selector: { memberId: { $eq: memberId }, isActive: { $eq: true } },
      });

      const tags = result.docs as Tag[];
      res.status(200).json({ ok: true, data: tags });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Fehler beim Abrufen der Tags' });
    }
  });

  // DELETE /tags/:tagId - Remove a tag
  router.delete('/tags/:tagId', async (req: Request, res: Response) => {
    try {
      const { tagId } = req.params;

      const tagDb = getTagDatabase();
      const result = await tagDb.find({
        selector: { id: { $eq: tagId } },
        limit: 1,
      });

      if (result.docs.length === 0) {
        res.status(404).json({ ok: false, error: 'Tag nicht gefunden' });
        return;
      }

      const tag = result.docs[0];
      tag.isActive = false;
      await tagDb.insert(tag);

      res.status(200).json({ ok: true, message: 'Tag deleted' });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Fehler beim Löschen des Tags' });
    }
  });

  // GET /tags/by-uid/:tagUid - Get tag and associated member by UID
  router.get('/tags/by-uid/:tagUid', async (req: Request, res: Response) => {
    try {
      const { tagUid } = req.params;

      const tagDb = getTagDatabase();
      const result = await tagDb.find({
        selector: { tagUid: { $eq: tagUid }, isActive: { $eq: true } },
        limit: 1,
      });

      if (result.docs.length === 0) {
        res.status(404).json({ ok: false, error: 'Tag nicht gefunden', found: false });
        return;
      }

      const tag = result.docs[0];
      const db = getDatabase();
      const memberResult = await db.find({
        selector: { id: { $eq: tag.memberId } },
        limit: 1,
      });

      if (memberResult.docs.length === 0) {
        res
          .status(404)
          .json({ ok: false, error: 'Zugehöriges Mitglied nicht gefunden', found: false });
        return;
      }

      res.status(200).json({
        ok: true,
        found: true,
        data: { tag, member: memberResult.docs[0] },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Fehler beim Nachschlagen des Tags', found: false });
    }
  });

  return router;
};
