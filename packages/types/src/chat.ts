import { z } from 'zod';

export const listingSummarySchema = z.object({
  id: z.string().uuid(),
  address: z.string(),
  rentMonthly: z.number().nullable(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().nullable(),
  fairnessScore: z.number().min(1).max(10).nullable(),
  trueCostTotal: z.number().nullable(),
  amenities: z.array(z.string()).default([]),
  campusSlug: z.string().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().nullable().optional(),
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
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']),
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

export const mapListingSchema = listingSummarySchema.extend({
  latitude: z.number(),
  longitude: z.number(),
  photoUrl: z.string().nullable(),
});

export const mapBlockSchema = z.object({
  type: z.literal('map'),
  listings: z.array(mapListingSchema),
  center: z.object({ lat: z.number(), lng: z.number() }),
  zoom: z.number(),
});

export const webResultItemSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  listingId: z.string().uuid().nullable(),
});

export const webResultBlockSchema = z.object({
  type: z.literal('web_result'),
  results: z.array(webResultItemSchema),
});

export const conversationModeSchema = z.enum([
  'browse',
  'search',
  'listing_detail',
  'compare',
  'action',
  'mission',
]);

export const conversationStateSchema = z.object({
  version: z.literal(1),
  mode: conversationModeSchema,
  selectedListingId: z.string().uuid().nullable(),
  comparedListingIds: z.array(z.string().uuid()),
  lastSearch: z.object({
    args: z.record(z.string(), z.unknown()),
    resultListingIds: z.array(z.string().uuid()),
    generatedAt: z.string().nullable(),
    source: z.enum(['chat_search', 'explore_search', 'listing_cta']).nullable(),
  }),
  activeFilters: z.object({
    bedrooms: z.number().nullable().optional(),
    minRent: z.number().nullable().optional(),
    maxRent: z.number().nullable().optional(),
    amenities: z.array(z.string()).optional(),
    address: z.string().nullable().optional(),
    semanticQuery: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
  }),
  pendingAction: z.object({
    kind: z.enum(['tour', 'contact_pm', 'sublease_publish', 'mission']).nullable(),
    payload: z.record(z.string(), z.unknown()).nullable(),
  }),
});

export const chatBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  listingCardBlockSchema,
  comparisonBlockSchema,
  tourConfirmationBlockSchema,
  legalDisclaimerBlockSchema,
  toolLoadingBlockSchema,
  mapBlockSchema,
  webResultBlockSchema,
]);

export type ChatBlock = z.infer<typeof chatBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type ListingCardBlock = z.infer<typeof listingCardBlockSchema>;
export type ComparisonBlock = z.infer<typeof comparisonBlockSchema>;
export type TourConfirmationBlock = z.infer<typeof tourConfirmationBlockSchema>;
export type LegalDisclaimerBlock = z.infer<typeof legalDisclaimerBlockSchema>;
export type RecommendationsBlock = z.infer<typeof recommendationsBlockSchema>;
export type ToolLoadingBlock = z.infer<typeof toolLoadingBlockSchema>;
export type MapBlock = z.infer<typeof mapBlockSchema>;
export type MapListing = z.infer<typeof mapListingSchema>;
export type WebResultBlock = z.infer<typeof webResultBlockSchema>;
export type ConversationMode = z.infer<typeof conversationModeSchema>;
export type ConversationState = z.infer<typeof conversationStateSchema>;

export function createEmptyConversationState(): ConversationState {
  return {
    version: 1,
    mode: 'browse',
    selectedListingId: null,
    comparedListingIds: [],
    lastSearch: {
      args: {},
      resultListingIds: [],
      generatedAt: null,
      source: null,
    },
    activeFilters: {},
    pendingAction: {
      kind: null,
      payload: null,
    },
  };
}

export function normalizeConversationState(value: unknown): ConversationState {
  const parsed = conversationStateSchema.safeParse(value);
  return parsed.success ? parsed.data : createEmptyConversationState();
}

export function mergeConversationState(
  base: ConversationState,
  patch?: Partial<ConversationState> | null,
): ConversationState {
  if (!patch) {
    return base;
  }

  return {
    ...base,
    ...patch,
    lastSearch: patch.lastSearch
      ? {
          ...base.lastSearch,
          ...patch.lastSearch,
        }
      : base.lastSearch,
    activeFilters: patch.activeFilters
      ? {
          ...base.activeFilters,
          ...patch.activeFilters,
        }
      : base.activeFilters,
    pendingAction: patch.pendingAction
      ? {
          ...base.pendingAction,
          ...patch.pendingAction,
        }
      : base.pendingAction,
  };
}

// ============================================================
// Conversation persistence types
// ============================================================

export const conversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  lastMessagePreview: z.string().nullable(),
  conversationState: conversationStateSchema.default(createEmptyConversationState()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const conversationMessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  blocks: z.array(chatBlockSchema),
  createdAt: z.string(),
});

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
