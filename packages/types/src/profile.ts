import { z } from 'zod';

export const verificationStatusSchema = z.enum(['unverified', 'pending', 'verified', 'rejected']);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const subscriptionTierSchema = z.enum(['free', 'pro', 'premium']);
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

export const profileSchema = z.object({
  id: z.string().uuid(),
  campusId: z.string().uuid().nullable(),
  displayName: z.string().nullable(),
  eduEmail: z.string().email().nullable(),
  isEduVerified: z.boolean().default(false),
  verificationStatus: verificationStatusSchema.default('unverified'),
  subscriptionTier: subscriptionTierSchema.default('free'),
  stripeCustomerId: z.string().nullable().default(null),
  createdAt: z.string().datetime().optional(),
});

export type Profile = z.infer<typeof profileSchema>;
