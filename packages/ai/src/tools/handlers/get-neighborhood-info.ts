import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  address: z.string().optional(),
  listing_id: z.string().uuid().optional(),
  topics: z.array(z.string()).optional(),
});

const NEIGHBORHOOD_SECTIONS: Record<string, string> = {
  walkability: 'Walkability: Check Walk Score at walkscore.com for a detailed walkability rating of the area.',
  commute: 'Commute: Use Google Maps transit directions to campus for accurate commute time estimates.',
  safety: 'Safety: Check the city crime maps and the UW-Madison police department reports for neighborhood safety data.',
  vibe: 'Local vibe: Explore the area on Google Street View to get a feel for the neighborhood character.',
};

export async function getNeighborhoodInfo(
  args: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  const identifierNote = parsed.address
    ? ` for ${parsed.address}`
    : parsed.listing_id
      ? ` for listing ${parsed.listing_id}`
      : '';

  const requestedTopics = parsed.topics?.length
    ? parsed.topics
    : Object.keys(NEIGHBORHOOD_SECTIONS);

  const sections = requestedTopics.map(
    (topic) => NEIGHBORHOOD_SECTIONS[topic] ?? `${topic}: Information coming soon.`,
  );

  const modelContext = [
    `Neighborhood information${identifierNote} is still being built out. Here are resources the student can use:`,
    '',
    ...sections.map((s) => `- ${s}`),
    '',
    'Suggest these resources so the student can research the neighborhood themselves. Mention walkability, safety, commute, and vibe as key factors to consider.',
  ].join('\n');

  const clientContent = [
    'Detailed neighborhood info is coming soon!',
    '',
    'In the meantime, check these resources:',
    '- **Walk Score** (walkscore.com) for walkability ratings',
    '- **Google Maps** for transit/commute times to campus',
    '- **City crime maps** for safety information',
    '- **Google Street View** to explore the neighborhood vibe',
  ].join('\n');

  return {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: clientContent,
    },
  };
}
