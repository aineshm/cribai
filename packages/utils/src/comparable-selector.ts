export interface ComparableCandidate {
  readonly id: string;
  readonly rentMonthly: number;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface ComparableSelectionConfig {
  readonly maxDistanceKm: number;
  readonly maxResults: number;
  readonly bedroomMatch: boolean;
  readonly amenityWeight: number;
}

const DEFAULT_CONFIG: ComparableSelectionConfig = {
  maxDistanceKm: 3,
  maxResults: 20,
  bedroomMatch: true,
  amenityWeight: 0.3,
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jaccardIndex(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function selectComparables(
  target: ComparableCandidate,
  candidates: readonly ComparableCandidate[],
  config?: Partial<ComparableSelectionConfig>,
): readonly ComparableCandidate[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (candidates.length === 0) return [];

  // Filter by bedroom match
  let filtered = cfg.bedroomMatch && target.bedrooms !== null
    ? candidates.filter((c) => c.bedrooms === target.bedrooms)
    : [...candidates];

  // Filter by geo distance — exclude candidates without coordinates
  const targetHasGeo = target.latitude !== null && target.longitude !== null;

  const scored = filtered
    .filter((c) => {
      if (c.latitude === null || c.longitude === null) return false;
      if (!targetHasGeo) return true;
      const dist = haversineKm(target.latitude!, target.longitude!, c.latitude, c.longitude);
      return dist <= cfg.maxDistanceKm;
    })
    .map((c) => {
      let score = 0;

      // Distance score (closer = higher, linear decay)
      if (targetHasGeo && c.latitude !== null && c.longitude !== null) {
        const dist = haversineKm(target.latitude!, target.longitude!, c.latitude, c.longitude);
        score += 1 - dist / cfg.maxDistanceKm;
      }

      // Sqft similarity
      if (target.sqft !== null && c.sqft !== null && target.sqft > 0) {
        const pctDiff = Math.abs(target.sqft - c.sqft) / target.sqft;
        score += Math.max(0, 1 - pctDiff);
      }

      // Amenity overlap
      score += jaccardIndex(target.amenities, c.amenities) * cfg.amenityWeight;

      return { candidate: c, score };
    });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, cfg.maxResults).map((s) => s.candidate);
}
