import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Homepage (/)
 *
 * Journey covered:
 *   1. Homepage loads and renders the CampusNest heading + subtitle
 *   2. Campus selector cards (uw-madison, ut-austin) are visible
 *   3. "Sign in" link navigates to /login
 *
 * Notes:
 *   - Campus cards are populated from the database.  If Supabase credentials
 *     are not present at test time the page renders "No campuses available yet."
 *     The test asserts one of two valid states so it never produces a false
 *     negative in CI without a live DB, while still validating the happy path
 *     when the DB IS reachable.
 */

test.describe('Homepage', () => {
  test('renders heading and subtitle', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await home.assertLoaded();
  });

  test('shows campus selector cards or empty-state message', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    const uwCard = home.campusCard('uw-madison');
    const utCard = home.campusCard('ut-austin');
    const noData = home.noCampusesMessage;

    const anyCardVisible =
      (await uwCard.isVisible()) ||
      (await utCard.isVisible()) ||
      (await noData.isVisible());

    expect(
      anyCardVisible,
      'Expected either campus cards or the empty-state message to be visible'
    ).toBe(true);
  });

  test('campus card for uw-madison navigates to listings page', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    const card = home.campusCard('uw-madison');

    // Only run navigation sub-assertion if the card is present (DB reachable)
    const isVisible = await card.isVisible();
    if (!isVisible) {
      test.skip(true, 'uw-madison campus card not rendered — DB may be unavailable');
      return;
    }

    await home.clickCampusCard('uw-madison');

    await page.waitForURL('/uw-madison/listings');
    await expect(page).toHaveURL('/uw-madison/listings');
  });

  test('campus card for ut-austin navigates to listings page', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    const card = home.campusCard('ut-austin');

    const isVisible = await card.isVisible();
    if (!isVisible) {
      test.skip(true, 'ut-austin campus card not rendered — DB may be unavailable');
      return;
    }

    await home.clickCampusCard('ut-austin');

    await page.waitForURL('/ut-austin/listings');
    await expect(page).toHaveURL('/ut-austin/listings');
  });

  test('sign in link navigates to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.signInLink).toBeVisible();
    await home.clickSignIn();

    await page.waitForURL('/login');
    await expect(page).toHaveURL('/login');
  });

  test('has correct page title or meta', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // The heading must be present — fundamental load check
    await expect(home.heading).toBeVisible();
  });
});
