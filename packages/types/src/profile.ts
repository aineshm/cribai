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
  avatarUrl: z.string().url().nullable().default(null),
  graduationYear: z.number().int().min(2020).max(2035).nullable().default(null),
  major: z.string().max(200).nullable().default(null),
  profileCompletedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime().optional(),
});

export type Profile = z.infer<typeof profileSchema>;

/** Form validation schema — subset of fields users can edit */
export const profileFormSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100),
  graduationYear: z.number().int().min(2020).max(2035).optional(),
  major: z.string().max(200).optional(),
});

export type ProfileFormData = z.infer<typeof profileFormSchema>;
