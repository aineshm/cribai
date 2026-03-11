import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Landing Page (/) — Phase 11 redesign
 *
 * UAT criteria:
 *   1. Unauthenticated visitor sees marketing landing page (hero, value prop, CTA)
 *   2. Social proof, feature cards, How It Works, footer CTA visible on desktop
 *   3. Mobile sticky CTA pinned to bottom on scroll
 */

test.describe('Landing Page', () => {
  test('renders hero with heading, subtitle, and Get Started CTA', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.assertLoaded();
    await expect(home.getStartedCta).toBeVisible();
  });

  test('nav shows CampusNest brand and Sign In link', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.brandText).toBeVisible();
    await expect(home.signInLink).toBeVisible();
  });

  test('all landing page sections visible on desktop', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Scroll to trigger lazy animations
    await home.footerCtaHeading.scrollIntoViewIfNeeded();
    await home.assertAllSections();
  });

  test('How It Works section has 3 steps', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await home.howItWorksHeading.scrollIntoViewIfNeeded();
    await expect(home.howItWorksSteps).toHaveCount(3);
  });

  test('Get Started CTA navigates to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Use direct navigation via href check + click with extended timeout
    await expect(home.getStartedCta).toHaveAttribute('href', '/login');
    await home.getStartedCta.click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('Sign In nav link navigates to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.signInLink).toHaveAttribute('href', '/login');
    await home.signInLink.click();
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('footer CTA Get Started link navigates to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await home.footerCtaButton.scrollIntoViewIfNeeded();
    await home.footerCtaButton.click();

    await page.waitForURL('/login');
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Landing Page — Mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('mobile sticky CTA appears after scrolling past hero', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    // Scroll well past the hero section to trigger IntersectionObserver
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Wait for IntersectionObserver + AnimatePresence animation
    await page.waitForTimeout(1000);

    // The sticky bar should now be rendered by AnimatePresence
    const stickyLink = page.getByRole('link', { name: 'Get Started Free' }).last();
    await expect(stickyLink).toBeVisible({ timeout: 5000 });
  });

  test('mobile sticky CTA links to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // There are multiple "Get Started Free" links; the sticky bar one is last in DOM
    const allGetStarted = page.getByRole('link', { name: 'Get Started Free' });
    const lastLink = allGetStarted.last();
    await expect(lastLink).toBeVisible({ timeout: 5000 });
    await expect(lastLink).toHaveAttribute('href', '/login');
  });
});
