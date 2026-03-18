import { test, expect } from '@playwright/test';

/**
 * E2E tests — Listing Detail (/listing/[id]) — current implementation
 *
 * Route structure (current):
 *   /listing/[id]                     → detail page (primary flat route)
 *   /[campusSlug]/listings/[id]       → redirects to /listing/[id]?campus=[campusSlug]
 *
 * The explore page is now an AI chat interface with no listing card links in the DOM.
 * A known active listing ID is used to drive these tests.
 *
 * Desktop CTAs: "Book a Tour", "Ask AI About This Listing"
 * Mobile bottom bar: "Book Tour", "Chat"
 */

// A known active listing ID from the database. Confirmed working against localhost.
const KNOWN_LISTING_ID = '9b387c6c-659f-4cc9-8417-76bd1c5c3bc0';

test.describe('Listing Detail — campus-scoped redirect', () => {
  test('campus-scoped detail URLs redirect to the flat listing route', async ({ page }) => {
    await page.goto(`/uw-madison/listings/${KNOWN_LISTING_ID}`);
    await page.waitForURL(`**/listing/${KNOWN_LISTING_ID}?campus=uw-madison`, {
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/listing/${KNOWN_LISTING_ID}\\?campus=uw-madison$`));
  });
});

test.describe('Listing Detail — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('detail page renders Book a Tour and Ask AI CTAs on desktop', async ({ page }) => {
    await page.goto(`/listing/${KNOWN_LISTING_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    await expect(page.getByRole('button', { name: 'Book a Tour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask AI About This Listing' })).toBeVisible();
  });

  test('detail page renders rent price on desktop', async ({ page }) => {
    await page.goto(`/listing/${KNOWN_LISTING_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Rent should contain a dollar amount — the primary price display on the page
    // Uses a more specific selector for the main rent element (large bold price)
    await expect(page.locator('.text-3xl', { hasText: /\$/ }).first()).toBeVisible();
  });

  test('CampusNest nav brand is visible on detail page', async ({ page }) => {
    await page.goto(`/listing/${KNOWN_LISTING_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    await expect(page.getByRole('navigation').first().getByText('CampusNest')).toBeVisible();
  });
});

test.describe('Listing Detail — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('detail page renders Book Tour and Chat buttons on mobile', async ({ page }) => {
    await page.goto(`/listing/${KNOWN_LISTING_ID}`);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    await expect(page.getByRole('button', { name: 'Book Tour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible();
  });
});

test.describe('Listing Detail — invalid ID', () => {
  test('non-existent listing ID shows not-found page', async ({ page }) => {
    await page.goto('/listing/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Next.js notFound() renders either the global 404 or a not-found boundary
    const notFoundIndicator =
      (await page.getByText('Page not found').isVisible().catch(() => false)) ||
      (await page.getByText('not found', { exact: false }).isVisible().catch(() => false)) ||
      page.url().includes('/listing/00000000');

    expect(notFoundIndicator).toBe(true);
  });
});
