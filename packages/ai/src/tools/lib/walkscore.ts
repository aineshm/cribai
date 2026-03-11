/**
 * Walk Score API client.
 * Returns walkability, transit, and bike scores for a given address.
 * Gracefully degrades on errors (returns null scores, never throws).
 */

export interface TransitBikeScore {
  readonly score: number;
  readonly description: string;
}

export interface WalkScoreResult {
  readonly walkscore: number | null;
  readonly description: string;
  readonly transit: TransitBikeScore | null;
  readonly bike: TransitBikeScore | null;
}

const NULL_RESULT: WalkScoreResult = {
  walkscore: null,
  description: 'Score unavailable',
  transit: null,
  bike: null,
};

/**
 * Fetch walk, transit, and bike scores for an address.
 * Returns null scores if the API reports status != 1 or on network failure.
 */
export async function getWalkScore(
  address: string,
  lat: number,
  lon: number,
  apiKey: string,
): Promise<WalkScoreResult> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      address,
      lat: String(lat),
      lon: String(lon),
      transit: '1',
      bike: '1',
      wsapikey: apiKey,
    });

    const response = await fetch(
      `https://api.walkscore.com/score?${params.toString()}`,
    );

    if (!response.ok) {
      return NULL_RESULT;
    }

    const data = await response.json();

    if (data.status !== 1) {
      return {
        walkscore: null,
        description: data.description ?? 'Score not available',
        transit: null,
        bike: null,
      };
    }

    return {
      walkscore: data.walkscore,
      description: data.description,
      transit: data.transit
        ? { score: data.transit.score, description: data.transit.description }
        : null,
      bike: data.bike
        ? { score: data.bike.score, description: data.bike.description }
        : null,
    };
  } catch {
    return NULL_RESULT;
  }
}
