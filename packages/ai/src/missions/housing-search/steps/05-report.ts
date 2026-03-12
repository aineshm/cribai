import type { MissionStep, StepContext, StepResult } from '../../types';
import type { ShortlistItem, ShortlistReport } from '@campusnest/types';
import type { RankedListing } from './04-rank';
import { createGeminiClient } from '../../../gemini-client';

function buildFallbackReasoning(l: RankedListing): string {
  const strengths: string[] = [];
  if (l.fairnessScore != null && l.fairnessScore >= 7) strengths.push('fairly priced');
  if (l.reviewRating != null && l.reviewRating >= 4) strengths.push('highly rated');
  if (l.walkScore != null && l.walkScore >= 70) strengths.push('walkable location');
  if (strengths.length > 0) return `Strong choice: ${strengths.join(', ')}.`;
  return 'Matches your search criteria.';
}

/**
 * Ask Gemini to write a one-sentence reason per listing.
 * Falls back to template strings on failure.
 */
async function generateReasonings(
  listings: RankedListing[],
  preferences: string | undefined,
): Promise<string[]> {
  try {
    const ai = createGeminiClient();
    const prefLine = preferences ? `Student preferences: "${preferences}"\n` : '';
    const descriptions = listings
      .map(
        (l, i) =>
          `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ` +
          `fairness ${l.fairnessScore ?? 'n/a'}/10, ` +
          `reviews ${l.reviewRating ?? 'n/a'}/5, ` +
          `walk score ${l.walkScore ?? 'n/a'}`,
      )
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        `${prefLine}For each listing (ranked #1 = best), write ONE sentence explaining ` +
        `why it ranked where it did. Be specific about price, walkability, or reviews. ` +
        `Under 20 words each.\n\nListings:\n${descriptions}\n\n` +
        `Return ONLY a JSON array of strings, e.g. ["Great value with excellent walkability.", "Good reviews but over budget."]`,
    });

    const text = (response.text ?? '[]').trim();
    const reasonings = JSON.parse(text) as string[];
    return listings.map((l, i) => reasonings[i] ?? buildFallbackReasoning(l));
  } catch {
    return listings.map(buildFallbackReasoning);
  }
}

export const generateReportStep: MissionStep = {
  id: 'generate_report',
  label: 'Generating shortlist',

  async run(ctx: StepContext): Promise<StepResult> {
    const rankedListings = (ctx.state.rankedListings ?? []) as RankedListing[];
    const totalSearched = (ctx.state.totalSearched ?? 0) as number;
    const preferences = (ctx.input as { preferences?: string }).preferences;

    const topListings = rankedListings.slice(0, 5);
    const reasonings = await generateReasonings(topListings, preferences);

    const items: ShortlistItem[] = topListings.map((listing, i) => ({
      rank: i + 1,
      listingId: listing.id,
      address: listing.address,
      rentMonthly: listing.rentMonthly,
      compositeScore: listing.compositeScore,
      fairnessScore: listing.fairnessScore,
      reviewRating: listing.reviewRating,
      walkScore: listing.walkScore,
      preferenceScore: listing.preferenceScore,
      reasoning: reasonings[i] ?? buildFallbackReasoning(listing),
    }));

    const report: ShortlistReport = {
      missionId: ctx.missionId,
      generatedAt: new Date().toISOString(),
      totalSearched,
      items,
    };

    return {
      output: { report },
      done: true,
    };
  },
};
