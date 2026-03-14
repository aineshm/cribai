import { z } from 'zod';

export const trueCostSchema = z.object({
  rent: z.number(),
  utilities: z.number(),
  parking: z.number(),
  internet: z.number(),
  laundry: z.number(),
  renterInsurance: z.number(),
  moveInFees: z.number(),
  total: z.number(),
});

export type TrueCost = z.infer<typeof trueCostSchema>;

export const fairnessDataSchema = z.object({
  comparableCount: z.number(),
  percentile: z.number(),
  predictedRent: z.number(),
  delta: z.number(),
  breakdown: z.record(z.number()).optional(),
});

export type FairnessData = z.infer<typeof fairnessDataSchema>;

export const listingSchema = z.object({
  id: z.string().uuid(),
  campusId: z.string().uuid(),
  externalId: z.string(),
  source: z.string(),
  rawData: z.record(z.unknown()),
  address: z.string(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  rentMonthly: z.number().nullable(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().nullable(),
  amenities: z.array(z.string()).default([]),
  photoUrls: z.array(z.string()).default([]),
  sourceUrl: z.string().nullable().default(null),
  availableDate: z.string().nullable(),
  trueCost: trueCostSchema.nullable().default(null),
  trueCostTotal: z.number().nullable().default(null),
  fairnessScore: z.number().min(1).max(10).nullable().default(null),
  fairnessData: fairnessDataSchema.nullable().default(null),
  isActive: z.boolean().default(true),
  firstSeenAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
  embeddingText: z.string().nullable().optional(),
  lastEmbeddedAt: z.string().datetime().nullable().optional(),
});

export type Listing = z.infer<typeof listingSchema>;

export const listingSubmissionSchema = z.object({
  address: z.string().min(5, 'Address must be at least 5 characters').max(200),
  rent_monthly: z.number().positive('Rent must be positive').max(10000),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0).max(10).optional(),
  sqft: z.number().positive().optional(),
  amenities: z.array(z.string()).default([]),
  photo_urls: z.array(z.string().url('Invalid photo URL')).default([]),
  available_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  description: z.string().max(2000).optional(),
  contact_email: z.string().email('Invalid email address'),
  source_url: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export type ListingSubmission = z.infer<typeof listingSubmissionSchema>;
