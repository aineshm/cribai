import { z } from 'zod';

export const listingSummarySchema = z.object({
  id: z.string().uuid(),
  address: z.string(),
  rentMonthly: z.number(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().nullable(),
  fairnessScore: z.number().min(1).max(10).nullable(),
  trueCostTotal: z.number().nullable(),
  amenities: z.array(z.string()).default([]),
  campusSlug: z.string().optional(),
});

export type ListingSummary = z.infer<typeof listingSummarySchema>;

export const scoredListingSchema = listingSummarySchema.extend({
  matchScore: z.number().min(0).max(100),
  matchReasons: z.array(z.string()),
});

export type ScoredListing = z.infer<typeof scoredListingSchema>;

export const textBlockSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
});

export const listingCardBlockSchema = z.object({
  type: z.literal('listing_card'),
  listings: z.array(listingSummarySchema),
});

export const comparisonBlockSchema = z.object({
  type: z.literal('comparison'),
  listings: z.array(listingSummarySchema),
});

export const tourConfirmationBlockSchema = z.object({
  type: z.literal('tour_confirmation'),
  tourRequestId: z.string().uuid(),
  listingAddress: z.string(),
  status: z.string(),
});

export const legalDisclaimerBlockSchema = z.object({
  type: z.literal('legal_disclaimer'),
  term: z.string(),
  explanation: z.string(),
  disclaimer: z.string(),
});

export const recommendationsBlockSchema = z.object({
  type: z.literal('recommendations'),
  results: z.array(scoredListingSchema),
});

export const toolLoadingBlockSchema = z.object({
  type: z.literal('tool_loading'),
  toolName: z.string(),
});

export const chatBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  listingCardBlockSchema,
  comparisonBlockSchema,
  tourConfirmationBlockSchema,
  legalDisclaimerBlockSchema,
  recommendationsBlockSchema,
  toolLoadingBlockSchema,
]);

export type ChatBlock = z.infer<typeof chatBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type ListingCardBlock = z.infer<typeof listingCardBlockSchema>;
export type ComparisonBlock = z.infer<typeof comparisonBlockSchema>;
export type TourConfirmationBlock = z.infer<typeof tourConfirmationBlockSchema>;
export type LegalDisclaimerBlock = z.infer<typeof legalDisclaimerBlockSchema>;
export type RecommendationsBlock = z.infer<typeof recommendationsBlockSchema>;
export type ToolLoadingBlock = z.infer<typeof toolLoadingBlockSchema>;
