/**
 * Hardcoded UW-Madison campus landmarks for client-side nearest-landmark computation.
 * Data sourced from supabase/migrations/022_campus_landmarks.sql.
 * No DB query needed — this is static reference data.
 */

export interface CampusLandmark {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly category: string;
}

export interface NearestLandmark {
  readonly name: string;
  readonly category: string;
  /** Distance in kilometers */
  readonly distanceKm: number;
  /** Human-readable walk time estimate (assumes 5 km/h) */
  readonly walkMinutes: number;
}

/**
 * UW-Madison campus landmarks (~30 key buildings).
 * Keep in sync with 022_campus_landmarks.sql if new landmarks are added.
 */
const UW_MADISON_LANDMARKS: readonly CampusLandmark[] = [
  // Academic
  { name: 'Engineering Hall', latitude: 43.0715, longitude: -89.4115, category: 'academic' },
  { name: 'Bascom Hall', latitude: 43.0753, longitude: -89.4050, category: 'academic' },
  { name: 'Van Vleck Hall', latitude: 43.0743, longitude: -89.4060, category: 'academic' },
  { name: 'Science Hall', latitude: 43.0764, longitude: -89.4035, category: 'academic' },
  { name: 'Humanities Building', latitude: 43.0746, longitude: -89.4030, category: 'academic' },
  { name: 'Computer Sciences', latitude: 43.0716, longitude: -89.4089, category: 'academic' },
  { name: 'Grainger Hall', latitude: 43.0729, longitude: -89.3986, category: 'academic' },
  { name: 'Educational Sciences', latitude: 43.0751, longitude: -89.4078, category: 'academic' },
  { name: 'Chemistry Building', latitude: 43.0723, longitude: -89.4102, category: 'academic' },
  { name: 'Biochemistry Building', latitude: 43.0739, longitude: -89.4128, category: 'academic' },
  { name: 'Law School', latitude: 43.0757, longitude: -89.3989, category: 'academic' },
  { name: 'Mechanical Engineering', latitude: 43.0710, longitude: -89.4105, category: 'academic' },
  { name: 'Wendt Commons', latitude: 43.0712, longitude: -89.4098, category: 'academic' },
  // Libraries
  { name: 'Memorial Library', latitude: 43.0748, longitude: -89.3983, category: 'library' },
  { name: 'College Library', latitude: 43.0770, longitude: -89.3993, category: 'library' },
  { name: 'Steenbock Library', latitude: 43.0734, longitude: -89.4130, category: 'library' },
  // Recreation
  { name: 'Memorial Union', latitude: 43.0766, longitude: -89.3999, category: 'recreation' },
  { name: 'Union South', latitude: 43.0714, longitude: -89.4079, category: 'recreation' },
  { name: 'Nicholas Recreation Center', latitude: 43.0697, longitude: -89.4080, category: 'recreation' },
  { name: 'Bakke Recreation Center', latitude: 43.0780, longitude: -89.4225, category: 'recreation' },
  // Landmarks
  { name: 'State Street', latitude: 43.0745, longitude: -89.3965, category: 'landmark' },
  { name: 'Capitol Square', latitude: 43.0747, longitude: -89.3844, category: 'landmark' },
  { name: 'Library Mall', latitude: 43.0758, longitude: -89.3998, category: 'landmark' },
  // Sports
  { name: 'Camp Randall Stadium', latitude: 43.0700, longitude: -89.4128, category: 'sports' },
  { name: 'Kohl Center', latitude: 43.0698, longitude: -89.4095, category: 'sports' },
  { name: 'Field House', latitude: 43.0697, longitude: -89.4116, category: 'sports' },
  // Residence Halls
  { name: 'Sellery Hall', latitude: 43.0713, longitude: -89.3981, category: 'residence_hall' },
  { name: 'Witte Hall', latitude: 43.0709, longitude: -89.3989, category: 'residence_hall' },
  { name: 'Chadbourne Hall', latitude: 43.0761, longitude: -89.4028, category: 'residence_hall' },
  { name: 'Lakeshore Residence Halls', latitude: 43.0780, longitude: -89.4160, category: 'residence_hall' },
  // Medical
  { name: 'UW Hospital', latitude: 43.0777, longitude: -89.4288, category: 'medical' },
] as const;

/** Earth radius in km */
const EARTH_RADIUS_KM = 6371;

/** Average walking speed in km/h */
const WALK_SPEED_KMH = 5;

/** Maximum distance in km to consider a landmark "nearby" */
const MAX_DISTANCE_KM = 1.5;

/** Convert degrees to radians */
function toRadians(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Haversine distance between two lat/lng points in kilometers.
 * Accurate for short distances (campus scale).
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest campus landmark to a given lat/lng.
 * Returns null if no landmark is within MAX_DISTANCE_KM (1.5 km).
 */
export function findNearestLandmark(
  latitude: number,
  longitude: number,
): NearestLandmark | null {
  let closest: NearestLandmark | null = null;
  let minDist = Infinity;

  for (const landmark of UW_MADISON_LANDMARKS) {
    const dist = haversineDistance(latitude, longitude, landmark.latitude, landmark.longitude);
    if (dist < minDist) {
      minDist = dist;
      closest = {
        name: landmark.name,
        category: landmark.category,
        distanceKm: Math.round(dist * 100) / 100,
        walkMinutes: Math.round((dist / WALK_SPEED_KMH) * 60),
      };
    }
  }

  // Only return if within reasonable distance
  if (closest && closest.distanceKm <= MAX_DISTANCE_KM) {
    return closest;
  }
  return null;
}

/** Human-readable category labels */
const CATEGORY_LABELS: Record<string, string> = {
  academic: 'Academic',
  library: 'Library',
  recreation: 'Student Life',
  landmark: 'Landmark',
  sports: 'Sports',
  residence_hall: 'Residence Hall',
  medical: 'Medical',
  dining: 'Dining',
};

/** Get a human-readable label for a landmark category */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}
