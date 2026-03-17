/**
 * Landmark detection and coordinate resolution for geographic proximity search.
 * Matches landmark names/aliases in user queries and resolves to lat/lng coordinates
 * for PostGIS ST_DWithin filtering.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface LandmarkMatch {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly category: string;
}

interface LandmarkRow {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly latitude: number;
  readonly longitude: number;
  readonly category: string;
}

// Proximity phrases that indicate the user wants location-based search
const PROXIMITY_PATTERNS = [
  /\bnear\s+(?:the\s+)?(.+)/i,
  /\bclose\s+to\s+(?:the\s+)?(.+)/i,
  /\bnext\s+to\s+(?:the\s+)?(.+)/i,
  /\bby\s+(?:the\s+)?(.+)/i,
  /\baround\s+(?:the\s+)?(.+)/i,
  /\bwalking\s+(?:distance\s+(?:to|from)\s+)?(?:the\s+)?(.+)/i,
] as const;

/**
 * Extract the location portion from a proximity query.
 * e.g. "apartments near Engineering Hall" -> "Engineering Hall"
 *      "find me a place close to the Union" -> "Union"
 */
export function extractLocationPhrase(query: string): string | null {
  for (const pattern of PROXIMITY_PATTERNS) {
    const match = query.match(pattern);
    if (match?.[1]) {
      // Clean trailing filter words that aren't part of the landmark name
      const cleaned = match[1]
        .replace(/\s+(?:with|under|below|above|for|that|which|and)\s+.*$/i, '')
        .replace(/\s+\d+\s*(?:bed|br|bath|sqft).*$/i, '')
        .trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
  }
  return null;
}

/**
 * Find the best matching landmark for a location phrase.
 * Uses case-insensitive substring matching against name and aliases.
 * Returns the single best match (longest alias match wins for disambiguation).
 */
export function findBestLandmarkMatch(
  phrase: string,
  landmarks: readonly LandmarkRow[],
): LandmarkMatch | null {
  const lowerPhrase = phrase.toLowerCase();
  let bestMatch: LandmarkMatch | null = null;
  let bestScore = 0;

  for (const landmark of landmarks) {
    // Check exact name match first (highest priority)
    const lowerName = landmark.name.toLowerCase();
    if (lowerPhrase === lowerName || lowerPhrase.includes(lowerName) || lowerName.includes(lowerPhrase)) {
      const score = lowerName.length + (lowerPhrase === lowerName ? 1000 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          name: landmark.name,
          latitude: landmark.latitude,
          longitude: landmark.longitude,
          category: landmark.category,
        };
      }
    }

    // Check aliases
    for (const alias of landmark.aliases) {
      const lowerAlias = alias.toLowerCase();
      if (lowerPhrase === lowerAlias || lowerPhrase.includes(lowerAlias) || lowerAlias.includes(lowerPhrase)) {
        const score = lowerAlias.length + (lowerPhrase === lowerAlias ? 1000 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            name: landmark.name,
            latitude: landmark.latitude,
            longitude: landmark.longitude,
            category: landmark.category,
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Detect a landmark reference in a search query and resolve to coordinates.
 * Fetches landmarks for the given campus from Supabase, then matches against the query.
 */
export async function resolveLandmarkFromQuery(
  query: string,
  campusId: string,
  supabase: SupabaseClient,
): Promise<LandmarkMatch | null> {
  const locationPhrase = extractLocationPhrase(query);
  if (!locationPhrase) {
    return null;
  }

  const { data, error } = await supabase
    .from('campus_landmarks')
    .select('name, aliases, latitude, longitude, category')
    .eq('campus_id', campusId);

  if (error || !data || data.length === 0) {
    return null;
  }

  return findBestLandmarkMatch(locationPhrase, data as readonly LandmarkRow[]);
}
