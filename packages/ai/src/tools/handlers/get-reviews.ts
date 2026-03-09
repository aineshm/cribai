import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  listing_id: z.string().uuid().optional(),
  address: z.string().optional(),
});

export async function getReviews(
  args: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  const identifierNote = parsed.listing_id
    ? ` for listing ${parsed.listing_id}`
    : parsed.address
      ? ` for ${parsed.address}`
      : '';

  const modelContext = [
    `Review aggregation is coming soon${identifierNote}!`,
    'In the meantime, suggest these alternative sources for reviews and community feedback:',
    '- Reddit r/UWMadison — search for the property address or landlord name',
    '- Google Maps reviews — search the property address for nearby reviews',
    '- Yelp — search for the property management company',
    'Present these as helpful alternatives the student can check right now.',
  ].join('\n');

  const clientContent = [
    `Review aggregation is coming soon!`,
    '',
    'While we build this feature, you can check:',
    '- **Reddit r/UWMadison** for student experiences',
    '- **Google Maps** for property reviews',
    '- **Yelp** for property management company reviews',
  ].join('\n');

  return {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: clientContent,
    },
  };
}
