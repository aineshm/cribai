import { executeTool, type ChatEvent, type ToolContext } from '@campusnest/ai';
import {
  mergeConversationState,
  type ChatBlock,
  type ComparisonBlock,
  type ConversationState,
  type ListingCardBlock,
  type ListingSummary,
} from '@campusnest/types';

const ORDINAL_INDEX: Record<string, number> = {
  '1': 0,
  first: 0,
  one: 0,
  '2': 1,
  second: 1,
  two: 1,
  '3': 2,
  third: 2,
  three: 2,
  '4': 3,
  fourth: 3,
  four: 3,
};

const AMENITY_KEYWORDS = [
  'parking',
  'laundry',
  'gym',
  'pool',
  'balcony',
  'dishwasher',
  'ac',
  'air conditioning',
  'pet',
  'furnished',
] as const;

export interface DeterministicTurnResult {
  readonly events: readonly ChatEvent[];
  readonly blocks: readonly ChatBlock[];
  readonly conversationState: ConversationState;
  readonly flow:
    | 'search'
    | 'detail'
    | 'compare'
    | 'tour_prep'
    | 'tour_submit';
  readonly toolCount: number;
}

interface DeterministicTurnArgs {
  readonly query: string;
  readonly toolContext: ToolContext;
  readonly conversationState: ConversationState;
  readonly listingId?: string | null;
}

function looksLikeTourTurn(query: string): boolean {
  return /(book|schedule|set up).*(tour|visit)|tour.*(for|with|next week|tomorrow|today)/i.test(query);
}

function looksLikeTourFollowUp(query: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(query) || /\b\d{4}-\d{2}-\d{2}\b/.test(query);
}

function looksLikeCompareTurn(query: string): boolean {
  return /\bcompare\b|\bvs\b|\bversus\b|first two|top 2|top two/i.test(query);
}

function looksLikeSearchTurn(query: string): boolean {
  return /\b(find|show|search|browse|looking for|need)\b|\b(apartments?|listings?|subleases?|housing|studio|bedroom|rent|budget)\b/i.test(query);
}

function looksLikeListingDetailTurn(query: string): boolean {
  return /\b(this|current)\s+(listing|place|apartment|unit|home)\b|\b(tell me|details?|info|information|what do you think|thoughts)\b.*\b(listing|place|apartment|unit|home)\b|\blisting\s+at\b|\b(what(?:'s| is)|how many|does it|is it|are there|when is|what are)\b.*\b(rent|price|bedrooms?|bathrooms?|sqft|square feet|amenities|available|fairness|utilities|parking|address)\b/i.test(query);
}

function resolveOrdinalIndexes(query: string): number[] {
  const matches = query.toLowerCase().match(/\b(first|second|third|fourth|one|two|three|four|1|2|3|4)\b/g) ?? [];
  const indexes = matches
    .map((match) => ORDINAL_INDEX[match])
    .filter((value): value is number => value !== undefined);
  return [...new Set(indexes)];
}

function resolveReferencedListingIds(
  query: string,
  state: ConversationState,
  count = 1,
): string[] {
  const resultIds = state.lastSearch.resultListingIds;
  if (resultIds.length === 0) {
    return state.selectedListingId ? [state.selectedListingId] : [];
  }

  if (/first two|top two|top 2/i.test(query)) {
    return resultIds.slice(0, 2);
  }

  const ordinals = resolveOrdinalIndexes(query);
  if (ordinals.length > 0) {
    return ordinals
      .map((index) => resultIds[index])
      .filter((id): id is string => typeof id === 'string')
      .slice(0, count);
  }

  if (state.selectedListingId) {
    return [state.selectedListingId];
  }

  return resultIds.slice(0, count);
}

function parseSearchArgs(query: string): Record<string, unknown> {
  const lower = query.toLowerCase();
  const args: Record<string, unknown> = {};

  const bedroomMatch = lower.match(/\b([0-9]+)\s*(?:bed|br|bedroom)s?\b/);
  if (bedroomMatch) {
    args.bedrooms = Number(bedroomMatch[1]);
  } else if (/\bstudio\b(?!\s+city\b)/.test(lower)) {
    args.bedrooms = 0;
  }

  const maxRentMatch = lower.match(/(?:under|below|max(?:imum)?|less than)\s*\$?\s*([0-9]{3,5})/);
  if (maxRentMatch) {
    args.max_rent = Number(maxRentMatch[1]);
  }

  const minRentMatch = lower.match(/(?:over|above|min(?:imum)?|at least)\s*\$?\s*([0-9]{3,5})/);
  if (minRentMatch) {
    args.min_rent = Number(minRentMatch[1]);
  }

  if (/\b(fair|best value|good deal|deal)\b/i.test(query)) {
    args.sort = 'fairness';
  }

  const nearMatch = query.match(/\bnear\s+([A-Za-z0-9 .'-]+)/i);
  if (nearMatch?.[1]) {
    args.address = nearMatch[1].trim();
  }

  const amenities = AMENITY_KEYWORDS.filter((keyword) => lower.includes(keyword));
  if (amenities.length > 0) {
    args.amenities = amenities;
  }

  if (Object.keys(args).length === 0 || !args.address) {
    args.semantic_query = query;
  }

  if (!args.sort) {
    args.sort = args.semantic_query ? 'relevance' : 'price_asc';
  }

  return args;
}

function getListingBlock(blocks: readonly ChatBlock[]): ListingCardBlock | null {
  const block = blocks.find((candidate) => candidate.type === 'listing_card');
  return block?.type === 'listing_card' ? block : null;
}

function summarizeListings(listings: readonly ListingSummary[]): string {
  return listings
    .slice(0, 3)
    .map((listing, index) => `${index + 1}. ${listing.address} for $${listing.rentMonthly ?? 'N/A'}/mo`)
    .join(' ');
}

function buildSearchText(block: ListingCardBlock): string {
  if (block.listings.length === 0) {
    return 'I did not find matching listings yet. Try widening your budget, reducing bedroom constraints, or searching a broader area.';
  }

  return `I found ${block.listings.length} matching listings. ${summarizeListings(block.listings)} You can say "compare the first two" or "book a tour for the second one".`;
}

function buildDetailText(block: ListingCardBlock): string {
  const listing = block.listings[0];
  if (!listing) {
    return 'I could not resolve that listing.';
  }

  return `${listing.address} is listed at $${listing.rentMonthly ?? 'N/A'}/mo for ${listing.bedrooms ?? '?'} bed and scores ${listing.fairnessScore ?? 'N/A'}/10 on fairness.`;
}

function buildCompareText(block: ComparisonBlock): string {
  const sortedByRent = [...block.listings].sort((a, b) => (a.rentMonthly ?? Number.MAX_SAFE_INTEGER) - (b.rentMonthly ?? Number.MAX_SAFE_INTEGER));
  const sortedByFairness = [...block.listings].sort((a, b) => (b.fairnessScore ?? 0) - (a.fairnessScore ?? 0));
  const cheapest = sortedByRent[0];
  const bestValue = sortedByFairness[0];

  if (!cheapest || !bestValue) {
    return 'I compared those listings.';
  }

  return `I compared ${block.listings.length} listings. The cheapest is ${cheapest.address} at $${cheapest.rentMonthly ?? 'N/A'}/mo, and the strongest fairness score is ${bestValue.address} at ${bestValue.fairnessScore ?? 'N/A'}/10.`;
}

function inferNameFromEmail(email?: string): string | undefined {
  if (!email) {
    return undefined;
  }

  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!local) {
    return undefined;
  }

  return local
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseTourRequestInput(query: string): {
  readonly student_email?: string;
  readonly student_name?: string;
  readonly preferred_dates: readonly string[];
} {
  const emailMatch = query.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const dateMatches = [...query.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  const nameMatch = query.match(/\b(?:my name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z '-]{1,60})/i);
  const inferredName = nameMatch?.[1]?.trim() ?? inferNameFromEmail(emailMatch?.[0]);

  return {
    student_email: emailMatch?.[0],
    student_name: inferredName,
    preferred_dates: dateMatches,
  };
}

function mergeToolState(
  state: ConversationState,
  patch?: Partial<ConversationState>,
): ConversationState {
  return mergeConversationState(state, patch ?? null);
}

async function runToolWithEvents(
  name: string,
  args: Record<string, unknown>,
  toolContext: ToolContext,
): Promise<{
  readonly events: readonly ChatEvent[];
  readonly blocks: readonly ChatBlock[];
  readonly statePatch?: Partial<ConversationState>;
}> {
  const result = await executeTool(name, args, toolContext);
  const events: ChatEvent[] = [
    { type: 'tool_call', name, args },
    {
      type: 'tool_result',
      name,
      block: result.clientBlock,
      machineData: result.machineData,
      statePatch: result.statePatch,
    },
  ];
  const blocks: ChatBlock[] = [result.clientBlock];

  if (result.mapBlock) {
    events.push({
      type: 'tool_result',
      name: `${name}_map`,
      block: result.mapBlock,
      machineData: result.machineData,
      statePatch: result.statePatch,
    });
    blocks.push(result.mapBlock);
  }

  return {
    events,
    blocks,
    statePatch: result.statePatch,
  };
}

async function buildDetailTurn(
  resolvedListingId: string,
  nextState: ConversationState,
  toolContext: ToolContext,
): Promise<DeterministicTurnResult> {
  const detail = await runToolWithEvents(
    'get_listing_detail',
    { listing_id: resolvedListingId },
    toolContext,
  );
  const mergedState = mergeToolState(nextState, detail.statePatch);
  const listingBlock = getListingBlock(detail.blocks);
  const textBlock: ChatBlock = {
    type: 'text',
    content: buildDetailText(listingBlock ?? { type: 'listing_card', listings: [] }),
  };
  return {
    flow: 'detail',
    toolCount: 1,
    conversationState: mergedState,
    blocks: [...detail.blocks, textBlock],
    events: [...detail.events, { type: 'text', content: textBlock.content }],
  };
}

export async function maybeHandleDeterministicTurn(
  args: DeterministicTurnArgs,
): Promise<DeterministicTurnResult | null> {
  const { query, toolContext, conversationState, listingId } = args;
  let nextState = conversationState;

  if (looksLikeCompareTurn(query) && nextState.lastSearch.resultListingIds.length >= 2) {
    const listingIds = resolveReferencedListingIds(query, nextState, 2);
    if (listingIds.length >= 2) {
      const compare = await runToolWithEvents(
        'compare_listings',
        { listing_ids: listingIds },
        toolContext,
      );
      nextState = mergeToolState(nextState, compare.statePatch);
      const compareBlock = compare.blocks.find((block) => block.type === 'comparison') as ComparisonBlock | undefined;
      const textBlock: ChatBlock = {
        type: 'text',
        content: buildCompareText(compareBlock ?? { type: 'comparison', listings: [] }),
      };
      return {
        flow: 'compare',
        toolCount: 1,
        conversationState: nextState,
        blocks: [...compare.blocks, textBlock],
        events: [...compare.events, { type: 'text', content: textBlock.content }],
      };
    }
  }

  if (looksLikeTourTurn(query) || (nextState.pendingAction.kind === 'tour' && looksLikeTourFollowUp(query))) {
    const resolvedListingId = listingId ?? resolveReferencedListingIds(query, nextState, 1)[0] ?? null;
    if (resolvedListingId) {
      const detail = await runToolWithEvents(
        'get_listing_detail',
        { listing_id: resolvedListingId },
        toolContext,
      );
      nextState = mergeToolState(nextState, detail.statePatch);

      const pendingTourPayload =
        nextState.pendingAction.kind === 'tour' && nextState.pendingAction.payload
          ? nextState.pendingAction.payload
          : null;
      const parsedTour = parseTourRequestInput(query);
      const studentEmail =
        parsedTour.student_email ??
        (typeof pendingTourPayload?.extractedEmail === 'string'
          ? pendingTourPayload.extractedEmail
          : undefined);
      const preferredDates = [
        ...new Set([
          ...(parsedTour.preferred_dates ?? []),
          ...((pendingTourPayload?.extractedDates as readonly string[] | undefined) ?? []),
        ]),
      ];
      const studentName =
        parsedTour.student_name ??
        (typeof pendingTourPayload?.studentName === 'string'
          ? pendingTourPayload.studentName
          : undefined) ??
        inferNameFromEmail(studentEmail);

      if (studentEmail && studentName && preferredDates.length > 0) {
        const scheduled = await runToolWithEvents(
          'schedule_tour',
          {
            listing_id: resolvedListingId,
            student_email: studentEmail,
            student_name: studentName,
            preferred_dates: preferredDates,
          },
          toolContext,
        );
        nextState = mergeConversationState(nextState, {
          mode: 'action',
          pendingAction: {
            kind: null,
            payload: null,
          },
        });
        return {
          flow: 'tour_submit',
          toolCount: 2,
          conversationState: nextState,
          blocks: [...detail.blocks, ...scheduled.blocks],
          events: [...detail.events, ...scheduled.events],
        };
      }

      const listingBlock = getListingBlock(detail.blocks);
      const listing = listingBlock?.listings[0];
      const pendingText: ChatBlock = {
        type: 'text',
        content: listing
          ? `I can set up a tour for ${listing.address}. I resolved the correct listing already, and I just need your email plus one or two exact dates in YYYY-MM-DD format.`
          : 'I resolved the listing for that tour request. I just need your email plus one or two exact dates in YYYY-MM-DD format.',
      };
      nextState = mergeConversationState(nextState, {
        mode: 'action',
        selectedListingId: resolvedListingId,
        pendingAction: {
          kind: 'tour',
          payload: {
            listingId: resolvedListingId,
            extractedDates: preferredDates,
            extractedEmail: studentEmail ?? null,
            studentName: studentName ?? null,
            rawQuery: query,
          },
        },
      });
      return {
        flow: 'tour_prep',
        toolCount: 1,
        conversationState: nextState,
        blocks: [...detail.blocks, pendingText],
        events: [...detail.events, { type: 'text', content: pendingText.content }],
      };
    }
  }

  const resolvedDetailListingId =
    listingId ?? resolveReferencedListingIds(query, nextState, 1)[0] ?? nextState.selectedListingId;
  if (resolvedDetailListingId && looksLikeListingDetailTurn(query)) {
    return buildDetailTurn(resolvedDetailListingId, nextState, toolContext);
  }

  if (looksLikeSearchTurn(query)) {
    const search = await runToolWithEvents(
      'search_listings',
      parseSearchArgs(query),
      toolContext,
    );
    nextState = mergeToolState(nextState, search.statePatch);
    const listingBlock = getListingBlock(search.blocks);
    const textBlock: ChatBlock = {
      type: 'text',
      content: buildSearchText(listingBlock ?? { type: 'listing_card', listings: [] }),
    };
    return {
      flow: 'search',
      toolCount: 1,
      conversationState: nextState,
      blocks: [...search.blocks, textBlock],
      events: [...search.events, { type: 'text', content: textBlock.content }],
    };
  }

  if (resolvedDetailListingId) {
    return buildDetailTurn(resolvedDetailListingId, nextState, toolContext);
  }

  return null;
}
