import { z } from 'zod';

export const landlordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  company: z.string().nullable(),
  scorecard: z.record(z.number()).default({}),
  createdAt: z.string().datetime().optional(),
});

export type Landlord = z.infer<typeof landlordSchema>;

export const landlordReviewSchema = z.object({
  id: z.string().uuid(),
  landlordId: z.string().uuid(),
  userId: z.string().uuid(),
  listingId: z.string().uuid().nullable(),
  ratings: z.object({
    responsiveness: z.number().min(1).max(5),
    maintenance: z.number().min(1).max(5),
    fairness: z.number().min(1).max(5),
    overall: z.number().min(1).max(5),
  }),
  reviewText: z.string().nullable(),
  leaseVerified: z.boolean().default(false),
  leaseDocPath: z.string().nullable().default(null),
  createdAt: z.string().datetime().optional(),
});

export type LandlordReview = z.infer<typeof landlordReviewSchema>;
