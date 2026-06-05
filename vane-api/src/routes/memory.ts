import { Router } from 'express';
import { z } from 'zod';
import {
  getUserMemoryMeta,
  saveUserMemory,
} from '@/lib/memory';

export const memoryRouter = Router();

const putBodySchema = z.object({
  body: z.string(),
});

memoryRouter.get('/', async (_req, res) => {
  try {
    const meta = await getUserMemoryMeta();
    res.status(200).json(meta);
  } catch (err) {
    console.error('[memory] GET:', err);
    res.status(500).json({ message: 'Failed to load user memory.' });
  }
});

memoryRouter.put('/', async (req, res) => {
  try {
    const parsed = putBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid request body.' });
      return;
    }

    await saveUserMemory(parsed.data.body, 'user');
    const meta = await getUserMemoryMeta();
    res.status(200).json(meta);
  } catch (err) {
    console.error('[memory] PUT:', err);
    res.status(500).json({ message: 'Failed to save user memory.' });
  }
});
