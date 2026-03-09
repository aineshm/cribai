import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  listing_id: z.string().uuid(),
  student_name: z.string().trim().min(1).max(200),
  student_email: z.string().email(),
  preferred_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')).min(1).max(10),
  notes: z.string().max(500).optional(),
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

function findDateConflicts(
  requestedDates: readonly string[],
  existingTours: readonly ExistingTour[],
): { readonly overlappingDates: readonly string[]; readonly conflictingTours: readonly ExistingTour[] } {
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

export async function scheduleTour(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  if (!context.userId) {
    throw new Error('You must be signed in to schedule a tour.');
  }

  // Verify the listing exists and belongs to this campus
  const { data: listing, error: listingError } = await context.supabase
    .from('listings')
    .select('id, address')
    .eq('id', parsed.listing_id)
    .eq('campus_id', context.campusId)
    .eq('is_active', true)
    .single();

  if (listingError || !listing) {
    throw new Error('Listing not found or no longer available.');
  }

  // Check for date conflicts with existing pending tours
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

  // Insert the tour request (conflicts are warnings only, not blocking)
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

  let modelContext = `Tour request submitted successfully for ${listing.address}. Request ID: ${tour.id}. The student will receive confirmation at ${parsed.student_email}.`;

  // Append conflict warning if any
  if (conflicts.conflictingTours.length > 0) {
    const conflictListingIds = conflicts.conflictingTours.map((c) => c.listing_id);
    const { data: conflictListings } = await context.supabase
      .from('listings')
      .select('id, address')
      .in('id', conflictListingIds)
      .limit(100);

    const addressMap = new Map(
      ((conflictListings as ConflictListing[] | null) ?? []).map((l) => [l.id, l.address]),
    );

    const conflictDetails = conflicts.conflictingTours
      .map((t) => addressMap.get(t.listing_id) ?? 'unknown address')
      .join(', ');

    modelContext += ` Note: The student has existing pending tours on ${conflicts.overlappingDates.join(', ')} at ${conflictDetails}. You may want to mention this scheduling overlap.`;
  }

  return {
    modelContext,
    clientBlock: {
      type: 'tour_confirmation',
      tourRequestId: tour.id as string,
      listingAddress: listing.address as string,
      status: 'pending',
    },
  };
}
