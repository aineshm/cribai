import { describe, it, expect } from 'vitest';
import { listingSchema, listingSubmissionSchema, trueCostSchema, fairnessDataSchema } from '../listing';
import { campusConfigSchema } from '../campus';
import { profileFormSchema, verificationStatusSchema, subscriptionTierSchema } from '../profile';
import { tourRequestSchema, tourRequestInputSchema } from '../tour';
import { notificationSchema, priceChangePayloadSchema } from '../notification';
import { landlordReviewSchema } from '../landlord';
import { aiQueryLogSchema } from '../ai';
import { pageIndexNodeSchema, pageindexTreeSchema } from '../pageindex';
import {
  chatBlockSchema,
  conversationSchema,
} from '../chat';

// ─── Listing schemas ──────────────────────────────────────────

describe('trueCostSchema', () => {
  it('accepts valid true cost data', () => {
    const data = { rent: 1200, utilities: 100, parking: 75, internet: 60, laundry: 40, renterInsurance: 15, moveInFees: 0, total: 1490 };
    expect(trueCostSchema.parse(data)).toEqual(data);
  });

  it('rejects missing required fields', () => {
    expect(() => trueCostSchema.parse({ rent: 1200 })).toThrow();
  });
});

describe('fairnessDataSchema', () => {
  it('accepts valid fairness data', () => {
    const data = { comparableCount: 8, percentile: 65, predictedRent: 1150, delta: 4.3 };
    expect(fairnessDataSchema.parse(data)).toEqual(data);
  });

  it('accepts optional breakdown field', () => {
    const data = { comparableCount: 8, percentile: 65, predictedRent: 1150, delta: 4.3, breakdown: { size: 0.5 } };
    const result = fairnessDataSchema.parse(data);
    expect(result.breakdown).toEqual({ size: 0.5 });
  });
});

describe('listingSchema', () => {
  const validListing = {
    id: '11111111-1111-1111-1111-111111111111',
    campusId: '22222222-2222-2222-2222-222222222222',
    externalId: 'ext-123',
    source: 'apartments.com',
    rawData: {},
    address: '123 Langdon St',
    rentMonthly: 1200,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 800,
    availableDate: '2026-08-01',
  };

  it('accepts valid listing with minimal fields', () => {
    const result = listingSchema.parse(validListing);
    expect(result.id).toBe(validListing.id);
    expect(result.amenities).toEqual([]);
    expect(result.photoUrls).toEqual([]);
    expect(result.isActive).toBe(true);
  });

  it('rejects invalid UUID for id', () => {
    expect(() => listingSchema.parse({ ...validListing, id: 'not-a-uuid' })).toThrow();
  });

  it('accepts null for nullable fields', () => {
    const result = listingSchema.parse({ ...validListing, rentMonthly: null, bedrooms: null });
    expect(result.rentMonthly).toBeNull();
    expect(result.bedrooms).toBeNull();
  });

  it('clamps fairnessScore between 1 and 10', () => {
    expect(() => listingSchema.parse({ ...validListing, fairnessScore: 0 })).toThrow();
    expect(() => listingSchema.parse({ ...validListing, fairnessScore: 11 })).toThrow();
    const result = listingSchema.parse({ ...validListing, fairnessScore: 5 });
    expect(result.fairnessScore).toBe(5);
  });

  it('defaults isActive to true', () => {
    const result = listingSchema.parse(validListing);
    expect(result.isActive).toBe(true);
  });
});

describe('listingSubmissionSchema', () => {
  const validSubmission = {
    address: '123 Langdon St',
    rent_monthly: 1200,
    bedrooms: 2,
    contact_email: 'test@wisc.edu',
  };

  it('accepts valid submission', () => {
    const result = listingSubmissionSchema.parse(validSubmission);
    expect(result.address).toBe('123 Langdon St');
  });

  it('rejects address shorter than 5 chars', () => {
    expect(() => listingSubmissionSchema.parse({ ...validSubmission, address: 'Hi' })).toThrow();
  });

  it('rejects non-positive rent', () => {
    expect(() => listingSubmissionSchema.parse({ ...validSubmission, rent_monthly: 0 })).toThrow();
    expect(() => listingSubmissionSchema.parse({ ...validSubmission, rent_monthly: -100 })).toThrow();
  });

  it('rejects rent above 10000', () => {
    expect(() => listingSubmissionSchema.parse({ ...validSubmission, rent_monthly: 10001 })).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => listingSubmissionSchema.parse({ ...validSubmission, contact_email: 'not-email' })).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() => listingSubmissionSchema.parse({ ...validSubmission, available_date: '08/01/2026' })).toThrow();
  });

  it('accepts valid YYYY-MM-DD date', () => {
    const result = listingSubmissionSchema.parse({ ...validSubmission, available_date: '2026-08-01' });
    expect(result.available_date).toBe('2026-08-01');
  });

  it('allows empty string for source_url', () => {
    const result = listingSubmissionSchema.parse({ ...validSubmission, source_url: '' });
    expect(result.source_url).toBe('');
  });

  it('rejects invalid URL for source_url', () => {
    expect(() => listingSubmissionSchema.parse({ ...validSubmission, source_url: 'not-a-url' })).toThrow();
  });
});

// ─── Campus schema ────────────────────────────────────────────

describe('campusConfigSchema', () => {
  const validCampus = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'uw-madison',
    name: 'UW-Madison',
    universityName: 'University of Wisconsin-Madison',
    eduDomains: ['wisc.edu'],
    latitude: 43.0731,
    longitude: -89.4012,
  };

  it('accepts valid campus config with defaults', () => {
    const result = campusConfigSchema.parse(validCampus);
    expect(result.timezone).toBe('America/Chicago');
    expect(result.scrapeCron).toBe('0 2 * * *');
    expect(result.scrapeRadiusKm).toBe(5);
    expect(result.isPublic).toBe(false);
  });

  it('rejects empty slug', () => {
    expect(() => campusConfigSchema.parse({ ...validCampus, slug: '' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => campusConfigSchema.parse({ ...validCampus, name: '' })).toThrow();
  });
});

// ─── Profile schemas ──────────────────────────────────────────

describe('verificationStatusSchema', () => {
  it('accepts valid statuses', () => {
    for (const status of ['unverified', 'pending', 'verified', 'rejected']) {
      expect(verificationStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects invalid status', () => {
    expect(() => verificationStatusSchema.parse('approved')).toThrow();
  });
});

describe('subscriptionTierSchema', () => {
  it('accepts valid tiers', () => {
    for (const tier of ['free', 'pro', 'premium']) {
      expect(subscriptionTierSchema.parse(tier)).toBe(tier);
    }
  });

  it('rejects invalid tier', () => {
    expect(() => subscriptionTierSchema.parse('enterprise')).toThrow();
  });
});

describe('profileFormSchema', () => {
  it('accepts valid form data', () => {
    const data = { displayName: 'Test User', graduationYear: 2027, major: 'CS' };
    expect(profileFormSchema.parse(data)).toEqual(data);
  });

  it('rejects empty display name', () => {
    expect(() => profileFormSchema.parse({ displayName: '' })).toThrow();
  });

  it('rejects graduation year before 2020', () => {
    expect(() => profileFormSchema.parse({ displayName: 'Test', graduationYear: 2019 })).toThrow();
  });

  it('rejects graduation year after 2035', () => {
    expect(() => profileFormSchema.parse({ displayName: 'Test', graduationYear: 2036 })).toThrow();
  });
});

// ─── Tour schemas ─────────────────────────────────────────────

describe('tourRequestInputSchema', () => {
  const validInput = {
    listingId: '11111111-1111-1111-1111-111111111111',
    studentName: 'Emma Chen',
    studentEmail: 'emma@wisc.edu',
    preferredDates: ['2026-08-15'],
  };

  it('accepts valid tour request input', () => {
    const result = tourRequestInputSchema.parse(validInput);
    expect(result.listingId).toBe(validInput.listingId);
  });

  it('requires at least one preferred date', () => {
    expect(() => tourRequestInputSchema.parse({ ...validInput, preferredDates: [] })).toThrow();
  });

  it('rejects invalid date format in preferredDates', () => {
    expect(() => tourRequestInputSchema.parse({ ...validInput, preferredDates: ['Aug 15'] })).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => tourRequestInputSchema.parse({ ...validInput, studentEmail: 'not-email' })).toThrow();
  });

  it('rejects empty student name', () => {
    expect(() => tourRequestInputSchema.parse({ ...validInput, studentName: '' })).toThrow();
  });
});

describe('tourRequestSchema', () => {
  it('defaults status to pending', () => {
    const data = {
      id: '11111111-1111-1111-1111-111111111111',
      listingId: '22222222-2222-2222-2222-222222222222',
      campusId: '33333333-3333-3333-3333-333333333333',
      userId: '44444444-4444-4444-4444-444444444444',
      studentName: 'Emma Chen',
      studentEmail: 'emma@wisc.edu',
    };
    const result = tourRequestSchema.parse(data);
    expect(result.status).toBe('pending');
    expect(result.preferredDates).toEqual([]);
  });
});

// ─── Notification schemas ─────────────────────────────────────

describe('notificationSchema', () => {
  it('accepts valid notification', () => {
    const data = {
      id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-2222-2222-222222222222',
      type: 'price_change',
      listing_id: '33333333-3333-3333-3333-333333333333',
      payload: { old_price: 1200, new_price: 1100 },
      is_read: false,
      created_at: '2026-03-10T00:00:00Z',
    };
    expect(notificationSchema.parse(data).type).toBe('price_change');
  });

  it('rejects invalid notification type', () => {
    expect(() => notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      user_id: '22222222-2222-2222-2222-222222222222',
      type: 'invalid_type',
      listing_id: null,
      payload: {},
      is_read: false,
      created_at: '2026-03-10T00:00:00Z',
    })).toThrow();
  });
});

describe('priceChangePayloadSchema', () => {
  it('accepts valid price change payload', () => {
    const data = { old_price: 1200, new_price: 1100, listing_address: '123 Langdon St' };
    expect(priceChangePayloadSchema.parse(data)).toEqual(data);
  });
});

// ─── Landlord schemas ─────────────────────────────────────────

describe('landlordReviewSchema', () => {
  const validReview = {
    id: '11111111-1111-1111-1111-111111111111',
    landlordId: '22222222-2222-2222-2222-222222222222',
    userId: '33333333-3333-3333-3333-333333333333',
    listingId: null,
    ratings: { responsiveness: 4, maintenance: 3, fairness: 5, overall: 4 },
    reviewText: 'Great landlord',
  };

  it('accepts valid review', () => {
    const result = landlordReviewSchema.parse(validReview);
    expect(result.ratings.overall).toBe(4);
    expect(result.leaseVerified).toBe(false);
  });

  it('rejects ratings outside 1-5 range', () => {
    expect(() => landlordReviewSchema.parse({
      ...validReview,
      ratings: { responsiveness: 0, maintenance: 3, fairness: 5, overall: 4 },
    })).toThrow();

    expect(() => landlordReviewSchema.parse({
      ...validReview,
      ratings: { responsiveness: 4, maintenance: 6, fairness: 5, overall: 4 },
    })).toThrow();
  });
});

// ─── Chat block schemas ───────────────────────────────────────

describe('chatBlockSchema (discriminated union)', () => {
  it('parses text block', () => {
    const block = { type: 'text', content: 'Hello!' };
    const result = chatBlockSchema.parse(block);
    expect(result.type).toBe('text');
  });

  it('parses listing_card block', () => {
    const block = {
      type: 'listing_card',
      listings: [{
        id: '11111111-1111-1111-1111-111111111111',
        address: '123 Langdon St',
        rentMonthly: 1200,
        bedrooms: 2,
        bathrooms: 1,
        sqft: 800,
        fairnessScore: 7.5,
        trueCostTotal: 1450,
      }],
    };
    const result = chatBlockSchema.parse(block);
    expect(result.type).toBe('listing_card');
  });

  it('parses tour_confirmation block', () => {
    const block = {
      type: 'tour_confirmation',
      tourRequestId: '11111111-1111-1111-1111-111111111111',
      listingAddress: '123 Langdon St',
      status: 'pending',
    };
    const result = chatBlockSchema.parse(block);
    expect(result.type).toBe('tour_confirmation');
  });

  it('parses legal_disclaimer block', () => {
    const block = {
      type: 'legal_disclaimer',
      term: 'security deposit',
      explanation: 'A refundable payment held by the landlord.',
      disclaimer: 'This is not legal advice.',
    };
    const result = chatBlockSchema.parse(block);
    expect(result.type).toBe('legal_disclaimer');
  });

  it('parses map block', () => {
    const block = {
      type: 'map',
      listings: [{
        id: '11111111-1111-1111-1111-111111111111',
        address: '123 Langdon St',
        rentMonthly: 1200,
        bedrooms: 2,
        bathrooms: 1,
        sqft: null,
        fairnessScore: null,
        trueCostTotal: null,
        latitude: 43.0731,
        longitude: -89.4012,
        photoUrl: null,
      }],
      center: { lat: 43.0731, lng: -89.4012 },
      zoom: 14,
    };
    const result = chatBlockSchema.parse(block);
    expect(result.type).toBe('map');
  });

  it('parses web_result block', () => {
    const block = {
      type: 'web_result',
      results: [{
        title: 'Test Result',
        url: 'https://example.com',
        snippet: 'A test snippet',
        listingId: null,
      }],
    };
    const result = chatBlockSchema.parse(block);
    expect(result.type).toBe('web_result');
  });

  it('rejects unknown block type', () => {
    expect(() => chatBlockSchema.parse({ type: 'unknown', data: {} })).toThrow();
  });
});

// ─── Conversation schemas ─────────────────────────────────────

describe('conversationSchema', () => {
  it('accepts valid conversation', () => {
    const data = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'Finding apartments',
      lastMessagePreview: 'Looking for 2BR near campus',
      createdAt: '2026-03-10T00:00:00Z',
      updatedAt: '2026-03-10T12:00:00Z',
    };
    expect(conversationSchema.parse(data).title).toBe('Finding apartments');
  });

  it('accepts null lastMessagePreview', () => {
    const data = {
      id: '11111111-1111-1111-1111-111111111111',
      title: 'New conversation',
      lastMessagePreview: null,
      createdAt: '2026-03-10T00:00:00Z',
      updatedAt: '2026-03-10T00:00:00Z',
    };
    expect(conversationSchema.parse(data).lastMessagePreview).toBeNull();
  });
});

// ─── PageIndex schemas ────────────────────────────────────────

describe('pageIndexNodeSchema', () => {
  it('accepts a leaf node', () => {
    const node = { label: 'Budget', summary: '5 listings', contentRef: '{"ids":[]}', children: [] };
    expect(pageIndexNodeSchema.parse(node).label).toBe('Budget');
  });

  it('accepts a nested tree', () => {
    const tree = {
      label: 'root',
      summary: 'All listings',
      contentRef: null,
      children: [{
        label: '2-Bedroom',
        summary: '10 listings',
        contentRef: null,
        children: [{
          label: 'Budget',
          summary: '3 listings',
          contentRef: '{"ids":[]}',
          children: [],
        }],
      }],
    };
    const result = pageIndexNodeSchema.parse(tree);
    expect(result.children[0]!.children[0]!.label).toBe('Budget');
  });
});

describe('pageindexTreeSchema', () => {
  it('accepts valid page index tree', () => {
    const data = {
      id: '11111111-1111-1111-1111-111111111111',
      campusId: '22222222-2222-2222-2222-222222222222',
      entityType: 'listings',
      tree: { label: 'root', summary: 'All listings', contentRef: null, children: [] },
    };
    const result = pageindexTreeSchema.parse(data);
    expect(result.leafCount).toBe(0);
  });
});

// ─── AI Query Log schema ──────────────────────────────────────

describe('aiQueryLogSchema', () => {
  it('accepts valid query log', () => {
    const data = {
      id: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      queryText: 'Find me 2BR apartments',
      tokensUsed: 1500,
    };
    expect(aiQueryLogSchema.parse(data).queryText).toBe('Find me 2BR apartments');
  });

  it('accepts null tokensUsed', () => {
    const data = {
      id: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      queryText: 'test',
      tokensUsed: null,
    };
    expect(aiQueryLogSchema.parse(data).tokensUsed).toBeNull();
  });
});
