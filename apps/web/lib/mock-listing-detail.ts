/**
 * Mock data for the Listing Detail page (Phase 13).
 * Provides a DetailedListing type and sample data for UI development.
 */

export interface DetailedListing {
  readonly id: string;
  readonly title: string;
  readonly address: string;
  readonly price: number;
  readonly beds: number;
  readonly baths: number;
  readonly sqft: number;
  readonly photos: readonly PhotoItem[];
  readonly description: string;
  readonly amenities: readonly AmenityItem[];
  readonly leaseSummary: LeaseSummary;
  readonly commuteDistances: readonly CommuteDistance[];
  readonly reviews: readonly Review[];
  readonly landlord: LandlordInfo;
}

export interface PhotoItem {
  readonly id: string;
  readonly gradient: string;
  readonly alt: string;
}

export interface AmenityItem {
  readonly name: string;
  readonly icon: string;
}

export interface LeaseSummary {
  readonly length: string;
  readonly deposit: number;
  readonly petDeposit: number;
  readonly moveInDate: string;
  readonly utilitiesIncluded: readonly string[];
  readonly utilitiesTenantPaid: readonly string[];
}

export interface CommuteDistance {
  readonly building: string;
  readonly walkMin: number;
  readonly bikeMin: number;
  readonly busMin: number;
}

export interface Review {
  readonly id: string;
  readonly studentName: string;
  readonly university: string;
  readonly date: string;
  readonly rating: number;
  readonly text: string;
}

export interface LandlordInfo {
  readonly name: string;
  readonly photo: string;
  readonly rating: number;
  readonly responseRate: string;
}

const MOCK_PHOTOS: readonly PhotoItem[] = [
  {
    id: 'p1',
    gradient: 'from-primary-200 to-primary-400',
    alt: 'Spacious living room with natural light',
  },
  {
    id: 'p2',
    gradient: 'from-secondary-100 to-secondary-400',
    alt: 'Modern kitchen with updated appliances',
  },
  {
    id: 'p3',
    gradient: 'from-primary-100 to-primary-300',
    alt: 'Master bedroom with closet',
  },
  {
    id: 'p4',
    gradient: 'from-accent-50 to-accent-100',
    alt: 'Clean bathroom with tile floors',
  },
  {
    id: 'p5',
    gradient: 'from-surface-100 to-surface-300',
    alt: 'Private balcony with campus view',
  },
  {
    id: 'p6',
    gradient: 'from-primary-50 to-secondary-200',
    alt: 'Building exterior and entrance',
  },
] as const;

const MOCK_AMENITIES: readonly AmenityItem[] = [
  { name: 'In-Unit Washer/Dryer', icon: 'WashingMachine' },
  { name: 'Air Conditioning', icon: 'AirVent' },
  { name: 'Dishwasher', icon: 'Utensils' },
  { name: 'High-Speed WiFi', icon: 'Wifi' },
  { name: 'Gym Access', icon: 'Dumbbell' },
  { name: 'Swimming Pool', icon: 'Waves' },
  { name: 'Pet Friendly', icon: 'PawPrint' },
  { name: 'Parking Included', icon: 'Car' },
  { name: 'Study Lounge', icon: 'BookOpen' },
  { name: 'Package Lockers', icon: 'Package' },
  { name: 'Bike Storage', icon: 'Bike' },
  { name: 'EV Charging', icon: 'Zap' },
] as const;

const MOCK_COMMUTE: readonly CommuteDistance[] = [
  { building: 'Main Library', walkMin: 8, bikeMin: 3, busMin: 5 },
  { building: 'Engineering Hall', walkMin: 12, bikeMin: 5, busMin: 7 },
  { building: 'Student Union', walkMin: 10, bikeMin: 4, busMin: 6 },
  { building: 'Recreation Center', walkMin: 15, bikeMin: 6, busMin: 9 },
] as const;

const MOCK_REVIEWS: readonly Review[] = [
  {
    id: 'r1',
    studentName: 'Alex M.',
    university: 'State University',
    date: '2025-12-15',
    rating: 5,
    text: 'Amazing apartment! Super close to campus and the landlord is very responsive. The in-unit laundry is a game changer.',
  },
  {
    id: 'r2',
    studentName: 'Jordan K.',
    university: 'State University',
    date: '2025-11-02',
    rating: 4,
    text: 'Great location and amenities. Only downside is street noise on weekends, but overall a solid place to live.',
  },
  {
    id: 'r3',
    studentName: 'Sam T.',
    university: 'State University',
    date: '2025-09-20',
    rating: 5,
    text: 'Lived here for two semesters. Maintenance requests are handled within 24 hours. Highly recommend!',
  },
] as const;

export const MOCK_LISTING_DETAIL: DetailedListing = {
  id: 'mock-listing-001',
  title: 'Sunlit 2BR Near Campus — Walk to Class',
  address: '1234 University Ave, Apt 5B, College Town, ST 12345',
  price: 1450,
  beds: 2,
  baths: 1,
  sqft: 875,
  photos: MOCK_PHOTOS,
  description:
    'Bright and airy 2-bedroom apartment just steps from campus. Features hardwood floors throughout, a recently renovated kitchen with granite countertops and stainless steel appliances, and a private balcony overlooking the quad. The building includes secure entry, on-site laundry, and a rooftop study lounge perfect for exam season. Utilities (water, trash, internet) are included in rent. Available for the upcoming academic year with flexible move-in dates.',
  amenities: MOCK_AMENITIES,
  leaseSummary: {
    length: '12 months (Aug 2026 – Jul 2027)',
    deposit: 1450,
    petDeposit: 300,
    moveInDate: 'August 1, 2026',
    utilitiesIncluded: ['Water', 'Trash', 'Internet'],
    utilitiesTenantPaid: ['Electricity', 'Gas'],
  },
  commuteDistances: MOCK_COMMUTE,
  reviews: MOCK_REVIEWS,
  landlord: {
    name: 'Patricia Chen',
    photo: '',
    rating: 4.8,
    responseRate: '98%',
  },
} as const;

export function getMockListingById(
  _id: string,
): DetailedListing {
  return MOCK_LISTING_DETAIL;
}
