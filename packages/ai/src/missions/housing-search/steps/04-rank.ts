import type { MissionStep, StepContext, StepResult } from '../../types';
import type { ResearchedListing } from '@campusnest/types';
import { createGeminiClient } from '../../../gemini-client';

export type ScoreDimension = 'fairness' | 'reviews' | 'walkability' | 'preference';

/**
 * Normalise a raw score to the 0-1 range for its dimension.
 * Returns 0.5 (neutral) when value is null — graceful degradation.
 * Exported for unit testing.
 */
export function normalizeScore(dim: ScoreDimension, value: number | null): number {
  if (value === null) return 0.5;
  switch (dim) {
    case 'fairness':    return Math.min(1, Math.max(0, (value - 1) / 9));   // 1-10 → 0-1
    case 'reviews':     return Math.min(1, Math.max(0, (value - 1) / 4));   // 1-5  → 0-1
    case 'walkability': return Math.min(1, Math.max(0, value / 100));        // 0-100 → 0-1
    case 'preference':  return Math.min(1, Math.max(0, value / 10));         // 0-10 → 0-1
    default: (dim satisfies never); return 0.5;
  }
}

/**
 * Compute the weighted composite score for a single listing.
 * Weights: fairness 30% · reviews 25% · walkability 20% · preference 25%.
 * Exported for unit testing.
 */
export function scoreComposite(scores: {
  readonly fairness: number | null;
  readonly reviews: number | null;
  readonly walkability: number | null;
  readonly preference: number | null;
}): number {
  return (
    0.30 * normalizeScore('fairness', scores.fairness) +
    0.25 * normalizeScore('reviews', scores.reviews) +
    0.20 * normalizeScore('walkability', scores.walkability) +
    0.25 * normalizeScore('preference', scores.preference)
  );
}

export type RankedListing = ResearchedListing & { readonly compositeScore: number };

/**
 * Apply preference scores and sort descending by composite score.
 * Pure function — exported for unit testing (bypasses Gemini call).
 */
export function rankAndScore(
  listings: ResearchedListing[],
  preferenceScores: ReadonlyArray<number | null>,
): RankedListing[] {
  return listings
    .map((listing, i) => ({
      ...listing,
      preferenceScore: preferenceScores[i] ?? null,
      compositeScore: scoreComposite({
        fairness: listing.fairnessScore,
        reviews: listing.reviewRating,
        walkability: listing.walkScore,
        preference: preferenceScores[i] ?? null,
      }),
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Ask Gemini to rate each listing's match to the preferences string (0-10).
 * Returns all-null on empty preferences or Gemini failure (graceful degradation).
 */
async function scorePreferenceMatch(
  listings: ResearchedListing[],
  preferences: string | undefined,
): Promise<Array<number | null>> {
  if (!preferences?.trim()) return listings.map(() => null);

  try {
    const ai = createGeminiClient();
    const descriptions = listings
      .map(
        (l, i) =>
          `${i + 1}. ${l.address} — $${l.rentMonthly}/mo, ` +
          `${l.bedrooms ?? '?'}BR, amenities: ${l.amenities.slice(0, 5).join(', ')}`,
      )
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        `Rate how well each listing matches these student preferences (0-10 each).\n` +
        `Preferences: "${preferences}"\n\n` +
        `Listings:\n${descriptions}\n\n` +
        `Return ONLY a JSON array of numbers in the same order, e.g. [7, 4, 9]. No explanation.`,
    });

    const text = (response.text ?? '[]').trim();
    const scores = JSON.parse(text) as number[];
    return listings.map((_, i) => scores[i] ?? null);
  } catch {
    return listings.map(() => null);
  }
}

export const rankAndScoreStep: MissionStep = {
  id: 'rank_and_score',
  label: 'Ranking listings',

  async run(ctx: StepContext): Promise<StepResult> {
    const researchedListings = (ctx.state.researchedListings ?? []) as ResearchedListing[];
    const preferences = (ctx.input as { preferences?: string }).preferences;

    const preferenceScores = await scorePreferenceMatch(researchedListings, preferences);
    const rankedListings = rankAndScore(researchedListings, preferenceScores);

    return { output: { rankedListings } };
  },
};
