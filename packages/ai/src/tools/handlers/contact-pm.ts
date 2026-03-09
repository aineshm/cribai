import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  listing_id: z.string().uuid(),
  message: z.string().max(500).optional(),
});

export async function contactPm(
  args: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  const modelContext = [
    `Direct PM messaging is coming soon for listing ${parsed.listing_id}!`,
    'For now, suggest the student check the listing detail page for contact information.',
    'The listing source URL typically has the property manager\'s phone number or email.',
    'The student can also try searching for the property management company online.',
  ].join('\n');

  const clientContent = [
    'Direct property manager messaging is coming soon!',
    '',
    'In the meantime, you can:',
    '- Check the **listing detail page** for contact info',
    '- Visit the **original listing source** for the PM\'s phone/email',
    '- Search online for the property management company',
  ].join('\n');

  return {
    modelContext,
    clientBlock: {
      type: 'text' as const,
      content: clientContent,
    },
  };
}
