import { test, expect } from '@playwright/test';

async function getFirstListingHref(page: import('@playwright/test').Page) {
  await page.goto('/explore');
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  const firstListingLink = page.locator('a[href^="/listing/"]').first();
  if (await firstListingLink.count() === 0) {
    return null;
  }

  return firstListingLink.getAttribute('href');
}

test.describe('Listing Detail', () => {
  test('campus-scoped detail URLs redirect to the flat listing route', async ({ page }) => {
    const href = await getFirstListingHref(page);
    test.skip(!href, 'No listings available in the test environment.');

    const listingId = href!.split('/').pop();
    test.skip(!listingId, 'Could not determine listing id from explore page.');

    await page.goto(`/uw-madison/listings/${listingId}`);
    await page.waitForURL(`**/listing/${listingId}?campus=uw-madison`, {
      timeout: 15000,
    });

    await expect(page).toHaveURL(new RegExp(`/listing/${listingId}\\?campus=uw-madison$`));
  });

  test('detail page renders the current flat-route shell and desktop CTAs', async ({ page }) => {
    const href = await getFirstListingHref(page);
    test.skip(!href, 'No listings available in the test environment.');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(href!);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book a Tour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask AI About This Listing' })).toBeVisible();
  });

  test('detail page renders the mobile bottom bar actions', async ({ page }) => {
    const href = await getFirstListingHref(page);
    test.skip(!href, 'No listings available in the test environment.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(href!);
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    await expect(page.getByRole('button', { name: 'Book Tour' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chat' })).toBeVisible();
  });
});
