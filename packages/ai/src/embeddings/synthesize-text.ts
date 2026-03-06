/**
 * Synthesize rich natural-language text from listing fields for embedding.
 * Produces a descriptive paragraph that captures the "vibe" and key attributes
 * so vector similarity search can match qualitative queries.
 */

export interface SynthesizeInput {
  readonly address: string;
  readonly rentMonthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[];
  readonly photoCount: number;
}

/** Known Madison neighborhood keywords and their descriptors */
const NEIGHBORHOOD_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/langdon/i, 'near campus on historic Langdon Street'],
  [/state\s*st/i, 'in the vibrant downtown State Street area'],
  [/university\s*ave/i, 'along University Avenue near campus'],
  [/campus/i, 'near campus in the university district'],
  [/regent/i, 'in the Regent neighborhood near Camp Randall'],
  [/gorham/i, 'on Gorham Street near the Capitol Square area'],
  [/johnson/i, 'on Johnson Street in the near east side'],
  [/mifflin/i, 'on Mifflin Street near downtown Madison'],
];

/** Amenity categories mapped to vibe descriptors */
const VIBE_RULES: ReadonlyArray<readonly [ReadonlyArray<string>, string]> = [
  [['in-unit laundry', 'washer', 'dryer'], 'convenient in-unit laundry amenities'],
  [['parking', 'garage'], 'convenient for drivers with dedicated parking'],
  [['pool', 'gym', 'fitness'], 'active lifestyle amenities including fitness facilities'],
  [['pet-friendly', 'pet', 'cats', 'dogs'], 'pet-welcoming community'],
  [['balcony', 'patio', 'deck'], 'private outdoor living space'],
  [['dishwasher', 'air conditioning', 'ac', 'central air'], 'modern conveniences'],
  [['furnished'], 'move-in ready with furnished rooms'],
];

function deriveNeighborhoodContext(address: string): string | null {
  for (const [pattern, description] of NEIGHBORHOOD_MAP) {
    if (pattern.test(address)) {
      return description;
    }
  }
  return null;
}

function deriveVibes(amenities: readonly string[]): readonly string[] {
  const lowerAmenities = amenities.map((a) => a.toLowerCase());
  const vibes: string[] = [];

  for (const [keywords, vibe] of VIBE_RULES) {
    const hasMatch = keywords.some((kw) =>
      lowerAmenities.some((a) => a.includes(kw)),
    );
    if (hasMatch) {
      vibes.push(vibe);
    }
  }

  return vibes;
}

export function synthesizeListingText(input: SynthesizeInput): string {
  const parts: string[] = [];

  // Address and location
  const neighborhood = deriveNeighborhoodContext(input.address);
  if (neighborhood) {
    parts.push(`Apartment at ${input.address}, ${neighborhood}.`);
  } else {
    parts.push(`Apartment at ${input.address}.`);
  }

  // Core attributes
  const attrs: string[] = [];
  if (input.bedrooms !== null) {
    attrs.push(`${input.bedrooms} bedroom`);
  }
  if (input.bathrooms !== null) {
    attrs.push(`${input.bathrooms} bathroom`);
  }
  if (input.sqft !== null) {
    attrs.push(`${input.sqft} square feet`);
  }
  if (attrs.length > 0) {
    parts.push(`This is a ${attrs.join(', ')} unit.`);
  }

  // Rent
  if (input.rentMonthly !== null) {
    parts.push(`Monthly rent is $${input.rentMonthly}.`);
  }

  // Amenities
  if (input.amenities.length > 0) {
    parts.push(`Amenities include: ${input.amenities.join(', ')}.`);
  }

  // Vibe descriptors
  const vibes = deriveVibes(input.amenities);
  if (vibes.length > 0) {
    parts.push(`Features: ${vibes.join('; ')}.`);
  }

  // Photo indicator
  if (input.photoCount > 0) {
    parts.push(`${input.photoCount} photos available.`);
  }

  return parts.join(' ');
}
