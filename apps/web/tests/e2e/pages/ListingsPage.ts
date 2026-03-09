import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the listings page (/{campusSlug}/listings).
 *
 * DOM notes (from apps/web/app/(campus)/[campusSlug]/listings/page.tsx
 * and components/listing-filters.tsx, listing-grid.tsx, listing-card.tsx):
 *
 * Heading: <h1> "Listings — {campus.name}"
 * Subtitle: <p> "Search and compare student housing..."
 *
 * Filters (ListingFilters component):
 *   - <select data-testid="beds-filter">  → beds filter
 *   - <input type="number" placeholder="Min price">
 *   - <input type="number" placeholder="Max price">
 *   - <select data-testid="sort-filter">  → sort filter
 *
 * Listing grid (ListingGrid):
 *   - Empty state: "No listings found" + "Try adjusting your filters..."
 *   - Cards: <a> links href="/{campusSlug}/listings/{id}"
 *     containing: address <h3>, rent <p>, bed/bath/sqft spans, fairness badge span
 *
 * Campus not found: <p className="text-gray-500">Campus not found.</p>
 */
export class ListingsPage {
  readonly page: Page;
  readonly campusSlug: string;

  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly bedsFilter: Locator;
  readonly minPriceInput: Locator;
  readonly maxPriceInput: Locator;
  readonly sortFilter: Locator;
  readonly noListingsHeading: Locator;
  readonly noListingsHint: Locator;
  readonly campusNotFound: Locator;

  constructor(page: Page, campusSlug: string) {
    this.page = page;
    this.campusSlug = campusSlug;

    this.heading = page.getByRole('heading', { level: 1 });
    this.subtitle = page.getByText(
      'Search and compare student housing with True Cost and Fairness Scores.'
    );
    this.bedsFilter = page.getByTestId('beds-filter');
    this.minPriceInput = page.getByPlaceholder('Min price');
    this.maxPriceInput = page.getByPlaceholder('Max price');
    this.sortFilter = page.getByTestId('sort-filter');
    this.noListingsHeading = page.getByText('No listings found');
    this.noListingsHint = page.getByText('Try adjusting your filters or check back later.');
    this.campusNotFound = page.getByText('Campus not found.');
  }

  async goto(searchParams?: Record<string, string>) {
    const base = `/${this.campusSlug}/listings`;
    if (searchParams && Object.keys(searchParams).length > 0) {
      const qs = new URLSearchParams(searchParams).toString();
      await this.page.goto(`${base}?${qs}`);
    } else {
      await this.page.goto(base);
    }
  }

  /**
   * All listing card links on the page.
   * Cards are <a> elements linking to /{campusSlug}/listings/{id}.
   */
  listingCards(): Locator {
    return this.page.locator(`a[href^="/${this.campusSlug}/listings/"]`);
  }

  /**
   * Returns the card link for a specific listing id.
   */
  listingCard(id: string): Locator {
    return this.page.locator(`a[href="/${this.campusSlug}/listings/${id}"]`);
  }

  async assertLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.heading).toContainText('Listings');
    await expect(this.subtitle).toBeVisible();
  }

  async assertFiltersVisible() {
    await expect(this.bedsFilter).toBeVisible();
    await expect(this.minPriceInput).toBeVisible();
    await expect(this.maxPriceInput).toBeVisible();
    await expect(this.sortFilter).toBeVisible();
  }

  async selectBeds(value: string) {
    await this.bedsFilter.selectOption(value);
  }

  async setMinPrice(price: string) {
    await this.minPriceInput.fill(price);
    await this.minPriceInput.press('Tab');
  }

  async setMaxPrice(price: string) {
    await this.maxPriceInput.fill(price);
    await this.maxPriceInput.press('Tab');
  }

  async selectSort(value: string) {
    await this.sortFilter.selectOption(value);
  }

  async waitForFilterNavigation() {
    const currentUrl = this.page.url();
    await this.page.waitForURL((url) =>
      url.pathname.includes('listings') && url.href !== currentUrl,
    );
  }

  async assertEmptyState() {
    await expect(this.noListingsHeading).toBeVisible();
    await expect(this.noListingsHint).toBeVisible();
  }

  async assertListingCardsExist(minCount = 1) {
    await expect.poll(async () => {
      return await this.listingCards().count();
    }).toBeGreaterThanOrEqual(minCount);
  }
}
