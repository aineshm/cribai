import { Type, type FunctionDeclaration } from '@google/genai';

const searchListings: FunctionDeclaration = {
  name: 'search_listings',
  description:
    'Search for student housing listings near campus. Use this whenever the user asks about available apartments, pricing, or wants to find housing. Supports semantic search for qualitative preferences like "quiet place with natural light".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      semantic_query: {
        type: Type.STRING,
        description:
          'Natural language description of what the user wants (e.g., "quiet place near campus with natural light"). Set this when the user describes qualitative preferences beyond just beds/price.',
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
    'Schedule a tour for a listing. Collect the student name, email, and preferred dates before calling this.',
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
    },
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

export const CRIBAI_TOOLS: readonly FunctionDeclaration[] = [
  searchListings,
  getListingDetail,
  compareListings,
  scheduleTour,
  explainLeaseTerm,
  getLandlordInfo,
  getSavedListings,
];
