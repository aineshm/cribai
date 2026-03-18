import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Landing Page (/) — current implementation
 *
 * UAT criteria:
 *   1. Unauthenticated visitor sees marketing landing page (hero, value prop, CTA)
 *   2. Feature cards, How CampusNest Works, footer CTA visible on desktop
 *   3. Nav shows brand and unauthenticated CTA
 */

test.describe('Landing Page', () => {
  test('renders hero with heading and subtitle', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.assertLoaded();
  });

  test('nav shows CampusNest brand and Browse link', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.brandText).toBeVisible();
    await expect(home.browseLink).toBeVisible();
  });

  test('nav Get Started button links to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.getStartedNavButton).toBeVisible();
    await expect(home.getStartedNavButton).toHaveAttribute('href', '/login');
  });

  test('all landing page sections visible on desktop', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Scroll to trigger lazy sections
    await home.footerCtaHeading.scrollIntoViewIfNeeded();
    await home.assertAllSections();
  });

  test('hero "Get Started (it\'s free)" CTA links to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.getStartedCta).toBeVisible();
    await expect(home.getStartedCta).toHaveAttribute('href', '/login');
  });

  test('"Get Started (it\'s free)" CTA navigates to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.getStartedCta.click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('"See how it works" CTA links to /explore', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.seeHowItWorksLink).toBeVisible();
    await expect(home.seeHowItWorksLink).toHaveAttribute('href', '/explore');
  });

  test('How CampusNest works section renders', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.howItWorksHeading.scrollIntoViewIfNeeded();
    await expect(home.howItWorksHeading).toBeVisible();
    // Three numbered steps are present — use exact divs inside the how-it-works section
    const step01 = page.locator('div.text-amber-300', { hasText: /^01$/ });
    const step02 = page.locator('div.text-amber-300', { hasText: /^02$/ });
    const step03 = page.locator('div.text-amber-300', { hasText: /^03$/ });
    await expect(step01).toBeVisible();
    await expect(step02).toBeVisible();
    await expect(step03).toBeVisible();
  });

  test('footer CTA "Create free account" button navigates to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.footerCtaButton.scrollIntoViewIfNeeded();
    await expect(home.footerCtaButton).toBeVisible();
    await home.footerCtaButton.click();
    await page.waitForURL('/login');
    await expect(page).toHaveURL('/login');
  });

  test('footer CTA heading "Ready to find your nest?" is visible', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.footerCtaHeading.scrollIntoViewIfNeeded();
    await expect(home.footerCtaHeading).toBeVisible();
  });

  test('UW-Madison campus section renders', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.uwMadisonBadge).toBeVisible();
  });
});

test.describe('Landing Page — Feature Cards', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('all three feature card headings are visible', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.featuresHeading.scrollIntoViewIfNeeded();
    await expect(home.featureCards.aiSearch).toBeVisible();
    await expect(home.featureCards.verifiedCommunity).toBeVisible();
    await expect(home.featureCards.support).toBeVisible();
  });
});
