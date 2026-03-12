import type { MissionStep, StepContext, StepResult } from '../../types';
import type { HousingSearchInput } from '@campusnest/types';
import type { ListingSummary } from '@campusnest/types';
import { searchListings } from '../../../tools/handlers/search-listings';
import type { ToolContext } from '../../../tools/types';

/**
 * Build a natural-language semantic query from HousingSearchInput.
 * Exported for unit testing.
 */
export function buildSearchQuery(input: HousingSearchInput): string {
  const parts: string[] = [];
  if (input.bedrooms != null) parts.push(`${input.bedrooms} bedroom`);
  if (input.maxRent != null) parts.push(`under $${input.maxRent}/month`);
  if (input.preferences) parts.push(input.preferences);
  if (input.dealbreakers?.length) {
    parts.push(`no ${input.dealbreakers.join(', no ')}`);
  }
  return parts.length > 0
    ? parts.join(', ')
    : 'affordable student housing near campus';
}

export const searchListingsStep: MissionStep = {
  id: 'search_listings',
  label: 'Searching listings',
  tool: 'search_listings',

  async run(ctx: StepContext): Promise<StepResult> {
    const input = ctx.input as HousingSearchInput;
    const query = buildSearchQuery(input);

    const toolCtx: ToolContext = {
      supabase: ctx.supabase,
      campusId: ctx.campusId,
      campusSlug: ctx.campusSlug,
      userId: ctx.userId,
    };

    const toolArgs: Record<string, unknown> = {
      semantic_query: query,
      limit: 10, // max allowed by schema
    };
    if (input.bedrooms != null) toolArgs.bedrooms = input.bedrooms;
    if (input.maxRent != null) toolArgs.max_rent = input.maxRent;

    const result = await searchListings(toolArgs, toolCtx);

    // Extract typed listings from the listing_card block
    const block = result.clientBlock as { type: string; listings?: ListingSummary[] };
    const rawListings: ListingSummary[] = block.listings ?? [];

    return {
      output: {
        rawListings,
        totalSearched: rawListings.length,
      },
    };
  },
};
