# Testing Patterns

**Analysis Date:** 2026-03-05

## Test Framework

**Unit/Integration Runner:**
- Vitest 2.1+ (per-package configuration)
- Config files:
  - `packages/utils/vitest.config.ts`
  - `packages/ai/vitest.config.ts`
  - `services/scraper/vitest.config.ts`

**E2E Runner:**
- Playwright (latest, from `apps/web/package.json` devDependencies inferred via peer)
- Config: `apps/web/playwright.config.ts`

**Assertion Library:**
- Vitest built-in `expect` (Jest-compatible API)
- Playwright built-in `expect` for E2E

**Run Commands:**
```bash
pnpm test                    # Run all tests via Turborepo
pnpm --filter @campusnest/utils test   # Run utils tests only
pnpm --filter @campusnest/ai test      # Run AI tests only
pnpm --filter @campusnest/scraper test # Run scraper tests only
pnpm --filter @campusnest/utils test:watch  # Watch mode (utils only)
# E2E (from apps/web/)
npx playwright test          # Run all E2E tests
npx playwright test --project=chromium  # Single browser
```

## Vitest Configuration

All three vitest configs share the same minimal setup:
```typescript
// packages/utils/vitest.config.ts (identical across packages)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,       // Explicit imports required
    environment: 'node',  // No jsdom
  },
});
```

**Key settings:**
- `globals: false` -- always import `describe`, `it`, `expect`, `vi` from `'vitest'`
- `environment: 'node'` -- no browser/jsdom environment
- No coverage configuration

## Test File Organization

**Location:** Dedicated `__tests__/` directories adjacent to source (NOT co-located with source files):
```
packages/utils/src/
  __tests__/
    cost-calculator.test.ts
    fairness-scorer.test.ts
    enhanced-fairness.test.ts
    comparable-selector.test.ts
    price-model.test.ts
  cost-calculator.ts
  fairness-scorer.ts
  comparable-selector.ts
  price-model.ts

packages/ai/src/tools/
  __tests__/
    helpers.ts              # Shared test helpers
    search-listings.test.ts
    get-listing-detail.test.ts
    compare-listings.test.ts
    schedule-tour.test.ts
    explain-lease-term.test.ts
    executor.test.ts
  handlers/
    search-listings.ts
    ...

services/scraper/
  __tests__/
    normalizer.test.ts
  normalizer.ts
```

**Naming:**
- Unit tests: `{module-name}.test.ts` (match source file name)
- E2E specs: `{feature}.spec.ts` (use `.spec.ts` extension)
- Test helpers: plain `.ts` files in `__tests__/` (e.g., `helpers.ts`)

## Test Structure

**Suite Organization:**
```typescript
// Always explicit imports (globals: false)
import { describe, it, expect } from 'vitest';
import { calculateTrueCost } from '../cost-calculator';

describe('calculateTrueCost', () => {
  it('returns base rent + all defaults when nothing included', () => {
    const result = calculateTrueCost({ rentMonthly: 1200 });
    expect(result.rent).toBe(1200);
    expect(result.total).toBe(1540);
  });

  it('zeroes utilities when included', () => {
    const result = calculateTrueCost({ rentMonthly: 1200, utilitiesIncluded: true });
    expect(result.utilities).toBe(0);
  });
});
```

**Conventions:**
- Top-level `describe` matches the function/module name
- Each `it` block tests one behavior with a descriptive name
- No nested `describe` blocks (flat structure)
- Test names use present tense: "returns...", "zeroes...", "applies...", "throws..."
- No setup/teardown (`beforeEach`/`afterEach`) -- each test is self-contained
- Inline test data construction (no shared fixtures files)

## Factory Functions

**Pattern:** Helper functions prefixed with `make*` or `create*` for test data:

```typescript
// packages/utils/src/__tests__/fairness-scorer.test.ts
const makeComparable = (rent: number) => ({
  rentMonthly: rent,
  bedrooms: 1,
  sqft: 500,
  amenities: [] as string[],
});

// services/scraper/__tests__/normalizer.test.ts
function makeRaw(overrides: Partial<RawListing> = {}): RawListing {
  return {
    externalId: 'ext-123',
    source: 'apartments.com',
    address: '123 Main St',
    rentMonthly: 1200,
    // ... defaults
    ...overrides,
  };
}

// packages/ai/src/tools/__tests__/helpers.ts
function makeCandidate(overrides: Partial<ComparableCandidate> & { id: string }): ComparableCandidate {
  return {
    rentMonthly: 1000,
    bedrooms: 2,
    // ... defaults
    ...overrides,
  };
}
```

**Guidelines:**
- Provide sensible defaults, allow overrides via spread
- Use `Partial<T>` for override parameter
- Define factory functions at the top of the test file or in a shared `helpers.ts`

## Mocking

**Framework:** Vitest built-in `vi.fn()` and `vi.mocked()`

**Supabase Query Builder Mock Pattern:**
```typescript
// packages/ai/src/tools/__tests__/helpers.ts
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
  // ... all chainable methods
  builder.limit.mockResolvedValue({ data: resolvedData, error });
  builder.single.mockResolvedValue({
    data: Array.isArray(resolvedData) ? resolvedData[0] : resolvedData,
    error,
  });

  return builder;
}
```

**ToolContext Mock Pattern:**
```typescript
export function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    supabase: { from: vi.fn() } as unknown as ToolContext['supabase'],
    campusId: 'test-campus-id',
    campusSlug: 'uw-madison',
    userId: 'test-user-id',
    ...overrides,
  };
}
```

**Usage in tests:**
```typescript
it('applies bedroom filter', async () => {
  const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
  const context = createMockContext();
  vi.mocked(context.supabase.from).mockReturnValue(builder as never);

  await searchListings({ bedrooms: 2 }, context);

  expect(builder.eq).toHaveBeenCalledWith('bedrooms', 2);
});
```

**What to Mock:**
- Supabase client (query builder chain)
- External API calls (not directly tested yet)

**What NOT to Mock:**
- Pure computation functions (`calculateTrueCost`, `calculateFairnessScore`)
- Zod validation (tested implicitly via real `parse()` calls)
- Knowledge base lookups (in-memory, no side effects)

## Sample Test Data

**Shared constants for Supabase row shapes:**
```typescript
// packages/ai/src/tools/__tests__/helpers.ts
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
  true_cost: { rent: 1200, utilities: 100, parking: 75, internet: 60, laundry: 0, renterInsurance: 15, moveInFees: 0, total: 1450 },
  fairness_data: { comparableCount: 8, percentile: 65, predictedRent: 1150, delta: 4.3 },
};

export const SAMPLE_LISTING_ROW_2 = {
  ...SAMPLE_LISTING_ROW,
  id: '22222222-2222-2222-2222-222222222222',
  address: '456 State St',
  rent_monthly: 1400,
  // ... overrides
};
```

**Location:** Shared helpers live in `__tests__/helpers.ts` alongside test files.

## E2E Testing

**Framework:** Playwright

**Configuration (`apps/web/playwright.config.ts`):**
- Test directory: `./tests/e2e`
- Fully parallel execution
- Retries: 2 in CI, 0 locally
- Workers: 1 in CI, auto locally
- Reporters: HTML + JUnit + list
- Trace, screenshot, video on failure/retry
- Base URL: `http://localhost:3000` (configurable via `BASE_URL` env)

**Browser coverage:**
- Chromium (Desktop Chrome)
- Firefox (Desktop Firefox)
- WebKit (Desktop Safari)
- Mobile Chrome (Pixel 5)

**Page Object Model:**
E2E tests use Page Object classes in `apps/web/tests/e2e/pages/`:

```typescript
// apps/web/tests/e2e/pages/HomePage.ts
export class HomePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'CampusNest', level: 1 });
    this.subtitle = page.getByText('Student housing intelligence');
    this.signInLink = page.getByRole('link', { name: 'Sign in' });
  }

  async goto() { await this.page.goto('/'); }
  async assertLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.subtitle).toBeVisible();
  }
  campusCard(slug: string): Locator {
    return this.page.locator(`a[href="/${slug}/listings"]`);
  }
}
```

**Page Objects available:**
- `HomePage.ts` - Homepage at `/`
- `LoginPage.ts` - Login page at `/login`
- `ListingsPage.ts` - Campus listings page

**E2E Test Conventions:**
- Use `test.describe` for grouping related tests
- Use Page Object methods for all interactions
- Handle DB-dependent tests gracefully: check visibility first, `test.skip()` if data unavailable
- JSDoc block comments describe journey coverage and known limitations
- Prefer role-based and text-based selectors over CSS selectors

```typescript
// apps/web/tests/e2e/homepage.spec.ts
test('campus card for uw-madison navigates to listings page', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();

  const card = home.campusCard('uw-madison');
  const isVisible = await card.isVisible();
  if (!isVisible) {
    test.skip(true, 'uw-madison campus card not rendered -- DB may be unavailable');
    return;
  }

  await home.clickCampusCard('uw-madison');
  await page.waitForURL('/uw-madison/listings');
  await expect(page).toHaveURL('/uw-madison/listings');
});
```

## Error Testing

**Thrown error assertions:**
```typescript
it('throws on invalid input', async () => {
  const context = createMockContext();
  await expect(searchListings({ bedrooms: 'invalid' }, context)).rejects.toThrow();
});

it('throws for unknown tool', async () => {
  const context = createMockContext();
  await expect(executeTool('nonexistent_tool', {}, context)).rejects.toThrow('Unknown tool');
});

it('throws on empty term', async () => {
  await expect(explainLeaseTerm({ term: '' })).rejects.toThrow();
});
```

## Async Testing

**Pattern:** Use `async`/`await` directly -- no special async utilities needed:
```typescript
it('returns listings matching basic query', async () => {
  const builder = createMockQueryBuilder([SAMPLE_LISTING_ROW]);
  const context = createMockContext();
  vi.mocked(context.supabase.from).mockReturnValue(builder as never);

  const result = await searchListings({}, context);

  expect(result.clientBlock.type).toBe('listing_card');
});
```

## Type Narrowing in Tests

**Pattern:** After checking discriminated union type, narrow with `if` guard:
```typescript
expect(result.clientBlock.type).toBe('listing_card');
if (result.clientBlock.type === 'listing_card') {
  expect(result.clientBlock.listings).toHaveLength(2);
  expect(result.clientBlock.listings[0]!.address).toBe('123 Langdon St');
}
```
This pattern appears consistently in AI tool handler tests due to `ChatBlock` discriminated union.

## Coverage

**Requirements:** No formal coverage thresholds configured in vitest or CI.

**Current test counts (approximate):**
- `packages/utils/`: 5 test files, ~34 tests (cost-calculator, fairness-scorer, enhanced-fairness, comparable-selector, price-model)
- `packages/ai/`: 6 test files, ~30+ tests (all 6 tool handlers + executor)
- `services/scraper/`: 1 test file, ~12 tests (normalizer)
- `apps/web/`: 3 E2E spec files (homepage, auth, listings)

**Gaps:**
- No unit tests for `packages/supabase/` (client/server wrappers)
- No unit tests for `packages/types/` (schema-only, arguably not needed)
- No unit tests for React components (`apps/web/components/`)
- No unit tests for `packages/ai/src/cribai.ts` (main AI engine class)
- No unit tests for `packages/ai/src/pageindex-builder.ts` or `pageindex-traverser.ts`
- No tests for API routes (`apps/web/app/api/`)
- No tests for middleware (`apps/web/middleware.ts`)

## Test Types Summary

**Unit Tests:**
- Pure function testing with direct assertions
- Located in `packages/utils/src/__tests__/` and `packages/ai/src/tools/__tests__/`
- Mock only external dependencies (Supabase)
- No test doubles for business logic

**Integration Tests:**
- Tool handler tests that exercise Zod validation + Supabase query building + response formatting
- Located in `packages/ai/src/tools/__tests__/`
- Use mock Supabase query builders to verify correct query construction

**E2E Tests:**
- Playwright with Page Object Model
- Located in `apps/web/tests/e2e/`
- Test user journeys: homepage navigation, auth flow, listing browsing
- Gracefully handle missing database (conditional `test.skip`)

---

*Testing analysis: 2026-03-05*
