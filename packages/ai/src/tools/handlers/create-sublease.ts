/**
 * create_sublease — Two-phase HITL tool for posting subleases via CribAI chat.
 *
 * Phase 1 (confirmed=false): Validates fields, geocodes address, returns preview.
 * Phase 2 (confirmed=true): Inserts listing via service-role client.
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ToolContext, ToolResult } from '../types';
import { geocodeAddress } from '../lib/geocode-address';

// --- Lazy singleton for service-role client ---

let _serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error('Server configuration error. Please try again later.');
  }

  _serviceClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _serviceClient;
}

// --- Input validation schema ---
const baseSchema = z.object({
  address: z.string().min(5).max(200),
  bedrooms_total: z.number().int().min(0).max(10),
  bedrooms_available: z.number().int().min(0).max(10),
  contact_email: z.string().email().optional(),
  rent_monthly: z.number().positive().max(10000).optional().nullable(),
  bathrooms: z.number().min(0).max(10).optional(),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  available_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).optional(),
  amenities: z.array(z.string()).default([]),
  unit_number: z.string().max(20).optional(),
  furnished: z.boolean().optional(),
  parking: z.boolean().optional(),
  property_type: z.enum(['apartment', 'house', 'room']).optional(),
  gender_restriction: z.string().max(50).optional(),
  roommate_info: z.string().max(200).optional(),
  confirmed: z.boolean().default(false),
}).refine(
  (data) => data.bedrooms_total === 0 || data.bedrooms_available <= data.bedrooms_total,
  { message: 'bedrooms_available cannot exceed bedrooms_total', path: ['bedrooms_available'] },
);

const inputSchema = baseSchema;

// --- Analytics helper (fire-and-forget) ---

function fireAnalyticsEvent(
  eventName: string,
  payload: Record<string, unknown>,
): void {
  try {
    const client = getServiceClient();
    void (async () => {
      try {
        const { error } = await client
          .from('analytics_events')
          .insert({ event: eventName, metadata: payload });
        if (error) {
          console.error('[create-sublease] analytics error:', error.message);
        }
      } catch {
        // Fire-and-forget: never block the tool response
      }
    })();
  } catch {
    // Service client not available — silently skip
  }
}

// --- Formatting helpers ---

function formatPreviewSummary(
  parsed: z.infer<typeof inputSchema>,
  geocodeSuccess: boolean,
): string {
  const lines = [
    '--- SUBLEASE LISTING PREVIEW ---',
    '',
    `Address: ${parsed.address}`,
    `Rent: ${parsed.rent_monthly ? `$${parsed.rent_monthly}/mo` : 'Negotiable'}`,
    `Bedrooms: ${parsed.bedrooms_total} bed (${parsed.bedrooms_available} available)`,
  ];

  if (parsed.bathrooms !== undefined) {
    lines.push(`Bathrooms: ${parsed.bathrooms}`);
  }
  if (parsed.available_from || parsed.available_to) {
    const from = parsed.available_from ?? 'TBD';
    const to = parsed.available_to ?? 'TBD';
    lines.push(`Dates: ${from} to ${to}`);
  }
  if (parsed.property_type) {
    lines.push(`Type: ${parsed.property_type}`);
  }
  if (parsed.furnished !== undefined) {
    lines.push(`Furnished: ${parsed.furnished ? 'Yes' : 'No'}`);
  }
  if (parsed.parking !== undefined) {
    lines.push(`Parking: ${parsed.parking ? 'Included' : 'Not included'}`);
  }
  if (parsed.amenities.length > 0) {
    lines.push(`Amenities: ${parsed.amenities.join(', ')}`);
  }
  if (parsed.gender_restriction) {
    lines.push(`Restriction: ${parsed.gender_restriction}`);
  }
  if (parsed.roommate_info) {
    lines.push(`Roommates: ${parsed.roommate_info}`);
  }
  if (parsed.unit_number) {
    lines.push(`Unit: ${parsed.unit_number}`);
  }
  if (parsed.description) {
    lines.push('', `Description: ${parsed.description}`);
  }
  if (parsed.contact_email) {
    lines.push(`Contact: ${parsed.contact_email}`);
  } else {
    lines.push('Contact: (your account email will be used)');
  }

  lines.push('');
  if (!geocodeSuccess) {
    lines.push('Note: I could not verify the exact location on the map. The listing will still be published but may not appear on map searches.');
  }

  return lines.join('\n');
}

// --- Phase 1: Preview ---

async function handlePreview(
  parsed: z.infer<typeof inputSchema>,
  context: ToolContext,
): Promise<ToolResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  let geocodeSuccess = false;

  if (apiKey) {
    const coords = await geocodeAddress(parsed.address, apiKey);
    geocodeSuccess = coords !== null;
  }

  const summary = formatPreviewSummary(parsed, geocodeSuccess);

  // Fire analytics: sublease draft created
  const fieldsPresent = Object.entries(parsed).filter(([, v]) => v !== undefined && v !== null);
  fireAnalyticsEvent('sublease_draft_created', {
    user_id: context.userId,
    fields_extracted_count: fieldsPresent.length,
    geocode_success: geocodeSuccess,
  });

  const modelContext = [
    summary,
    '',
    'INSTRUCTIONS: Present this preview to the user and ask "Does this look right? Any changes before I publish it?"',
    'If they confirm, call create_sublease again with ALL the same fields plus confirmed=true.',
    'If they want changes, update the fields and call create_sublease again with confirmed=false.',
  ].join('\n');

  return {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: summary,
    },
  };
}

// --- Phase 2: Publish ---

async function handlePublish(
  parsed: z.infer<typeof inputSchema>,
  context: ToolContext,
): Promise<ToolResult> {
  const serviceClient = getServiceClient();

  // Resolve contact email: provided > user's auth email > null
  let contactEmail = parsed.contact_email ?? null;
  if (!contactEmail && context.userId) {
    const { data: authData } = await serviceClient.auth.admin.getUserById(
      context.userId,
    );
    contactEmail = authData?.user?.email ?? null;
  }

  // Geocode the address
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  let locationSql: string | null = null;
  if (apiKey) {
    const coords = await geocodeAddress(parsed.address, apiKey);
    if (coords) {
      locationSql = `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`;
    }
  }

  // Deterministic idempotency key: prevents duplicate publishes if Gemini retries
  // Includes available_from date so the same user can post different term subleases at the same address
  const addressHash = createHash('sha256')
    .update(`${context.userId}-${parsed.address}-${parsed.available_from ?? 'open'}`)
    .digest('hex')
    .slice(0, 12);
  const externalId = `sublease-${context.userId}-${addressHash}`;

  const insertData: Record<string, unknown> = {
    campus_id: context.campusId,
    address: parsed.address,
    rent_monthly: parsed.rent_monthly ?? null,
    bedrooms: parsed.bedrooms_total,
    bathrooms: parsed.bathrooms ?? null,
    amenities: parsed.amenities,
    available_date: parsed.available_from ?? null,
    description: parsed.description ?? null,
    contact_email: contactEmail,
    source: 'sublease',
    external_id: externalId,
    creator_id: context.userId,
    is_active: true,
    last_embedded_at: null,
    photo_urls: [],
    raw_data: {
      submitted_by: context.userId,
      is_sublease: true,
      bedrooms_available: parsed.bedrooms_available,
      lease_end: parsed.available_to ?? null,
      furnished: parsed.furnished ?? null,
      parking: parsed.parking ?? null,
      property_type: parsed.property_type ?? null,
      unit_number: parsed.unit_number ?? null,
      gender_restriction: parsed.gender_restriction ?? null,
      roommate_info: parsed.roommate_info ?? null,
    },
  };

  if (locationSql) {
    insertData.location = locationSql;
  }

  const { data: listing, error: insertError } = await serviceClient
    .from('listings')
    .insert(insertData)
    .select('id, address')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      throw new Error(
        'A listing with this information already exists. Please wait a moment and try again.',
      );
    }
    console.error('[create-sublease] Insert error:', insertError);
    throw new Error('Failed to publish your sublease. Please try again.');
  }

  const listingId = listing.id as string;
  const listingAddress = listing.address as string;

  // Fire analytics: sublease published
  fireAnalyticsEvent('sublease_published', {
    user_id: context.userId,
    listing_id: listingId,
  });

  const modelContext = [
    'Sublease published successfully!',
    `Listing ID: ${listingId}`,
    `Address: ${listingAddress}`,
    `View it at: /listing/${listingId}`,
    '',
    'Tell the user their sublease is now live on CribAI and share the link.',
  ].join('\n');

  return {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: [
        '**Your sublease is live on CribAI!**',
        '',
        `**${listingAddress}**`,
        parsed.rent_monthly ? `$${parsed.rent_monthly}/mo` : 'Rent: Negotiable',
        `${parsed.bedrooms_total} bed (${parsed.bedrooms_available} available)`,
        '',
        `[View your listing](/listing/${listingId})`,
      ].join('\n'),
    },
  };
}

// --- Main handler ---

export async function createSublease(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.userId) {
    throw new Error('This action requires signing in.');
  }

  const parsed = inputSchema.parse(args);

  if (parsed.confirmed) {
    return handlePublish(parsed, context);
  }

  return handlePreview(parsed, context);
}
