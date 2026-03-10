import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Auth journeys
 *
 * Journeys covered:
 *   1. Login page renders OTP email form
 *   2. Email input accepts .edu addresses
 *   3. Submit button is present and interactive
 *   4. "Back" link returns to homepage
 *   5. CribAI route redirects unauthenticated users to /login
 *   6. Redirect preserves the `next` query param on /login
 *
 * Notes:
 *   - We do NOT test the actual Supabase signInWithOtp network call in E2E.
 *     Success/error states require a real Supabase project with valid credentials.
 *   - The CribAI auth-guard is enforced by middleware.ts — no DB call needed;
 *     the middleware checks for a session cookie and redirects if absent.
 */

test.describe('Login page', () => {
  test('renders the OTP email form', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.assertFormVisible();
  });

  test('heading reads "Sign in to CampusNest"', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.heading).toBeVisible();
    await expect(login.heading).toHaveText('Sign in to CampusNest');
  });

  test('description mentions .edu email', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.getByText('.edu')).toBeVisible();
  });

  test('email input placeholder is "you@university.edu"', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.emailInput).toHaveAttribute('placeholder', 'you@university.edu');
  });

  test('email input has type="email"', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.emailInput).toHaveAttribute('type', 'email');
  });

  test('submit button is enabled by default', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.submitButton).toBeEnabled();
  });

  test('email input accepts a valid .edu address', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.fillEmail('student@wisc.edu');
    await expect(login.emailInput).toHaveValue('student@wisc.edu');
  });

  test('"Back" link navigates to homepage', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(login.backLink).toBeVisible();
    await login.clickBack();

    await page.waitForURL('/');
    await expect(page).toHaveURL('/');
  });

  test('page URL is /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page).toHaveURL('/login');
  });
});

test.describe('CribAI auth guard (middleware)', () => {
  /**
   * The middleware redirects /[campusSlug]/cribai to /login when there is no auth session.
   * We test this without a logged-in user — Playwright starts with an empty
   * cookie jar so no Supabase session is present.
   */
  test('unauthenticated visit to /uw-madison/cribai redirects to /login', async ({ page }) => {
    await page.goto('/uw-madison/cribai');

    // Middleware should redirect; wait for the URL to settle
    await page.waitForURL(/\/login/);

    expect(page.url()).toContain('/login');
  });

  test('redirect to /login preserves the `next` query param', async ({ page }) => {
    await page.goto('/uw-madison/cribai');

    await page.waitForURL(/\/login/);

    const url = new URL(page.url());
    const next = url.searchParams.get('next');

    expect(next).toBe('/uw-madison/cribai');
  });

  test('unauthenticated visit to /ut-austin/cribai redirects to /login', async ({ page }) => {
    await page.goto('/ut-austin/cribai');

    await page.waitForURL(/\/login/);

    expect(page.url()).toContain('/login');
  });

  test('login form is displayed after CribAI redirect', async ({ page }) => {
    await page.goto('/uw-madison/cribai');
    await page.waitForURL(/\/login/);

    const login = new LoginPage(page);
    await login.assertFormVisible();
  });
});

test.describe('Navigation from homepage to login', () => {
  test('Sign in link on homepage leads to the login form', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await home.clickSignIn();

    await page.waitForURL('/login');

    const login = new LoginPage(page);
    await login.assertFormVisible();
  });
});
