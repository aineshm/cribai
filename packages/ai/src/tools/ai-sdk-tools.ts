/**
 * Adapter factory that wraps existing CribAI tool handlers as Vercel AI SDK tools.
 * Each tool delegates to the same executeTool() used by the legacy engine,
 * preserving identical behavior and ChatEvent emissions.
 */
import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import type { ChatEvent } from '../cribai';
import type { ToolContext, ToolName } from './types';
import { executeTool } from './executor';

/**
 * Wraps executeTool with ChatEvent emission and error handling.
 * Returns modelContext string for AI SDK to feed back to the model.
 */
async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
  onToolEvent: (event: ChatEvent) => void,
): Promise<string> {
  onToolEvent({ type: 'tool_call', name, args });

  try {
    const result = await executeTool(name, args, context);
    onToolEvent({ type: 'tool_result', name, block: result.clientBlock });

    if (result.mapBlock) {
      onToolEvent({ type: 'tool_result', name: `${name}_map`, block: result.mapBlock });
    }

    if (result.missionRequest) {
      onToolEvent({
        type: 'mission_request',
        missionType: result.missionRequest.type,
        input: result.missionRequest.input,
      });
    }

    return result.modelContext;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Tool execution failed';
    onToolEvent({
      type: 'tool_result',
      name,
      block: { type: 'text', content: `Error: ${msg}` } as never,
    });
    return `Error: ${msg}`;
  }
}

// --- Zod schemas for each tool (mirrors schemas.ts FunctionDeclarations) ---

const searchListingsSchema = z.object({
  semantic_query: z.string().optional().describe(
    'Natural language description of what the user wants (e.g., "quiet place near campus with natural light")',
  ),
  address: z.string().optional().describe('Street address or location name to search near'),
  bedrooms: z.number().int().optional().describe('Number of bedrooms (0 for studio, 1-4+)'),
  min_rent: z.number().optional().describe('Minimum monthly rent in dollars'),
  max_rent: z.number().optional().describe('Maximum monthly rent in dollars'),
  min_fairness: z.number().optional().describe('Minimum fairness score (1-10)'),
  amenities: z.array(z.string()).optional().describe('Required amenities (e.g., "parking", "laundry", "ac")'),
  sort: z.enum(['price_asc', 'price_desc', 'fairness', 'relevance']).optional().describe('Sort order'),
  limit: z.number().int().optional().describe('Maximum number of results (default 5, max 10)'),
});

const getListingDetailSchema = z.object({
  listing_id: z.string().describe('UUID of the listing to fetch'),
});

const compareListingsSchema = z.object({
  listing_ids: z.array(z.string()).describe('UUIDs of listings to compare (2-4)'),
});

const scheduleTourSchema = z.object({
  listing_id: z.string().describe('UUID of the listing to tour'),
  student_name: z.string().describe('Full name of the student'),
  student_email: z.string().describe('Student email address'),
  preferred_dates: z.array(z.string()).describe('Preferred tour dates in YYYY-MM-DD format'),
  notes: z.string().optional().describe('Optional notes or special requests'),
});

const explainLeaseTermSchema = z.object({
  term: z.string().describe('The lease term or concept to explain'),
  context: z.string().optional().describe("Additional context about the student's situation"),
});

const getLandlordInfoSchema = z.object({
  landlord_id: z.string().optional().describe('UUID of the landlord'),
  listing_id: z.string().optional().describe('UUID of a listing to find its landlord'),
  name: z.string().optional().describe('Name of the landlord or property management company'),
});

const getSavedListingsSchema = z.object({
  sort: z.enum(['saved_date', 'price_asc', 'price_desc', 'fairness']).optional().describe('Sort order'),
  limit: z.number().int().optional().describe('Maximum number of results (default 10, max 20)'),
});

const webSearchSchema = z.object({
  query: z.string().describe('Search query describing what the user is looking for'),
  location: z.string().optional().describe('City or area to focus the search on'),
});

const getReviewsSchema = z.object({
  listing_id: z.string().optional().describe('UUID of the listing to get reviews for'),
  address: z.string().optional().describe('Address of the property to search reviews for'),
});

const contactPmSchema = z.object({
  listing_id: z.string().describe('UUID of the listing whose property manager to contact'),
  message: z.string().optional().describe('Optional message to send (max 500 characters)'),
});

const getNeighborhoodInfoSchema = z.object({
  address: z.string().optional().describe('Address to get neighborhood info for'),
  listing_id: z.string().optional().describe('UUID of the listing to get neighborhood info for'),
  topics: z.array(z.string()).optional().describe('Specific topics (e.g., "walkability", "safety", "commute", "vibe")'),
});

const createSubleaseSchema = z.object({
  address: z.string().describe('Full address of the property'),
  bedrooms_total: z.number().int().describe('Total bedrooms in the unit (0 for studio)'),
  bedrooms_available: z.number().int().describe('Number of bedrooms being subleased'),
  contact_email: z.string().optional().describe('Contact email for inquiries'),
  rent_monthly: z.number().optional().describe('Monthly rent in dollars'),
  bathrooms: z.number().optional().describe('Number of bathrooms'),
  available_from: z.string().optional().describe('Sublease start date in YYYY-MM-DD format'),
  available_to: z.string().optional().describe('Lease end date in YYYY-MM-DD format'),
  description: z.string().optional().describe('Description of the sublease'),
  amenities: z.array(z.string()).optional().describe('List of amenities'),
  unit_number: z.string().optional().describe('Unit number'),
  furnished: z.boolean().optional().describe('Whether the unit is furnished'),
  parking: z.boolean().optional().describe('Whether parking is included'),
  property_type: z.string().optional().describe('Property type: "apartment", "house", or "room"'),
  gender_restriction: z.string().optional().describe('Gender restriction if any'),
  roommate_info: z.string().optional().describe('Info about current roommates'),
  confirmed: z.boolean().optional().describe('false = preview mode, true = publish. Include ALL fields when confirming.'),
});

const proposeMissionSchema = z.object({
  intent: z.enum(['housing_search', 'tour_outreach', 'listing_deep_dive', 'sublease_post']).describe(
    'The type of mission to propose',
  ),
  bedrooms: z.number().int().optional().describe('Extracted bedroom count from conversation'),
  max_rent: z.number().optional().describe('Budget ceiling in dollars per month'),
  location: z.string().optional().describe('Area or landmark preference'),
  move_in_date: z.string().optional().describe('Target move-in date in YYYY-MM-DD format'),
  notes: z.string().optional().describe('Additional context from conversation'),
});

/**
 * Builds AI SDK tool definitions that wrap existing CribAI handlers.
 * Only tools in `allowedTools` are included in the returned record.
 */
export function buildAiSdkTools(
  context: ToolContext,
  allowedTools: readonly ToolName[],
  onToolEvent: (event: ChatEvent) => void,
) {
  const allTools = {
    search_listings: tool({
      description:
        'Search for student housing listings AND subleases near campus. Use semantic_query for natural language searches. ALWAYS call immediately when the user asks about listings.',
      inputSchema: zodSchema(searchListingsSchema),
      execute: async (args) => runTool('search_listings', args as Record<string, unknown>, context, onToolEvent),
    }),

    get_listing_detail: tool({
      description: 'Get full details for a specific listing including true cost breakdown and fairness analysis.',
      inputSchema: zodSchema(getListingDetailSchema),
      execute: async (args) => runTool('get_listing_detail', args as Record<string, unknown>, context, onToolEvent),
    }),

    compare_listings: tool({
      description: 'Compare 2-4 listings side by side.',
      inputSchema: zodSchema(compareListingsSchema),
      execute: async (args) => runTool('compare_listings', args as Record<string, unknown>, context, onToolEvent),
    }),

    schedule_tour: tool({
      description: 'Schedule a tour for a specific listing. Collect student name, email, and preferred dates first.',
      inputSchema: zodSchema(scheduleTourSchema),
      execute: async (args) => runTool('schedule_tour', args as Record<string, unknown>, context, onToolEvent),
    }),

    explain_lease_term: tool({
      description: 'Explain a lease or rental term. Use when the user asks about lease clauses or tenant rights.',
      inputSchema: zodSchema(explainLeaseTermSchema),
      execute: async (args) => runTool('explain_lease_term', args as Record<string, unknown>, context, onToolEvent),
    }),

    get_landlord_info: tool({
      description: 'Get landlord information and review summary.',
      inputSchema: zodSchema(getLandlordInfoSchema),
      execute: async (args) => runTool('get_landlord_info', args as Record<string, unknown>, context, onToolEvent),
    }),

    get_saved_listings: tool({
      description: "Get the user's saved/favorited listings.",
      inputSchema: zodSchema(getSavedListingsSchema),
      execute: async (args) => runTool('get_saved_listings', args as Record<string, unknown>, context, onToolEvent),
    }),

    web_search: tool({
      description: 'Search the web for rental listings when local database has insufficient results.',
      inputSchema: zodSchema(webSearchSchema),
      execute: async (args) => runTool('web_search', args as Record<string, unknown>, context, onToolEvent),
    }),

    get_reviews: tool({
      description: 'Get reviews and community feedback for a property or landlord.',
      inputSchema: zodSchema(getReviewsSchema),
      execute: async (args) => runTool('get_reviews', args as Record<string, unknown>, context, onToolEvent),
    }),

    contact_pm: tool({
      description: 'Send a message or inquiry to a property manager about a listing.',
      inputSchema: zodSchema(contactPmSchema),
      execute: async (args) => runTool('contact_pm', args as Record<string, unknown>, context, onToolEvent),
    }),

    get_neighborhood_info: tool({
      description: 'Get neighborhood information including walkability, safety, commute times, and local vibe.',
      inputSchema: zodSchema(getNeighborhoodInfoSchema),
      execute: async (args) => runTool('get_neighborhood_info', args as Record<string, unknown>, context, onToolEvent),
    }),

    create_sublease: tool({
      description:
        'Create a sublease listing on CribAI. Two-phase: Phase 1 (confirmed=false) returns preview, Phase 2 (confirmed=true) publishes. Re-send ALL fields when confirming.',
      inputSchema: zodSchema(createSubleaseSchema),
      execute: async (args) => runTool('create_sublease', args as Record<string, unknown>, context, onToolEvent),
    }),

    propose_mission: tool({
      description:
        'Propose a background mission for complex, multi-step housing needs. Do NOT propose for simple single-tool questions.',
      inputSchema: zodSchema(proposeMissionSchema),
      execute: async (args) => runTool('propose_mission', args as Record<string, unknown>, context, onToolEvent),
    }),
  };

  // Filter to only allowed tools
  return Object.fromEntries(
    Object.entries(allTools).filter(([name]) =>
      (allowedTools as readonly string[]).includes(name),
    ),
  );
}
