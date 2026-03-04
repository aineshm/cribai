import { z } from 'zod';

export const aiQueryLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  queryText: z.string(),
  tokensUsed: z.number().nullable(),
  createdAt: z.string().datetime().optional(),
});

export type AiQueryLog = z.infer<typeof aiQueryLogSchema>;
