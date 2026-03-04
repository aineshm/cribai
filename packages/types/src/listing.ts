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
  rentMonthly: z.number(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().nullable(),
  amenities: z.array(z.string()).default([]),
  availableDate: z.string().nullable(),
  trueCost: trueCostSchema.nullable().default(null),
  trueCostTotal: z.number().nullable().default(null),
  fairnessScore: z.number().min(1).max(10).nullable().default(null),
  fairnessData: fairnessDataSchema.nullable().default(null),
  isActive: z.boolean().default(true),
  firstSeenAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
});

export type Listing = z.infer<typeof listingSchema>;
