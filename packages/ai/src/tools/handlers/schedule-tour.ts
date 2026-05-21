/**
 * schedule_tour — Two-phase HITL tool for booking a property tour via CribAI chat.
 *
 * Phase 1 (confirmed=false or omitted): Verifies the listing exists, looks up
 *   date conflicts with the user's existing pending tours, and returns a
 *   formatted preview. NO row is written to `tour_requests`.
 * Phase 2 (confirmed=true): Inserts the tour request and returns the
 *   `tour_confirmation` block. The LLM must re-send ALL fields (not just
 *   `confirmed=true`) — this mirrors `create_sublease`'s pattern.
 *
 * The handler-level gate is the safety boundary that matches the
 * `scheduleTourInput.confirmed` field declared in
 * `packages/ai/src/runtime/tool-registry.ts` (codex amendment A1 follow-up).
 */
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  listing_id: z.string().uuid(),
  student_name: z.string().trim().min(1).max(200),
  student_email: z.string().email(),
  preferred_dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'))
    .min(1)
    .max(10),
  notes: z.string().max(500).optional(),
  confirmed: z.boolean().default(false),
});

interface ExistingTour {
  readonly preferred_dates: readonly string[];
  readonly listing_id: string;
  readonly id: string;
}

interface ConflictListing {
  readonly id: string;
  readonly address: string;
}

interface DateConflictResult {
  readonly overlappingDates: readonly string[];
  readonly conflictingTours: readonly ExistingTour[];
}

function findDateConflicts(
  requestedDates: readonly string[],
  existingTours: readonly ExistingTour[],
): DateConflictResult {
  const requestedSet = new Set(requestedDates);
  const conflictingTours: ExistingTour[] = [];
  const overlappingDates = new Set<string>();

  for (const tour of existingTours) {
    const tourDates = tour.preferred_dates ?? [];
    const overlap = tourDates.filter((d) => requestedSet.has(d));
    if (overlap.length > 0) {
      conflictingTours.push(tour);
      for (const d of overlap) {
        overlappingDates.add(d);
      }
    }
  }

  return {
    overlappingDates: [...overlappingDates].sort(),
    conflictingTours,
  };
}

async function resolveConflictAddresses(
  context: ToolContext,
  conflictingTours: readonly ExistingTour[],
): Promise<string> {
  const conflictListingIds = conflictingTours.map((c) => c.listing_id);
  const { data: conflictListings } = await context.supabase
    .from('listings')
    .select('id, address')
    .in('id', conflictListingIds)
    .limit(100);

  const addressMap = new Map(
    ((conflictListings as ConflictListing[] | null) ?? []).map((l) => [l.id, l.address]),
  );

  return conflictingTours
    .map((t) => addressMap.get(t.listing_id) ?? 'unknown address')
    .join(', ');
}

// --- Formatting helper ---

function formatPreviewSummary(
  parsed: z.infer<typeof inputSchema>,
  listingAddress: string,
): string {
  const lines = [
    '--- TOUR REQUEST PREVIEW ---',
    '',
    `Listing: ${listingAddress}`,
    `Student: ${parsed.student_name}`,
    `Contact: ${parsed.student_email}`,
    `Preferred dates: ${parsed.preferred_dates.join(', ')}`,
  ];

  if (parsed.notes) {
    lines.push(`Notes: ${parsed.notes}`);
  }

  return lines.join('\n');
}

// --- Phase 1: Preview ---

async function handlePreview(
  parsed: z.infer<typeof inputSchema>,
  context: ToolContext,
  listingAddress: string,
  conflicts: DateConflictResult,
): Promise<ToolResult> {
  let summary = formatPreviewSummary(parsed, listingAddress);

  if (conflicts.conflictingTours.length > 0) {
    const conflictDetails = await resolveConflictAddresses(
      context,
      conflicts.conflictingTours,
    );
    summary += `\n\nHeads up: you already have pending tour requests on ${conflicts.overlappingDates.join(', ')} at ${conflictDetails}.`;
  }

  const modelContext = [
    summary,
    '',
    'INSTRUCTIONS: Show this preview to the student and ask "Does this look right? Should I submit the tour request?"',
    'If they confirm, call schedule_tour again with ALL the same fields plus confirmed=true.',
    'If they want changes (different dates, different name/email), update the fields and call schedule_tour again with confirmed=false.',
    'Do NOT claim the tour is booked yet — the handler has not submitted anything to the landlord.',
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
  listingAddress: string,
  conflicts: DateConflictResult,
): Promise<ToolResult> {
  const { data: tour, error } = await context.supabase
    .from('tour_requests')
    .insert({
      listing_id: parsed.listing_id,
      campus_id: context.campusId,
      user_id: context.userId,
      student_name: parsed.student_name,
      student_email: parsed.student_email,
      preferred_dates: parsed.preferred_dates,
      notes: parsed.notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(
        'You already have a pending tour request for this listing. Please wait for a response or cancel it first.',
      );
    }
    console.error('[schedule-tour] DB error:', error);
    throw new Error('Failed to schedule tour. Please try again later.');
  }

  let modelContext = `Tour request submitted successfully for ${listingAddress}. Request ID: ${tour.id}. The student will receive confirmation at ${parsed.student_email}.`;

  if (conflicts.conflictingTours.length > 0) {
    const conflictDetails = await resolveConflictAddresses(
      context,
      conflicts.conflictingTours,
    );
    modelContext += ` Note: The student has existing pending tours on ${conflicts.overlappingDates.join(', ')} at ${conflictDetails}. You may want to mention this scheduling overlap.`;
  }

  return {
    modelContext,
    clientBlock: {
      type: 'tour_confirmation',
      tourRequestId: tour.id as string,
      listingAddress,
      status: 'pending',
    },
  };
}

// --- Main handler ---

export async function scheduleTour(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  if (!context.userId) {
    throw new Error('You must be signed in to schedule a tour.');
  }

  // Verify the listing exists and belongs to this campus (both phases — a
  // hallucinated listing ID should fail fast before we render a preview)
  const { data: listing, error: listingError } = await context.supabase
    .from('listings')
    .select('id, address')
    .eq('id', parsed.listing_id)
    .eq('campus_id', context.campusId)
    .single();

  if (listingError || !listing) {
    throw new Error('Listing not found or no longer available.');
  }

  const listingAddress = listing.address as string;

  // Check for date conflicts with existing pending tours (both phases use this)
  const { data: existingTours } = await context.supabase
    .from('tour_requests')
    .select('preferred_dates, listing_id, id')
    .eq('user_id', context.userId)
    .eq('status', 'pending')
    .limit(100);

  const conflicts = findDateConflicts(
    parsed.preferred_dates,
    (existingTours as ExistingTour[] | null) ?? [],
  );

  if (parsed.confirmed) {
    return handlePublish(parsed, context, listingAddress, conflicts);
  }

  return handlePreview(parsed, context, listingAddress, conflicts);
}
