import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  landlord_id: z.string().uuid().optional(),
  listing_id: z.string().uuid().optional(),
});

export async function getLandlordInfo(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  if (!parsed.landlord_id && !parsed.listing_id) {
    throw new Error('Provide either a landlord_id or listing_id.');
  }

  // For now, landlords are not linked to listings in the schema.
  // This handler returns what data is available from the landlords table.
  const landlordId = parsed.landlord_id;

  if (!landlordId && parsed.listing_id) {
    // Listings don't have landlord_id FK yet — return informative message
    return {
      modelContext:
        'Landlord information is not yet linked to individual listings. This feature is coming soon. The student can check the property management company from the listing details or contact the campus housing office.',
      clientBlock: {
        type: 'text',
        content:
          'Landlord information is not yet linked to individual listings. Check the listing details for property management contact info.',
      },
    };
  }

  const { data: landlord, error } = await context.supabase
    .from('landlords')
    .select('id, name, company, scorecard')
    .eq('id', landlordId!)
    .single();

  if (error || !landlord) {
    throw new Error('Landlord not found.');
  }

  // Fetch reviews summary
  const { data: reviews } = await context.supabase
    .from('landlord_reviews')
    .select('ratings, review_text')
    .eq('landlord_id', landlordId!);

  const reviewCount = reviews?.length ?? 0;
  const scorecard = landlord.scorecard as Record<string, number> | null;

  let modelContext = `Landlord: ${landlord.name}${landlord.company ? ` (${landlord.company})` : ''}\n`;

  if (scorecard && Object.keys(scorecard).length > 0) {
    modelContext += `Scorecard: ${Object.entries(scorecard)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}\n`;
  }

  modelContext += `Reviews: ${reviewCount} total`;

  if (reviews && reviews.length > 0) {
    const avgRatings: Record<string, number> = {};
    let count = 0;
    for (const review of reviews) {
      const ratings = review.ratings as Record<string, number>;
      for (const [key, val] of Object.entries(ratings)) {
        avgRatings[key] = (avgRatings[key] ?? 0) + val;
      }
      count++;
    }
    if (count > 0) {
      for (const key of Object.keys(avgRatings)) {
        avgRatings[key] = Math.round((avgRatings[key]! / count) * 10) / 10;
      }
      modelContext += `\nAverage ratings: ${Object.entries(avgRatings)
        .map(([k, v]) => `${k}=${v}/5`)
        .join(', ')}`;
    }
  }

  return {
    modelContext,
    clientBlock: {
      type: 'text',
      content: modelContext,
    },
  };
}
