/**
 * propose_mission — Pass-through tool that structures a mission proposal
 * for the SSE layer to re-emit as a top-level mission_proposal event.
 *
 * This handler does NOT create a mission. It returns structured data
 * so the frontend can render a MissionProposalCard for user approval.
 */
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  intent: z.enum(['housing_search', 'tour_outreach', 'listing_deep_dive', 'sublease_post']),
  bedrooms: z.number().int().min(0).max(10).optional(),
  max_rent: z.number().positive().max(20000).optional(),
  location: z.string().max(200).optional(),
  move_in_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().max(500).optional(),
});

export async function proposeMission(
  args: Record<string, unknown>,
  _context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  const extractedFields: Record<string, unknown> = {};
  if (parsed.bedrooms !== undefined) extractedFields.bedrooms = parsed.bedrooms;
  if (parsed.max_rent !== undefined) extractedFields.max_rent = parsed.max_rent;
  if (parsed.location !== undefined) extractedFields.location = parsed.location;
  if (parsed.move_in_date !== undefined) extractedFields.move_in_date = parsed.move_in_date;
  if (parsed.notes !== undefined) extractedFields.notes = parsed.notes;

  return {
    modelContext:
      'Mission proposal sent to the user for review. Wait for them to accept or dismiss it before taking further action on this topic.',
    clientBlock: {
      type: 'text' as const,
      content: JSON.stringify({
        _missionProposal: true,
        intent: parsed.intent,
        extractedFields,
      }),
    },
  };
}
