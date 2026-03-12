import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Navigation and Auth-Aware Flows — Phase 21
 *
 * Coverage:
 *   POST-01: /post route is middleware-protected (redirects unauthenticated users to /login)
 *   LAND-01: Unauthenticated landing page CTAs point to /login
 */

test.describe('Post Sublease Navigation', () => {
  test('/post route redirects unauthenticated users to /login', async ({ page }) => {
    // Navigate directly to /post without auth cookies
    await page.goto('/post');

    // Middleware should redirect to /login with returnTo param
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('/post redirect preserves returnTo param', async ({ page }) => {
    await page.goto('/post');

    // Confirm the middleware includes returnTo=/post in the redirect URL
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/returnTo=%2Fpost/);
  });

  test('/explore route renders nav with CampusNest brand', async ({ page }) => {
    // /explore is in (main) layout — nav should always render
    await page.goto('/explore');

    // The (main) layout nav always shows CampusNest wordmark
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    await expect(nav.getByText('CampusNest')).toBeVisible();
  });
});

test.describe('Landing Page Auth State (unauthenticated)', () => {
  test('hero Get Started CTA points to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.assertLoaded();

    // Unauthenticated: CTA should say "Get Started Free" → /login
    await expect(home.getStartedCta).toBeVisible();
    await expect(home.getStartedCta).toHaveAttribute('href', '/login');
  });

  test('nav Sign In link exists and points to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.signInLink).toBeVisible();
    await expect(home.signInLink).toHaveAttribute('href', '/login');
  });

  test('footer Get Started CTA points to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await home.footerCtaButton.scrollIntoViewIfNeeded();
    await expect(home.footerCtaButton).toBeVisible();
    await expect(home.footerCtaButton).toHaveAttribute('href', '/login');
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('mobile sticky bar Get Started CTA points to /login when unauthenticated', async ({
      page,
    }) => {
      const home = new HomePage(page);
      await home.goto();

      // Scroll past hero to trigger MobileStickyBar IntersectionObserver
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Last "Get Started Free" link in DOM is the sticky bar's CTA
      const allGetStarted = page.getByRole('link', { name: 'Get Started Free' });
      const lastLink = allGetStarted.last();
      await expect(lastLink).toBeVisible({ timeout: 5000 });
      await expect(lastLink).toHaveAttribute('href', '/login');
    });
  });
});
