import type { ToolContext, ToolResult } from './types';
import { searchListings } from './handlers/search-listings';
import { getListingDetail } from './handlers/get-listing-detail';
import { compareListings } from './handlers/compare-listings';
import { scheduleTour } from './handlers/schedule-tour';
import { explainLeaseTerm } from './handlers/explain-lease-term';
import { getLandlordInfo } from './handlers/get-landlord-info';
import { getSavedListings } from './handlers/get-saved-listings';
import { webSearch } from './handlers/web-search';

const HANDLERS: Record<string, (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>> = {
  search_listings: searchListings,
  get_listing_detail: getListingDetail,
  compare_listings: compareListings,
  schedule_tour: scheduleTour,
  explain_lease_term: explainLeaseTerm,
  get_landlord_info: getLandlordInfo,
  get_saved_listings: getSavedListings,
  web_search: webSearch,
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler(args, context);
}
