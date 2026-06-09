/**
 * CribAI — Personal CRM "My Apartments" fixtures (typed TS port of
 * engineering/mockups/crm-frontend/shared/mock-data.js).
 *
 * Contract-backed fields stay top-level on each row (CrmListingRow shape,
 * unchanged); application-pipeline / collaboration / unit-vs-building extras
 * are quarantined under `_proposed` (see proposed-types.ts + CONTRACT-DELTAS.md).
 *
 * Every export is typed against the real @campusnest/ai contract so a shape
 * drift surfaces as a compile error, not a runtime surprise.
 */
import type { AddListingResult, FirstSaveAnalysis, RankCompareResult } from '@campusnest/ai';
// TrueCost lives in @campusnest/types (its canonical source); the @campusnest/ai
// barrel re-exports TrueCostInput but not TrueCost, so import it from types.
import type { TrueCost } from '@campusnest/types';
import type { CrmList, CrmUnit } from './proposed-types';

/** The hero unit — Chapter at Madison · Studio S1 — is always UNITS[0]. */
const HERO_UNIT_ID = 'crm_chapter_s1';

// Stable Unsplash apartment / interior photos, sized for cards.
const photo = (id: string, w = 900): string =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// ---------------------------------------------------------------------------
// PROPOSED EXTENSION — shared list (collaboration). Backend home: crm_lists +
// crm_list_members (see CONTRACT-DELTAS.md).
// ---------------------------------------------------------------------------
export const CRM_LIST: CrmList = {
  id: 'list_fall26',
  name: 'Fall 2026 hunt',
  ownerId: 'usr_badger',
  members: [
    { id: 'usr_badger', name: 'Ainesh', initials: 'AM', color: '#991b1b' }, // owner (you)
    { id: 'usr_maya', name: 'Maya', initials: 'MA', color: '#1d4ed8' },
    { id: 'usr_jordan', name: 'Jordan', initials: 'JO', color: '#059669' },
  ],
};

// ---------------------------------------------------------------------------
// CrmUnit[] — 6 UW-Madison UNITS / FLOOR PLANS (Chapter S1 first).
// ---------------------------------------------------------------------------
export const UNITS: CrmUnit[] = [
  {
    // HERO unit: Chapter at Madison · Studio "S1"
    id: 'crm_chapter_s1',
    user_id: 'usr_badger',
    source_url: 'https://www.chapter-madison.com/floor-plans/studio-s1',
    source_site: 'chapter-madison.com',
    title: 'Chapter at Madison · Studio "S1"',
    address: '832 Regent St, Madison, WI 53715',
    rent: 1495,
    bedrooms: 0,
    bathrooms: 1,
    sqft: 395,
    available_from: '2026-08-23',
    description:
      'Studio floor plan "S1" at Chapter at Madison. 395 sqft with a Murphy-style bed nook, in-unit washer/dryer, and a private balcony. Building has a rooftop deck, 24/7 fitness center, and a study lounge. Signing fees waived if you apply within 48 hours.',
    amenities: ['In-unit laundry', 'Private balcony', 'Furnished', 'Rooftop deck', 'Fitness center', 'Study lounge'],
    photo_urls: [photo('photo-1554995207-c18c203602cb'), photo('photo-1556912173-3bb406ef7e77')],
    extraction_confidence: 0.94,
    status: 'active', // maps from _proposed.application.stage 'saved'
    user_notes: 'The 48h fee waiver is the clock. Loved the balcony + in-unit W/D.',
    latitude: 43.0689,
    longitude: -89.4015,
    saved_at: '2026-06-08T14:22:00Z',
    _proposed: {
      unit: { building: 'Chapter at Madison', floorPlan: 'S1', unitLabel: 'Studio S1' },
      amenitySplit: {
        unit: ['In-unit laundry', 'Private balcony', 'Furnished', '395 sqft'],
        building: ['Rooftop deck', '24/7 fitness center', 'Study lounge'],
      },
      application: {
        stage: 'saved',
        deadline: '2026-06-10T14:22:00Z',
        deadlineLabel: 'Apply within 48h — signing fees waived',
        submittedAt: null,
        documents: [
          { name: 'Application form', done: false },
          { name: 'Proof of income / guarantor', done: false },
          { name: 'Photo ID', done: false },
        ],
      },
      addedBy: 'usr_badger',
    },
  },
  {
    id: 'crm_dayton_2x1a',
    user_id: 'usr_badger',
    source_url: 'https://www.zillow.com/homedetails/523-W-Dayton-St-Madison-WI/12345_zpid/',
    source_site: 'zillow',
    title: 'Dayton Row · "2x1-A"',
    address: '523 W Dayton St, Madison, WI 53703',
    rent: 1650,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 880,
    available_from: '2026-08-15',
    description:
      'Floor plan "2x1-A" in a quiet brick walkup near the Kohl Center. Heat & water included. Hardwood floors, dishwasher, building has shared on-site laundry. 9-minute walk to Bascom Hall.',
    amenities: ['Heat included', 'Water included', 'Dishwasher', 'Hardwood floors', 'On-site laundry'],
    photo_urls: [photo('photo-1522708323590-d24dbb6b0267'), photo('photo-1502672260266-1c1ef2d93688')],
    extraction_confidence: 0.94,
    status: 'toured',
    user_notes: 'Toured 6/4. Loved the light. Landlord responsive over email.',
    latitude: 43.0708,
    longitude: -89.3998,
    saved_at: '2026-06-06T14:22:00Z',
    _proposed: {
      unit: { building: 'Dayton Row', floorPlan: '2x1-A', unitLabel: '2 bed · 2x1-A' },
      amenitySplit: {
        unit: ['Dishwasher', 'Hardwood floors', 'Heat included', 'Water included', '880 sqft'],
        building: ['On-site laundry'],
      },
      application: {
        stage: 'toured',
        deadline: null,
        deadlineLabel: null,
        submittedAt: null,
        documents: [],
      },
      addedBy: 'usr_maya',
    },
  },
  {
    id: 'crm_lucky_4x2b',
    user_id: 'usr_badger',
    source_url: 'https://www.luckyapartments.com/units/state-st-4br',
    source_site: 'luckyapartments.com',
    title: 'Lucky on State · "4x2-B"',
    address: '126 State St, Madison, WI 53703',
    rent: 2400,
    bedrooms: 4,
    bathrooms: 2,
    sqft: 1280,
    available_from: '2026-09-01',
    description:
      'Floor plan "4x2-B" above the State Street shops. Four real bedrooms, two full baths, in-unit washer/dryer. Splits to $600/room. Building has bike storage. Right on the pedestrian mall.',
    amenities: ['In-unit laundry', 'Dishwasher', 'Central air', 'Bike storage'],
    photo_urls: [photo('photo-1493809842364-78817add7ffb')],
    extraction_confidence: 0.91,
    status: 'active',
    user_notes: null,
    latitude: 43.0752,
    longitude: -89.3889,
    saved_at: '2026-06-05T18:45:00Z',
    _proposed: {
      unit: { building: 'Lucky on State', floorPlan: '4x2-B', unitLabel: '4 bed · 4x2-B' },
      amenitySplit: {
        unit: ['In-unit laundry', 'Dishwasher', 'Central air', '1,280 sqft'],
        building: ['Bike storage'],
      },
      application: {
        stage: 'saved',
        deadline: null,
        deadlineLabel: null,
        submittedAt: null,
        documents: [],
      },
      addedBy: 'usr_jordan',
    },
  },
  {
    id: 'crm_langdon_1brc',
    user_id: 'usr_badger',
    source_url: 'https://www.zillow.com/homedetails/118-Langdon-St-Madison-WI/67890_zpid/',
    source_site: 'zillow',
    title: 'The Langdon · "1BR-C"',
    address: '118 Langdon St, Madison, WI 53703',
    rent: 1180,
    bedrooms: 1,
    bathrooms: 1,
    sqft: 560,
    available_from: '2026-08-15',
    description:
      'Floor plan "1BR-C" on historic Langdon, half a block to Lake Mendota and the Memorial Union Terrace. Older building, radiator heat included. Cats OK.',
    amenities: ['Heat included', 'Cats OK', 'Near lake'],
    photo_urls: [photo('photo-1484154218962-a197022b5858')],
    extraction_confidence: 0.72,
    status: 'applied',
    user_notes: 'Applied 6/5 — submitted everything. This is my front-runner.',
    latitude: 43.0766,
    longitude: -89.3995,
    saved_at: '2026-05-30T11:02:00Z',
    _proposed: {
      unit: { building: 'The Langdon', floorPlan: '1BR-C', unitLabel: '1 bed · 1BR-C' },
      amenitySplit: {
        unit: ['Heat included', '560 sqft', 'Cats OK'],
        building: ['Near lake'],
      },
      application: {
        stage: 'applied',
        deadline: null,
        deadlineLabel: null,
        submittedAt: '2026-06-05T16:40:00Z',
        documents: [
          { name: 'Application form', done: true },
          { name: 'Proof of income / guarantor', done: true },
          { name: 'Photo ID', done: true },
        ],
      },
      addedBy: 'usr_badger',
    },
  },
  {
    id: 'crm_regent_2x15',
    user_id: 'usr_badger',
    source_url: 'https://www.craigslist.org/madison/regent-st-2br',
    source_site: 'craigslist',
    title: 'Regent Place · "2x1.5"',
    address: '1402 Regent St, Madison, WI 53711',
    rent: 1320,
    bedrooms: 2,
    bathrooms: 1.5,
    sqft: 920,
    available_from: '2026-07-01',
    description:
      'Floor plan "2x1.5" near UW Hospital and Camp Randall. Off-street parking ($60/mo extra). Building coin laundry in basement. 14-min bus to campus on Route 80.',
    amenities: ['Off-street parking', 'Pets negotiable'],
    photo_urls: [photo('photo-1568605114967-8130f3a36994')],
    extraction_confidence: 0.55,
    status: 'declined',
    user_notes: 'Bus commute too long. Passed.',
    latitude: 43.0671,
    longitude: -89.4178,
    saved_at: '2026-05-28T16:30:00Z',
    _proposed: {
      unit: { building: 'Regent Place', floorPlan: '2x1.5', unitLabel: '2 bed · 2x1.5' },
      amenitySplit: {
        unit: ['Off-street parking', '920 sqft', 'Pets negotiable'],
        building: ['Coin laundry'],
      },
      application: {
        stage: 'decision',
        deadline: null,
        deadlineLabel: 'Passed — bus commute too long',
        submittedAt: null,
        documents: [],
      },
      addedBy: 'usr_badger',
    },
  },
  {
    id: 'crm_gilman_studio',
    user_id: 'usr_badger',
    source_url: 'https://www.apartments.com/gilman-st-studio-madison-wi',
    source_site: 'apartments.com',
    title: 'Gilman Garden · "Studio-G" (sublease)',
    address: '212 W Gilman St, Madison, WI 53703',
    rent: 900,
    bedrooms: 0,
    bathrooms: 1,
    sqft: 380,
    available_from: '2026-06-15',
    description:
      'Student sublease through August — floor plan "Studio-G", garden level. Utilities split with the house. Walk to Library Mall in 6 minutes. Furnished, flexible end date.',
    amenities: ['Furnished', 'Utilities split', 'Walk to campus'],
    photo_urls: [photo('photo-1502005229762-cf1b2da7c5d6')],
    extraction_confidence: 0.81,
    status: 'archived',
    user_notes: null,
    latitude: 43.0738,
    longitude: -89.3925,
    saved_at: '2026-05-25T13:15:00Z',
    _proposed: {
      unit: { building: 'Gilman Garden', floorPlan: 'Studio-G', unitLabel: 'Studio · Studio-G' },
      amenitySplit: {
        unit: ['Furnished', '380 sqft'],
        building: ['Utilities split', 'Walk to campus'],
      },
      application: {
        stage: 'saved',
        deadline: null,
        deadlineLabel: null,
        submittedAt: null,
        documents: [],
      },
      addedBy: 'usr_maya',
    },
  },
];

// ---------------------------------------------------------------------------
// AddListingResult — result of pasting the Chapter at Madison URL.
// ---------------------------------------------------------------------------
export const ADD_LISTING_RESULT: AddListingResult = {
  listingId: HERO_UNIT_ID,
  alreadySaved: false,
  confidence: 0.94,
};

// ---------------------------------------------------------------------------
// FanoutBranch payloads for the FirstSaveAnalysis fixtures.
//   TrueCost components SUM to total exactly:
//   1495 + 0 + 0 + 0 + 0 + 15 + 80 = 1590
// ---------------------------------------------------------------------------
const TRUE_COST: TrueCost = {
  rent: 1495,
  utilities: 0, // bundled into rent at Chapter
  parking: 0, // downtown, no car
  internet: 0, // bundled
  laundry: 0, // in-unit W/D
  renterInsurance: 15, // monthly
  moveInFees: 80, // app + admin amortized over a 12-mo lease
  total: 1590,
};

const RED_FLAGS = {
  flags: ['48h pressure tactic', 'Furnished fee not itemized'],
  summary:
    'Clean listing overall. The "signing fees waived in 48h" offer is a real incentive but also a pressure tactic — confirm the waived amount in writing. The furnished premium isn\'t broken out separately from base rent.',
};

// Title-case buckets match the contract category map
// (TYPE_CATEGORY_MAP in packages/ai/src/crm/first-save-analysis.ts):
// Grocery, Dining, Fitness, Health, Services, Other.
const PLACES_SNAPSHOT = {
  categories: {
    Grocery: ["Trader Joe's", "Metcalfe's Market", 'Fresh Madison Market'],
    Dining: ['Colectivo Coffee', 'Steep & Brew', 'Ian’s Pizza on State'],
    Fitness: ['UW Natatorium', 'Orangetheory Fitness'],
    Health: ['Walgreens on Regent', 'UW Health University Hospital'],
    Services: ['The Soap Opera Laundromat', 'UPS Store on State'],
  },
};

// Exact contract steering string (STATIC_STEERING_QUESTION in
// packages/ai/src/crm/first-save-analysis.ts).
const STEERING_QUESTION = {
  question: 'What matters most to you in your next place — price, commute, or space?',
};

/** FirstSaveAnalysis — all branches OK. */
export const ANALYSIS_FULL: FirstSaveAnalysis = {
  listingId: 'crm_chapter_s1',
  trueCost: { status: 'ok', data: TRUE_COST },
  redFlags: { status: 'ok', data: RED_FLAGS },
  placesSnapshot: { status: 'ok', data: PLACES_SNAPSHOT },
  steeringQuestion: { status: 'ok', data: STEERING_QUESTION },
};

/** FirstSaveAnalysis — honest PARTIAL case: placesSnapshot skipped (no coordinates). */
export const ANALYSIS_PARTIAL: FirstSaveAnalysis = {
  listingId: 'crm_chapter_s1',
  trueCost: { status: 'ok', data: TRUE_COST },
  redFlags: { status: 'ok', data: RED_FLAGS },
  placesSnapshot: { status: 'skipped', reason: 'no coordinates' },
  steeringQuestion: { status: 'ok', data: STEERING_QUESTION },
};

// ---------------------------------------------------------------------------
// RankCompareResult — rank (0..100 scores + per-dimension breakdown).
// ---------------------------------------------------------------------------
export const RANK_RESULT: RankCompareResult = {
  mode: 'rank',
  ranked: [
    {
      listingId: 'crm_langdon_1brc',
      title: 'The Langdon · "1BR-C"',
      score: 88,
      breakdown: { rent: 92, bedrooms: 60, sqft: 64, commute: 95 },
    },
    {
      listingId: 'crm_chapter_s1',
      title: 'Chapter at Madison · Studio "S1"',
      score: 85,
      breakdown: { rent: 80, bedrooms: 50, sqft: 58, commute: 92 },
    },
    {
      listingId: 'crm_dayton_2x1a',
      title: 'Dayton Row · "2x1-A"',
      score: 84,
      breakdown: { rent: 78, bedrooms: 88, sqft: 82, commute: 90 },
    },
  ],
};

// ---------------------------------------------------------------------------
// RankCompareResult — compare (side-by-side rows).
// ---------------------------------------------------------------------------
export const COMPARE_RESULT: RankCompareResult = {
  mode: 'compare',
  rows: [
    {
      listingId: 'crm_chapter_s1',
      title: 'Chapter at Madison · Studio "S1"',
      rent: 1495,
      bedrooms: 0,
      bathrooms: 1,
      sqft: 395,
      amenities: ['In-unit laundry', 'Private balcony', 'Furnished'],
    },
    {
      listingId: 'crm_dayton_2x1a',
      title: 'Dayton Row · "2x1-A"',
      rent: 1650,
      bedrooms: 2,
      bathrooms: 1,
      sqft: 880,
      amenities: ['Heat included', 'Dishwasher', 'On-site laundry'],
    },
  ],
};
