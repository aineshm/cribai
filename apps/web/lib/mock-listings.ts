/**
 * Mock listing data for the Explore page.
 * Used during development until real Supabase data is wired.
 */

export interface Listing {
  readonly id: string;
  readonly title: string;
  readonly address: string;
  readonly price: number;
  readonly beds: number;
  readonly baths: number;
  readonly sqft: number;
  readonly distanceToCampus: number;
  readonly rating: number;
  readonly photoUrls: readonly string[];
  /** Tailwind gradient class used as a placeholder when no real photo is available */
  readonly placeholderGradient: string;
  readonly amenities: readonly string[];
  readonly isVerified: boolean;
  readonly isSaved: boolean;
  readonly landlord: {
    readonly name: string;
    readonly rating: number;
  };
}

/** Placeholder gradient backgrounds for listing photos */
const gradients = [
  'from-primary-200 to-primary-400',
  'from-secondary-200 to-secondary-400',
  'from-red-200 to-emerald-400',
  'from-slate-200 to-orange-400',
  'from-rose-200 to-pink-400',
  'from-sky-200 to-blue-400',
  'from-violet-200 to-purple-400',
  'from-lime-200 to-green-400',
  'from-cyan-200 to-red-400',
  'from-fuchsia-200 to-pink-400',
] as const;

export const mockListings: readonly Listing[] = [
  {
    id: '1',
    title: 'Modern Studio on State St',
    address: '432 State St, Madison, WI 53703',
    price: 1250,
    beds: 0,
    baths: 1,
    sqft: 475,
    distanceToCampus: 0.2,
    rating: 4.5,
    photoUrls: [],
    placeholderGradient: gradients[0],
    amenities: ['In-Unit Laundry', 'AC', 'Dishwasher'],
    isVerified: true,
    isSaved: false,
    landlord: { name: 'Madison Realty', rating: 4.3 },
  },
  {
    id: '2',
    title: 'Spacious 2BR near Camp Randall',
    address: '1120 Regent St, Madison, WI 53715',
    price: 1850,
    beds: 2,
    baths: 1,
    sqft: 920,
    distanceToCampus: 0.5,
    rating: 4.8,
    photoUrls: [],
    placeholderGradient: gradients[1],
    amenities: ['Parking', 'Pet Friendly', 'Balcony'],
    isVerified: true,
    isSaved: true,
    landlord: { name: 'Badger Properties', rating: 4.7 },
  },
  {
    id: '3',
    title: 'Cozy 1BR on Gorham',
    address: '215 N Gorham St, Madison, WI 53703',
    price: 1100,
    beds: 1,
    baths: 1,
    sqft: 580,
    distanceToCampus: 0.3,
    rating: 4.2,
    photoUrls: [],
    placeholderGradient: gradients[2],
    amenities: ['Furnished', 'Utilities Included', 'Bike Storage'],
    isVerified: false,
    isSaved: false,
    landlord: { name: 'Lake View Mgmt', rating: 3.9 },
  },
  {
    id: '4',
    title: 'Luxury 3BR Lakeview Penthouse',
    address: '21 N Park St, Madison, WI 53715',
    price: 3200,
    beds: 3,
    baths: 2,
    sqft: 1450,
    distanceToCampus: 0.8,
    rating: 4.9,
    photoUrls: [],
    placeholderGradient: gradients[3],
    amenities: ['Lake View', 'Gym', 'Rooftop Deck', 'Doorman'],
    isVerified: true,
    isSaved: false,
    landlord: { name: 'Apex Living', rating: 4.8 },
  },
  {
    id: '5',
    title: 'Budget-Friendly Room in 4BR',
    address: '518 W Mifflin St, Madison, WI 53703',
    price: 650,
    beds: 1,
    baths: 1,
    sqft: 250,
    distanceToCampus: 0.4,
    rating: 3.8,
    photoUrls: [],
    placeholderGradient: gradients[4],
    amenities: ['Shared Kitchen', 'WiFi Included', 'Laundry in Building'],
    isVerified: false,
    isSaved: false,
    landlord: { name: 'Student Spaces LLC', rating: 3.5 },
  },
  {
    id: '6',
    title: 'Renovated 2BR with Parking',
    address: '740 Langdon St, Madison, WI 53706',
    price: 1650,
    beds: 2,
    baths: 1,
    sqft: 850,
    distanceToCampus: 0.1,
    rating: 4.6,
    photoUrls: [],
    placeholderGradient: gradients[5],
    amenities: ['Parking', 'AC', 'Dishwasher', 'In-Unit Laundry'],
    isVerified: true,
    isSaved: true,
    landlord: { name: 'Langdon Row', rating: 4.4 },
  },
  {
    id: '7',
    title: 'Pet-Friendly 1BR on Monroe',
    address: '1903 Monroe St, Madison, WI 53711',
    price: 1300,
    beds: 1,
    baths: 1,
    sqft: 650,
    distanceToCampus: 1.2,
    rating: 4.4,
    photoUrls: [],
    placeholderGradient: gradients[6],
    amenities: ['Pet Friendly', 'Fenced Yard', 'Garage'],
    isVerified: true,
    isSaved: false,
    landlord: { name: 'Monroe Living Co', rating: 4.5 },
  },
  {
    id: '8',
    title: 'New Construction Studio',
    address: '325 W Johnson St, Madison, WI 53703',
    price: 1450,
    beds: 0,
    baths: 1,
    sqft: 510,
    distanceToCampus: 0.3,
    rating: 4.7,
    photoUrls: [],
    placeholderGradient: gradients[7],
    amenities: ['Smart Lock', 'Package Room', 'Rooftop', 'Gym'],
    isVerified: true,
    isSaved: false,
    landlord: { name: 'Urban Core Dev', rating: 4.6 },
  },
  {
    id: '9',
    title: 'Charming 2BR Victorian',
    address: '112 S Mills St, Madison, WI 53715',
    price: 1550,
    beds: 2,
    baths: 1,
    sqft: 900,
    distanceToCampus: 0.6,
    rating: 4.3,
    photoUrls: [],
    placeholderGradient: gradients[8],
    amenities: ['Hardwood Floors', 'Bay Window', 'Garden'],
    isVerified: false,
    isSaved: false,
    landlord: { name: 'Heritage Homes', rating: 4.1 },
  },
  {
    id: '10',
    title: 'Furnished 3BR near Engineering',
    address: '601 University Ave, Madison, WI 53715',
    price: 2400,
    beds: 3,
    baths: 2,
    sqft: 1200,
    distanceToCampus: 0.2,
    rating: 4.5,
    photoUrls: [],
    placeholderGradient: gradients[9],
    amenities: ['Furnished', 'AC', 'Study Room', 'Bike Storage'],
    isVerified: true,
    isSaved: false,
    landlord: { name: 'Campus Corner Mgmt', rating: 4.2 },
  },
] as const;
