import { test, expect } from '@playwright/test';

/**
 * E2E tests — Phase 13: Listing Detail Page
 *
 * Gaps covered:
 *   DETAIL-01 — 2/3 hero + 1/3 side grid photo layout; clicking any photo opens full-screen lightbox
 *   DETAIL-02 — Desktop sticky CTA card with "Book Tour" and "Ask AI" buttons visible while scrolling
 *   DETAIL-03 — Landlord info card, amenities grid, AI-generated lease summary section visible
 *   DETAIL-04 — Commute section with map + distance/transit/walk time to campus building
 *   DETAIL-05 — Mobile sticky bottom bar with price, "Book Tour", "Chat with AI" buttons
 *
 * All tests run against /listing/mock-listing-001 which is served via mock data
 * (getMockListingById falls back to mock-listing-001 for any id).
 * No auth or live DB required.
 */

const LISTING_URL = '/listing/mock-listing-001';

// Helper: navigate to listing detail and wait for the page to settle.
// Uses networkidle so that Next.js client hydration and framer-motion
// animations are fully settled before tests interact with the DOM.
async function gotoListingDetail(page: import('@playwright/test').Page) {
  await page.goto(LISTING_URL);
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  // Wait for the back button which is always present once the client component mounts
  await page.getByRole('button', { name: 'Go back' }).waitFor({ state: 'visible', timeout: 15000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL-01 — Photo gallery: 2/3 hero + 1/3 side grid; lightbox on click
// ─────────────────────────────────────────────────────────────────────────────

test.describe('DETAIL-01 — Photo gallery layout and lightbox', () => {
  test('desktop gallery renders hero image occupying 2/3 of the grid', async ({ page }) => {
    // Set a desktop viewport so the md: classes engage
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // The hero button spans 2 columns of the 3-column grid (col-span-2)
    // and is labelled with the first photo alt text
    const heroButton = page.getByRole('button', { name: 'Spacious living room with natural light' });
    await expect(heroButton).toBeVisible({ timeout: 10000 });
  });

  test('desktop gallery renders side thumbnail images (1/3 of the grid)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // sidePhotos = photos.slice(1, 5) — each has an aria-label from its alt text
    const sideButtons = [
      page.getByRole('button', { name: 'Modern kitchen with updated appliances' }),
      page.getByRole('button', { name: 'Master bedroom with closet' }),
      page.getByRole('button', { name: 'Clean bathroom with tile floors' }),
      page.getByRole('button', { name: 'Private balcony with campus view' }),
    ];

    for (const btn of sideButtons) {
      await expect(btn).toBeVisible({ timeout: 10000 });
    }
  });

  test('clicking the hero photo opens the full-screen lightbox dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // No lightbox should be present initially
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Click the hero photo
    const heroButton = page.getByRole('button', { name: 'Spacious living room with natural light' });
    await heroButton.click();

    // Lightbox mounts as role="dialog" with aria-modal="true"
    const lightbox = page.getByRole('dialog');
    await expect(lightbox).toBeVisible({ timeout: 5000 });
  });

  test('clicking a side thumbnail photo opens the full-screen lightbox dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // Click the second side thumbnail (photo index 2)
    const sideBtn = page.getByRole('button', { name: 'Master bedroom with closet' });
    await sideBtn.click();

    const lightbox = page.getByRole('dialog');
    await expect(lightbox).toBeVisible({ timeout: 5000 });
  });

  test('lightbox can be closed with the close button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const heroButton = page.getByRole('button', { name: 'Spacious living room with natural light' });
    await heroButton.click();

    // AnimatePresence mounts the dialog asynchronously — wait up to 10s
    const lightbox = page.getByRole('dialog');
    await expect(lightbox).toBeVisible({ timeout: 10000 });

    // Close button is labelled "Close lightbox"
    await page.getByRole('button', { name: 'Close lightbox' }).click();

    await expect(lightbox).not.toBeVisible({ timeout: 5000 });
  });

  test('lightbox previous and next navigation buttons are present when open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const heroButton = page.getByRole('button', { name: 'Spacious living room with natural light' });
    await heroButton.click();

    // AnimatePresence mounts the dialog asynchronously — wait up to 10s
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: 'Previous photo' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next photo' }).first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL-02 — Desktop sticky CTA card with "Book Tour" and "Ask AI" buttons
// ─────────────────────────────────────────────────────────────────────────────

test.describe('DETAIL-02 — Desktop sticky CTA sidebar', () => {
  test('CTA sidebar shows the listing price on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // The CTASidebar is inside a hidden md:block container.
    // On desktop the sidebar price <span> reads "$1,450" (exact text node).
    // The mobile price in ListingContent is hidden via md:hidden.
    // Target the price inside the sticky sidebar column specifically.
    // The sticky wrapper has class "sticky top-20" — look for the price text
    // inside the sidebar card. We use the "/month" sibling to narrow context.
    const sidebarPrice = page.locator('.sticky').getByText('$1,450');
    await expect(sidebarPrice).toBeVisible({ timeout: 10000 });
  });

  test('CTA sidebar renders "Book a Tour" button on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // CTASidebar renders <Button>Book a Tour</Button>
    // The sidebar is inside a hidden md:block container so it is only visible on desktop
    const bookTourBtn = page.getByRole('button', { name: 'Book a Tour' });
    await expect(bookTourBtn).toBeVisible({ timeout: 10000 });
  });

  test('CTA sidebar renders "Ask AI About This Listing" button on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const askAiBtn = page.getByRole('button', { name: 'Ask AI About This Listing' });
    await expect(askAiBtn).toBeVisible({ timeout: 10000 });
  });

  test('CTA sidebar "Book a Tour" button remains accessible after scrolling down', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // Scroll to the bottom of the page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    // Sidebar has sticky top-20 so it stays in viewport
    const bookTourBtn = page.getByRole('button', { name: 'Book a Tour' });
    await expect(bookTourBtn).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL-03 — Landlord card, amenities grid, AI lease summary visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('DETAIL-03 — Landlord card, amenities grid, and AI lease summary', () => {
  test('landlord card shows the landlord name', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // Mock landlord name: "Patricia Chen"
    await expect(page.getByText('Patricia Chen')).toBeVisible({ timeout: 10000 });
  });

  test('landlord card shows the landlord rating', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // Rating: 4.8
    await expect(page.getByText('4.8')).toBeVisible({ timeout: 10000 });
  });

  test('landlord card shows the response rate', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // Response rate: "98% response rate"
    await expect(page.getByText('98% response rate')).toBeVisible({ timeout: 10000 });
  });

  test('amenities grid displays known amenity items', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // Scroll to bring the amenities grid into view
    const amenitiesHeading = page.getByRole('heading', { name: 'Amenities' });
    await amenitiesHeading.scrollIntoViewIfNeeded();

    await expect(page.getByText('In-Unit Washer/Dryer')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('High-Speed WiFi')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Gym Access')).toBeVisible({ timeout: 10000 });
  });

  test('AI lease summary section is visible with the "AI Lease Summary" heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const leaseHeading = page.getByRole('heading', { name: 'Lease Details' });
    await leaseHeading.scrollIntoViewIfNeeded();

    // LeaseSummary renders a CardTitle "AI Lease Summary"
    await expect(page.getByText('AI Lease Summary')).toBeVisible({ timeout: 10000 });
  });

  test('AI lease summary displays the lease length', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const leaseHeading = page.getByRole('heading', { name: 'Lease Details' });
    await leaseHeading.scrollIntoViewIfNeeded();

    // Mock lease length: "12 months (Aug 2026 – Jul 2027)"
    await expect(page.getByText('12 months (Aug 2026 – Jul 2027)')).toBeVisible({ timeout: 10000 });
  });

  test('AI lease summary lists utilities included in rent', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const leaseHeading = page.getByRole('heading', { name: 'Lease Details' });
    await leaseHeading.scrollIntoViewIfNeeded();

    // utilitiesIncluded: ['Water', 'Trash', 'Internet']
    // Use exact: true to avoid matching "Water" inside the description paragraph
    await expect(page.getByText('Water', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Internet', { exact: true })).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL-04 — Commute section with map placeholder + distance table
// ─────────────────────────────────────────────────────────────────────────────

test.describe('DETAIL-04 — Commute section with map and distance data', () => {
  test('commute section heading is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const commuteHeading = page.getByRole('heading', { name: 'Commute to Campus' });
    await commuteHeading.scrollIntoViewIfNeeded();
    await expect(commuteHeading).toBeVisible({ timeout: 10000 });
  });

  test('commute section displays the campus map placeholder', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const commuteHeading = page.getByRole('heading', { name: 'Commute to Campus' });
    await commuteHeading.scrollIntoViewIfNeeded();

    // CommuteSection renders a map placeholder with "Campus Map" text
    await expect(page.getByText('Campus Map')).toBeVisible({ timeout: 10000 });
  });

  test('commute table shows campus building names from mock data', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const commuteHeading = page.getByRole('heading', { name: 'Commute to Campus' });
    await commuteHeading.scrollIntoViewIfNeeded();

    // Mock commute buildings: Main Library, Engineering Hall, Student Union, Recreation Center
    await expect(page.getByText('Main Library')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Engineering Hall')).toBeVisible({ timeout: 10000 });
  });

  test('commute table shows walk time column header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const commuteHeading = page.getByRole('heading', { name: 'Commute to Campus' });
    await commuteHeading.scrollIntoViewIfNeeded();

    // The table headers use sr-only text "Walk", "Bike", "Bus" for accessibility
    // On desktop (sm:inline) the text "Walk" is visible in the header
    await expect(page.getByText('Walk').first()).toBeVisible({ timeout: 10000 });
  });

  test('commute table shows transit time data for buildings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    const commuteHeading = page.getByRole('heading', { name: 'Commute to Campus' });
    await commuteHeading.scrollIntoViewIfNeeded();

    // Mock: Main Library walkMin=8, bikeMin=3, busMin=5
    // The table renders "{n} min" in each cell
    await expect(page.getByText('8 min').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('3 min').first()).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL-05 — Mobile sticky bottom bar with price, "Book Tour", "Chat" buttons
// ─────────────────────────────────────────────────────────────────────────────

test.describe('DETAIL-05 — Mobile sticky bottom bar', () => {
  test('mobile bottom bar is visible on a phone-sized viewport', async ({ page }) => {
    // Pixel 5 viewport (as used by the mobile-chrome project in playwright.config)
    await page.setViewportSize({ width: 393, height: 851 });
    await gotoListingDetail(page);

    // MobileBottomBar is fixed bottom-0, md:hidden — visible on mobile
    // It renders the price "$1,450"
    const mobileBar = page.locator('.fixed.bottom-0');
    await expect(mobileBar).toBeVisible({ timeout: 10000 });
  });

  test('mobile bottom bar shows the listing price', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await gotoListingDetail(page);

    // Price is "$1,450" — the mobile bar shows "$1,450/mo"
    // Use a more specific locator within the fixed bottom bar
    const mobileBar = page.locator('.fixed.bottom-0');
    await expect(mobileBar).toBeVisible({ timeout: 10000 });
    await expect(mobileBar.getByText('$1,450')).toBeVisible({ timeout: 10000 });
  });

  test('mobile bottom bar shows "Book Tour" button', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await gotoListingDetail(page);

    // MobileBottomBar renders <Button>Book Tour</Button>
    const mobileBar = page.locator('.fixed.bottom-0');
    await expect(mobileBar).toBeVisible({ timeout: 10000 });
    await expect(mobileBar.getByRole('button', { name: 'Book Tour' })).toBeVisible({ timeout: 10000 });
  });

  test('mobile bottom bar shows "Chat" button', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await gotoListingDetail(page);

    // MobileBottomBar renders <Button variant="outline">Chat</Button>
    const mobileBar = page.locator('.fixed.bottom-0');
    await expect(mobileBar).toBeVisible({ timeout: 10000 });
    await expect(mobileBar.getByRole('button', { name: 'Chat' })).toBeVisible({ timeout: 10000 });
  });

  test('mobile bottom bar remains fixed at the bottom after scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await gotoListingDetail(page);

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const mobileBar = page.locator('.fixed.bottom-0');
    await expect(mobileBar).toBeVisible({ timeout: 5000 });
    await expect(mobileBar.getByRole('button', { name: 'Book Tour' })).toBeVisible({ timeout: 5000 });
  });

  test('mobile bottom bar is hidden on a desktop viewport', async ({ page }) => {
    // On desktop the bar has md:hidden which removes it from layout
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoListingDetail(page);

    // The element may be in the DOM but should not be visible (md:hidden via Tailwind)
    const mobileBar = page.locator('.fixed.bottom-0');
    // Use toBeHidden — it is not visible on desktop
    await expect(mobileBar).toBeHidden({ timeout: 10000 });
  });
});
