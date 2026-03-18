import { test, expect } from '@playwright/test';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';

/**
 * E2E tests — Navigation and Auth-Aware Flows — current implementation
 *
 * Coverage:
 *   POST-01: /post route is middleware-protected (redirects unauthenticated users to /login)
 *   LAND-01: Unauthenticated landing page CTAs point to /login
 *   EXPLORE-01: /explore route renders nav with CampusNest brand
 */

test.describe('Post Sublease Navigation', () => {
  test('/post route redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('/post redirect preserves returnTo param', async ({ page }) => {
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page).toHaveURL(/returnTo=%2Fpost/);
  });

  test('/explore route renders nav with CampusNest brand', async ({ page }) => {
    await page.goto('/explore');

    // The (main) layout top nav always shows CampusNest wordmark
    // Use the primary navigation role (top nav, not the mobile bottom nav)
    const topNav = page.getByRole('navigation').first();
    await expect(topNav).toBeVisible();
    await expect(topNav.getByText('CampusNest')).toBeVisible();
  });
});

test.describe('Landing Page Auth State (unauthenticated)', () => {
  test('hero CTA points to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.assertLoaded();

    // Unauthenticated: CTA should say "Get Started (it's free)" → /login
    await expect(home.getStartedCta).toBeVisible();
    await expect(home.getStartedCta).toHaveAttribute('href', '/login');
  });

  test('nav "Get Started" button exists and points to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.getStartedNavButton).toBeVisible();
    await expect(home.getStartedNavButton).toHaveAttribute('href', '/login');
  });

  test('footer "Create free account" CTA points to /login when unauthenticated', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await home.footerCtaButton.scrollIntoViewIfNeeded();
    await expect(home.footerCtaButton).toBeVisible();
    await expect(home.footerCtaButton).toHaveAttribute('href', '/login');
  });

  test('clicking hero CTA navigates to /login', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.getStartedCta.click();
    await page.waitForURL('/login', { timeout: 15000 });
    const login = new LoginPage(page);
    await login.assertFormVisible();
  });
});
