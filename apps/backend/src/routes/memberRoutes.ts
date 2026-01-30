import { Request, Response, Router } from 'express';

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
}

// Mock members data
const mockMembers: Member[] = [
  { id: '1', firstName: 'Max', lastName: 'Mustermann' },
  { id: '2', firstName: 'Erika', lastName: 'Musterfrau' },
  { id: '3', firstName: 'Hans', lastName: 'Schmidt' },
  { id: '4', firstName: 'Maria', lastName: 'Müller' },
  { id: '5', firstName: 'Klaus', lastName: 'Weber' },
  { id: '6', firstName: 'Anna', lastName: 'Meyer' },
  { id: '7', firstName: 'Peter', lastName: 'Fischer' },
  { id: '8', firstName: 'Sophia', lastName: 'Wagner' },
];

export const createMemberRoutes = (): Router => {
  const router = Router();

  router.get('/members', (_req: Request, res: Response) => {
    console.log('[member-routes] Fetching all members');
    res.status(200).json({ ok: true, data: mockMembers });
  });

  return router;
};
