import type { ToolContext, ToolResult, ToolName } from './types';
import { logAgentRun, sanitizeArgs, extractResultSummary } from './lib/agent-run-logger';
import { searchListings } from './handlers/search-listings';
import { getListingDetail } from './handlers/get-listing-detail';
import { compareListings } from './handlers/compare-listings';
import { scheduleTour } from './handlers/schedule-tour';
import { explainLeaseTerm } from './handlers/explain-lease-term';
import { getLandlordInfo } from './handlers/get-landlord-info';
import { getSavedListings } from './handlers/get-saved-listings';
import { webSearch } from './handlers/web-search';
import { getReviews } from './handlers/get-reviews';
import { contactPm } from './handlers/contact-pm';
import { getNeighborhoodInfo } from './handlers/get-neighborhood-info';

const HANDLERS: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  search_listings: searchListings,
  get_listing_detail: getListingDetail,
  compare_listings: compareListings,
  schedule_tour: scheduleTour,
  explain_lease_term: explainLeaseTerm,
  get_landlord_info: getLandlordInfo,
  get_saved_listings: getSavedListings,
  web_search: webSearch,
  get_reviews: getReviews,
  contact_pm: contactPm,
  get_neighborhood_info: getNeighborhoodInfo,
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  if (
    context.allowedToolNames &&
    !context.allowedToolNames.includes(name as ToolName)
  ) {
    throw new Error('This action requires signing in.');
  }

  const handler = HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const startMs = Date.now();

  try {
    const result = await handler(args, context);

    // Fire-and-forget: log successful tool run
    logAgentRun({
      userId: context.userId,
      campusId: context.campusId,
      toolName: name,
      argsSummary: sanitizeArgs(name, args),
      resultStatus: 'success',
      resultSummary: extractResultSummary(name, result),
      durationMs: Date.now() - startMs,
    });

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Fire-and-forget: log failed tool run
    logAgentRun({
      userId: context.userId,
      campusId: context.campusId,
      toolName: name,
      argsSummary: sanitizeArgs(name, args),
      resultStatus: 'error',
      errorMessage,
      durationMs: Date.now() - startMs,
    });

    throw err;
  }
}
