import { vi } from 'vitest';
import type { ToolContext } from '../types';

interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
}

export function createMockQueryBuilder(resolvedData: unknown = [], error: unknown = null): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
  };

  // Each method returns the builder for chaining
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);
  builder.lte.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue({ data: resolvedData, error });
  builder.single.mockResolvedValue({
    data: Array.isArray(resolvedData) ? resolvedData[0] : resolvedData,
    error,
  });
  builder.insert.mockReturnValue(builder);

  return builder;
}

export function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    supabase: { from: vi.fn() } as unknown as ToolContext['supabase'],
    campusId: 'test-campus-id',
    campusSlug: 'uw-madison',
    userId: 'test-user-id',
    ...overrides,
  };
}

export const SAMPLE_LISTING_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  address: '123 Langdon St',
  rent_monthly: 1200,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 800,
  fairness_score: 7.5,
  true_cost_total: 1450,
  amenities: ['parking', 'laundry'],
  available_date: '2026-08-01',
  true_cost: {
    rent: 1200,
    utilities: 100,
    parking: 75,
    internet: 60,
    laundry: 0,
    renterInsurance: 15,
    moveInFees: 0,
    total: 1450,
  },
  fairness_data: {
    comparableCount: 8,
    percentile: 65,
    predictedRent: 1150,
    delta: 4.3,
  },
};

export const SAMPLE_LISTING_ROW_2 = {
  ...SAMPLE_LISTING_ROW,
  id: '22222222-2222-2222-2222-222222222222',
  address: '456 State St',
  rent_monthly: 1400,
  bedrooms: 3,
  fairness_score: 6,
  true_cost_total: 1650,
};
