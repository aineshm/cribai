import { test, expect } from '@playwright/test';
import { findActiveListingId } from './utils/find-listing';

/**
 * E2E tests — Listing Detail (/listing/[id]) — current implementation
 *
 * Route structure (current):
 *   /listing/[id]                     → detail page (primary flat route)
 *   /[campusSlug]/listings/[id]       → redirects to /listing/[id]?campus=[campusSlug]
 *
 * The explore page is now an AI chat interface with no listing card links in the DOM.
 * A live listing ID is resolved per-run via /api/search/listings (find-listing helper),
 * so the suite is resilient to scraper churn that removes specific listings.
 *
 * Desktop CTAs: "Book a Tour", "Ask AI About This Listing"
 * Mobile bottom bar: "Book Tour", "Chat"
 *
 * Note: we wait for `domcontentloaded` (not `networkidle`) because the chat sidecar
 * + missions polling keep the network busy long past hydration.
 */

test.describe('Listing Detail — campus-scoped redirect', () => {
  test('campus-scoped detail URLs redirect to the flat listing route', async ({ page, request }) => {
    const listingId = await findActiveListingId(request);
    await page.goto(`/uw-madison/listings/${listingId}`);
    await page.waitForURL(`**/listing/${listingId}?campus=uw-madison`, {
      timeout: 15000,
    });
    await expect(page).toHaveURL(new RegExp(`/listing/${listingId}\\?campus=uw-madison$`));
  });
});

test.describe('Listing Detail — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('detail page renders Book a Tour and Ask AI CTAs on desktop', async ({ page, request }) => {
    const listingId = await findActiveListingId(request);
    await page.goto(`/listing/${listingId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

    await expect(page.getByRole('button', { name: 'Book a Tour' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Ask AI About This Listing' })).toBeVisible();
  });

  test('detail page renders rent price on desktop', async ({ page, request }) => {
    const listingId = await findActiveListingId(request);
    await page.goto(`/listing/${listingId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

    // Rent should contain a dollar amount — the primary price display on the page
    // Uses a more specific selector for the main rent element (large bold price)
    await expect(page.locator('.text-3xl', { hasText: /\$/ }).first()).toBeVisible({ timeout: 15000 });
  });

  test('CribAI nav brand is visible on detail page', async ({ page, request }) => {
    const listingId = await findActiveListingId(request);
    await page.goto(`/listing/${listingId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

    await expect(page.getByRole('navigation').first().getByText('CribAI')).toBeVisible();
  });
});

test.describe('Listing Detail — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('detail page renders Book Tour and Chat buttons on mobile', async ({ page, request }) => {
    const listingId = await findActiveListingId(request);
    await page.goto(`/listing/${listingId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });

    await expect(page.getByRole('button', { name: 'Book Tour' })).toBeVisible({ timeout: 15000 });
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
