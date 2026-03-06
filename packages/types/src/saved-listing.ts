import { z } from 'zod';

export const savedListingSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  listing_id: z.string().uuid(),
  created_at: z.string().datetime(),
});

export type SavedListing = z.infer<typeof savedListingSchema>;
