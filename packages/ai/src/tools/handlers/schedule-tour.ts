import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  listing_id: z.string().uuid(),
  student_name: z.string().min(1).max(200),
  student_email: z.string().email(),
  preferred_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')).min(1),
  notes: z.string().max(500).optional(),
});

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
    throw new Error(`Failed to schedule tour: ${error.message}`);
  }

  const modelContext = `Tour request submitted successfully for ${listing.address}. Request ID: ${tour.id}. The student will receive confirmation at ${parsed.student_email}.`;

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
