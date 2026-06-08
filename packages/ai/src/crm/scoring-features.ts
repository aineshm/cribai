/**
 * Single source of truth for CRM scoring feature vocabulary (AIN-15).
 *
 * Both rank-compare.ts (weight resolution + scoring) and infer-profile.ts
 * (Gemini prompt construction) import from here so the two modules cannot
 * drift out of sync.
 *
 * To add a new scoring dimension in v2: extend SCORING_FEATURES and update
 * both modules' logic (scoreRow, resolveNumericField, computeMinMax, etc.).
 */

export const SCORING_FEATURES = ['rent', 'bedrooms', 'sqft', 'commute'] as const;
export type ScoringFeature = (typeof SCORING_FEATURES)[number];
