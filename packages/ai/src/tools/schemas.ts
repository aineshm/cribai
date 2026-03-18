import { Type, type FunctionDeclaration } from '@google/genai';
import type { ToolName } from './types';

const searchListings: FunctionDeclaration = {
  name: 'search_listings',
  description:
    'Search for student housing listings near campus. Use this when the user wants to DISCOVER new apartments — e.g., "find me a 2-bedroom" or "what\'s available under $1200". Supports semantic search for qualitative preferences like "quiet place with natural light". Do NOT use this tool when the user has already identified a specific listing and wants to take an action on it (like scheduling a tour, getting details, or comparing). In those cases, use the appropriate action tool directly.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      semantic_query: {
        type: Type.STRING,
        description:
          'Natural language description of what the user wants (e.g., "quiet place near campus with natural light"). Set this when the user describes qualitative preferences beyond just beds/price.',
      },
      address: {
        type: Type.STRING,
        description:
          'Street address or location name to search near (e.g., "456 W Gorham St" or "Langdon Street area"). Leverages semantic search to find listings near the specified location.',
      },
      bedrooms: {
        type: Type.INTEGER,
        description: 'Number of bedrooms (0 for studio, 1-4+)',
      },
      min_rent: {
        type: Type.NUMBER,
        description: 'Minimum monthly rent in dollars',
      },
      max_rent: {
        type: Type.NUMBER,
        description: 'Maximum monthly rent in dollars',
      },
      min_fairness: {
        type: Type.NUMBER,
        description: 'Minimum fairness score (1-10, higher = better value)',
      },
      amenities: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Required amenities (e.g., "parking", "laundry", "ac")',
      },
      sort: {
        type: Type.STRING,
        enum: ['price_asc', 'price_desc', 'fairness', 'relevance'],
        description: 'Sort order for results. Use "relevance" with semantic_query for similarity-ranked results.',
      },
      limit: {
        type: Type.INTEGER,
        description: 'Maximum number of results (default 5, max 10)',
      },
    },
  },
};

const getListingDetail: FunctionDeclaration = {
  name: 'get_listing_detail',
  description:
    'Get full details for a specific listing including true cost breakdown and fairness analysis. Use when the user asks for more details about a specific listing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      listing_id: {
        type: Type.STRING,
        description: 'UUID of the listing to fetch',
      },
    },
    required: ['listing_id'],
  },
};

const compareListings: FunctionDeclaration = {
  name: 'compare_listings',
  description:
    'Compare 2-4 listings side by side. Use when the user wants to compare specific apartments.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      listing_ids: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'UUIDs of listings to compare (2-4)',
      },
    },
    required: ['listing_ids'],
  },
};

const scheduleTour: FunctionDeclaration = {
  name: 'schedule_tour',
  description:
    'Schedule a tour for a specific listing. Use this when the user wants to visit or tour a listing that has already been identified in the conversation. First collect the student name, email, and preferred dates, then call this tool. Do NOT run search_listings first if the user already specified which listing they want to tour.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      listing_id: {
        type: Type.STRING,
        description: 'UUID of the listing to tour',
      },
      student_name: {
        type: Type.STRING,
        description: 'Full name of the student',
      },
      student_email: {
        type: Type.STRING,
        description: 'Student email address',
      },
      preferred_dates: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Preferred tour dates in YYYY-MM-DD format',
      },
      notes: {
        type: Type.STRING,
        description: 'Optional notes or special requests',
      },
    },
    required: ['listing_id', 'student_name', 'student_email', 'preferred_dates'],
  },
};

const explainLeaseTerm: FunctionDeclaration = {
  name: 'explain_lease_term',
  description:
    'Explain a lease or rental term. Use when the user asks about lease clauses, tenant rights, or rental terminology.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      term: {
        type: Type.STRING,
        description: 'The lease term or concept to explain (e.g., "joint and several liability", "security deposit")',
      },
      context: {
        type: Type.STRING,
        description: 'Additional context about the student\'s situation',
      },
    },
    required: ['term'],
  },
};

const getLandlordInfo: FunctionDeclaration = {
  name: 'get_landlord_info',
  description:
    'Get landlord information and review summary. Use when the user asks about a landlord or property management company.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      landlord_id: {
        type: Type.STRING,
        description: 'UUID of the landlord',
      },
      listing_id: {
        type: Type.STRING,
        description: 'UUID of a listing to find its landlord',
      },
      name: {
        type: Type.STRING,
        description: 'Name of the landlord or property management company to search for',
      },
    },
  },
};

const webSearch: FunctionDeclaration = {
  name: 'web_search',
  description:
    'Search the web for rental listings and housing information when the local database does not have enough results. Use this when search_listings returns fewer than 1 unique property matching the query, or when the user explicitly asks to search the web.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query describing what the user is looking for (e.g., "3 bedroom apartments near UW Madison under $1500")',
      },
      location: {
        type: Type.STRING,
        description: 'City or area to focus the search on (e.g., "Madison WI")',
      },
    },
    required: ['query'],
  },
};

const getSavedListings: FunctionDeclaration = {
  name: 'get_saved_listings',
  description:
    "Get the user's saved/favorited listings. Use when the user asks about their saved listings, favorites, or references 'my saved', 'my favorites'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      sort: {
        type: Type.STRING,
        enum: ['saved_date', 'price_asc', 'price_desc', 'fairness'],
        description: 'Sort order for results',
      },
      limit: {
        type: Type.INTEGER,
        description: 'Maximum number of results (default 10, max 20)',
      },
    },
  },
};

const getReviews: FunctionDeclaration = {
  name: 'get_reviews',
  description:
    'Get reviews and community feedback for a property or landlord. Use when the user asks about reviews, ratings, or tenant experiences for a listing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      listing_id: {
        type: Type.STRING,
        description: 'UUID of the listing to get reviews for',
      },
      address: {
        type: Type.STRING,
        description: 'Address of the property to search reviews for',
      },
    },
  },
};

const contactPm: FunctionDeclaration = {
  name: 'contact_pm',
  description:
    'Send a message or inquiry to a property manager. Use when the user wants to contact a landlord or property manager about a listing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      listing_id: {
        type: Type.STRING,
        description: 'UUID of the listing whose property manager to contact',
      },
      message: {
        type: Type.STRING,
        description: 'Optional message to send to the property manager (max 500 characters)',
      },
    },
    required: ['listing_id'],
  },
};

const getNeighborhoodInfo: FunctionDeclaration = {
  name: 'get_neighborhood_info',
  description:
    'Get neighborhood information including walkability, safety, commute times, and local vibe. Use when the user asks about the area around a listing.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      address: {
        type: Type.STRING,
        description: 'Address to get neighborhood info for',
      },
      listing_id: {
        type: Type.STRING,
        description: 'UUID of the listing to get neighborhood info for',
      },
      topics: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Specific topics to cover (e.g., "walkability", "safety", "commute", "vibe")',
      },
    },
  },
};

const createSublease: FunctionDeclaration = {
  name: 'create_sublease',
  description:
    'Create a sublease listing on CampusNest. This is a two-phase tool:\n' +
    'Phase 1 (confirmed=false): Validates extracted fields and returns a formatted preview for the user to review.\n' +
    'Phase 2 (confirmed=true): Publishes the listing after user confirms. You MUST re-send ALL fields, not just confirmed=true.\n\n' +
    'Before calling this tool, collect the required fields from conversation:\n' +
    '- address (required)\n' +
    '- bedrooms_total + bedrooms_available (required)\n' +
    'For optional fields, ask naturally: rent ("Would you like to put a price?"), dates, unit number.\n' +
    'If the user does not provide contact_email, their account email will be used.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      address: {
        type: Type.STRING,
        description: 'Full address of the property (e.g., "Randall Station, 1-2 W Dayton St, Madison WI")',
      },
      bedrooms_total: {
        type: Type.INTEGER,
        description: 'Total bedrooms in the unit (0 for studio)',
      },
      bedrooms_available: {
        type: Type.INTEGER,
        description: 'Number of bedrooms being subleased',
      },
      contact_email: {
        type: Type.STRING,
        description: 'Contact email for inquiries. Omit to use the user\'s account email.',
      },
      rent_monthly: {
        type: Type.NUMBER,
        description: 'Monthly rent in dollars. Omit if rent is negotiable.',
      },
      bathrooms: {
        type: Type.NUMBER,
        description: 'Number of bathrooms',
      },
      available_from: {
        type: Type.STRING,
        description: 'Sublease start date in YYYY-MM-DD format',
      },
      available_to: {
        type: Type.STRING,
        description: 'Lease end date in YYYY-MM-DD format',
      },
      description: {
        type: Type.STRING,
        description: 'Description of the sublease — preserve details from conversation (amenities, roommates, vibe, included utilities)',
      },
      amenities: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of amenities (e.g., "furnished", "parking", "laundry", "AC", "heat included")',
      },
      unit_number: {
        type: Type.STRING,
        description: 'Unit number (only if user volunteers this information)',
      },
      furnished: {
        type: Type.BOOLEAN,
        description: 'Whether the unit is furnished',
      },
      parking: {
        type: Type.BOOLEAN,
        description: 'Whether parking is included',
      },
      property_type: {
        type: Type.STRING,
        description: 'Property type: "apartment", "house", or "room"',
      },
      gender_restriction: {
        type: Type.STRING,
        description: 'Gender restriction if any (e.g., "girls only", "any")',
      },
      roommate_info: {
        type: Type.STRING,
        description: 'Info about current roommates (e.g., "two senior girls")',
      },
      confirmed: {
        type: Type.BOOLEAN,
        description: 'false = preview mode (validate and show summary), true = publish the listing. Always include ALL fields when confirming.',
      },
    },
    required: ['address', 'bedrooms_total', 'bedrooms_available'],
  },
};

export const CRIBAI_TOOLS_BY_NAME: Record<ToolName, FunctionDeclaration> = {
  search_listings: searchListings,
  get_listing_detail: getListingDetail,
  compare_listings: compareListings,
  schedule_tour: scheduleTour,
  explain_lease_term: explainLeaseTerm,
  get_landlord_info: getLandlordInfo,
  get_saved_listings: getSavedListings,
  web_search: webSearch,
  get_reviews: getReviews,
  contact_pm: contactPm,
  get_neighborhood_info: getNeighborhoodInfo,
  create_sublease: createSublease,
};

export const CRIBAI_TOOLS: readonly FunctionDeclaration[] = Object.values(
  CRIBAI_TOOLS_BY_NAME,
);

export function getToolDeclarations(
  names?: readonly ToolName[],
): readonly FunctionDeclaration[] {
  if (!names || names.length === 0) {
    return CRIBAI_TOOLS;
  }

  return names.map((name) => CRIBAI_TOOLS_BY_NAME[name]);
}
