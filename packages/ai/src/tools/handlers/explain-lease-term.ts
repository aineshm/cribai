import { z } from 'zod';
import type { ToolResult } from '../types';
import { findLeaseTerm, LEGAL_DISCLAIMER } from '../../knowledge/lease-terms';

const inputSchema = z.object({
  term: z.string().trim().min(1),
  context: z.string().optional(),
});

export async function explainLeaseTerm(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);
  const match = findLeaseTerm(parsed.term);

  if (!match) {
    return {
      modelContext: `No specific knowledge base entry found for "${parsed.term}". Provide a general explanation and always include the legal disclaimer: ${LEGAL_DISCLAIMER}`,
      clientBlock: {
        type: 'legal_disclaimer',
        term: parsed.term,
        explanation: `I don't have a specific entry for "${parsed.term}" in my knowledge base, but I can share some general information.`,
        disclaimer: LEGAL_DISCLAIMER,
      },
    };
  }

  const modelContext = `Term: ${match.term} (${match.category})\nExplanation: ${match.explanation}\n\nIMPORTANT: Always include the legal disclaimer in your response: ${LEGAL_DISCLAIMER}`;

  return {
    modelContext,
    clientBlock: {
      type: 'legal_disclaimer',
      term: match.term,
      explanation: match.explanation,
      disclaimer: LEGAL_DISCLAIMER,
    },
  };
}
