import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Landing Page (/) — current implementation
 *
 * UAT criteria:
 *   1. Unauthenticated visitor sees marketing landing page (hero, value prop, CTA)
 *   2. Feature cards, How CribAI Works, footer CTA visible on desktop
 *   3. Nav shows brand and unauthenticated CTA
 */

async function checkAuthBypassed(page: any): Promise<boolean> {
  await Promise.race([
    page.locator('text=Dashboard').first().waitFor({ state: 'attached', timeout: 5000 }),
    page.locator('text=Get Started').first().waitFor({ state: 'attached', timeout: 5000 })
  ]).catch(() => {});
  return await page.locator('text=Dashboard').first().isVisible();
}

test.describe('Landing Page', () => {
  // Desktop-only: mobile nav uses a hamburger menu instead of inline "Get Started" / "Browse" links
  test.use({ viewport: { width: 1280, height: 800 } });

  test('renders hero with heading and subtitle', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.assertLoaded();
  });

  test('nav shows CribAI brand and Browse link', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.brandText).toBeVisible();
    const isAuth = await checkAuthBypassed(page);
    if (!isAuth) {
      await expect(home.browseLink).toBeVisible();
    }
  });

  test('nav Get Started button links to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    const isAuth = await checkAuthBypassed(page);
    if (isAuth) {
      await expect(home.dashboardLink.first()).toBeVisible();
      await expect(home.dashboardLink.first()).toHaveAttribute('href', /explore/);
    } else {
      await expect(home.getStartedNavButton).toBeVisible();
      await expect(home.getStartedNavButton).toHaveAttribute('href', '/login');
    }
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
    const isAuth = await checkAuthBypassed(page);
    if (isAuth) {
      await expect(home.goToExploreCtaHero).toBeVisible();
      await expect(home.goToExploreCtaHero).toHaveAttribute('href', /explore/);
    } else {
      await expect(home.getStartedCta).toBeVisible();
      await expect(home.getStartedCta).toHaveAttribute('href', '/login');
    }
  });

  test('"Get Started (it\'s free)" CTA navigates to /login or explore', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    const isAuth = await checkAuthBypassed(page);
    if (isAuth) {
      await home.goToExploreCtaHero.click();
      await page.waitForURL(/explore/, { timeout: 15000 });
      await expect(page).toHaveURL(/explore/);
    } else {
      await home.getStartedCta.click();
      await page.waitForURL(/\/login/, { timeout: 15000 });
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('"See how it works" CTA links to /explore', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.seeHowItWorksLink).toBeVisible();
    await expect(home.seeHowItWorksLink).toHaveAttribute('href', '/explore');
  });

  test('How CribAI works section renders', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.howItWorksHeading.scrollIntoViewIfNeeded();
    await expect(home.howItWorksHeading).toBeVisible();
    // Three numbered steps are present — use exact divs inside the how-it-works section
    const step01 = page.locator('div.text-slate-300', { hasText: /^01$/ });
    const step02 = page.locator('div.text-slate-300', { hasText: /^02$/ });
    const step03 = page.locator('div.text-slate-300', { hasText: /^03$/ });
    await expect(step01).toBeVisible();
    await expect(step02).toBeVisible();
    await expect(step03).toBeVisible();
  });

  test('footer CTA button navigates to /login or /explore', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.footerCtaButton.scrollIntoViewIfNeeded();
    await expect(home.footerCtaButton).toBeVisible();
    const isAuth = await checkAuthBypassed(page);
    await home.footerCtaButton.click();
    if (isAuth) {
      await page.waitForURL(/explore/, { timeout: 15000 });
      await expect(page).toHaveURL(/explore/);
    } else {
      await page.waitForURL('/login', { timeout: 15000 });
      await expect(page).toHaveURL('/login');
    }
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
