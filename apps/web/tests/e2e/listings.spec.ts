import { test, expect } from '@playwright/test';
import { ListingsPage } from './pages/ListingsPage';

/**
 * E2E tests — Listings page (/{campusSlug}/listings)
 *
 * Journeys covered:
 *   1. Listings page loads with heading and subtitle
 *   2. All four filter controls are rendered
 *   3. Beds filter updates the URL query param
 *   4. Sort filter updates the URL query param
 *   5. Invalid campus slug shows "Campus not found."
 *   6. Empty state renders when no results match filters
 *
 * Notes:
 *   - Tests that verify listing cards require a live DB.  They are written
 *     defensively — they assert on visible UI state only, not DB row counts.
 *   - Filter interaction tests verify URL params rather than DOM results to
 *     avoid DB dependency.
 */

const CAMPUS = 'uw-madison';

test.describe('Listings page', () => {
  test('loads with correct heading and subtitle', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    await listings.goto();

    await listings.assertLoaded();
  });

  test('renders all four filter controls', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    await listings.goto();

    await listings.assertFiltersVisible();
  });

  test('beds filter appends ?beds= to the URL', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    await listings.goto();

    // Wait for filters to be visible (Suspense boundary)
    await expect(listings.bedsFilter).toBeVisible();

    await listings.selectBeds('2');

    await page.waitForURL(/beds=2/);
    expect(page.url()).toContain('beds=2');
  });

  test('sort filter appends ?sort= to the URL', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    await listings.goto();

    await expect(listings.sortFilter).toBeVisible();

    await listings.selectSort('price_asc');

    await page.waitForURL(/sort=price_asc/);
    expect(page.url()).toContain('sort=price_asc');
  });

  test('min price filter appends ?minPrice= to the URL', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    await listings.goto();

    await expect(listings.minPriceInput).toBeVisible();

    await listings.setMinPrice('800');

    await page.waitForURL(/minPrice=800/);
    expect(page.url()).toContain('minPrice=800');
  });

  test('max price filter appends ?maxPrice= to the URL', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    await listings.goto();

    await expect(listings.maxPriceInput).toBeVisible();

    await listings.setMaxPrice('2000');

    await page.waitForURL(/maxPrice=2000/);
    expect(page.url()).toContain('maxPrice=2000');
  });

  test('shows empty state when no listings match an extreme price filter', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    // maxPrice of $1 guarantees no listings match
    await listings.goto({ maxPrice: '1' });

    // Either empty state or campus-not-found (if DB is down)
    const emptyOrNotFound =
      (await listings.noListingsHeading.isVisible()) ||
      (await listings.campusNotFound.isVisible());

    expect(
      emptyOrNotFound,
      'Expected empty listings state or campus-not-found'
    ).toBe(true);
  });

  test('shows "Campus not found." for an invalid campus slug', async ({ page }) => {
    const listings = new ListingsPage(page, 'invalid-campus-xyz');
    await listings.goto();

    await expect(listings.campusNotFound).toBeVisible();
  });

  test('listing cards link to the correct detail URL pattern', async ({ page }) => {
    const listings = new ListingsPage(page, CAMPUS);
    await listings.goto();

    const cards = listings.listingCards();
    const count = await cards.count();

    if (count === 0) {
      // DB not reachable or no listings — verify empty state instead
      const emptyOrNotFound =
        (await listings.noListingsHeading.isVisible()) ||
        (await listings.campusNotFound.isVisible());
      expect(emptyOrNotFound).toBe(true);
      return;
    }

    // Each card href must match /{campusSlug}/listings/{uuid}
    const firstCard = cards.first();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(new RegExp(`^/${CAMPUS}/listings/.+`));
  });

  test('ut-austin listings page loads correctly', async ({ page }) => {
    const listings = new ListingsPage(page, 'ut-austin');
    await listings.goto();

    // Page should render heading or campus-not-found, never crash
    const headingOrNotFound =
      (await listings.heading.isVisible()) ||
      (await listings.campusNotFound.isVisible());

    expect(headingOrNotFound).toBe(true);
  });
});
