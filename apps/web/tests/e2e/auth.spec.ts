import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Auth Page (/login) — current implementation
 *
 * UAT criteria:
 *   1. Auth page renders branded split layout on desktop
 *   2. Email form visible with correct placeholder, heading, submit button
 *   3. Non-.edu email shows client-side validation error
 *   4. /post route is middleware-protected and redirects to /login
 *
 * Notes:
 *   - We do NOT test actual Supabase signInWithOtp network calls.
 *   - Left panel uses `hidden lg:flex lg:w-1/2 bg-teal-900` — desktop only.
 *   - /[campusSlug]/cribai does NOT redirect unauthenticated users to /login;
 *     it renders the AI chat page for all users (auth is optional).
 */

test.describe('Auth page — Email step', () => {
  test('renders the email form with heading and description', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.assertFormVisible();
    await expect(login.description).toBeVisible();
  });

  test('heading reads "Sign in to CribAI"', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.heading).toBeVisible();
  });

  test('description mentions .edu email', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.description).toBeVisible();
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

  test('submit button shows "Continue"', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.submitButton).toBeVisible();
    await expect(login.submitButton).toHaveText('Continue');
  });

  test('email input accepts a valid .edu address', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.fillEmail('student@wisc.edu');
    await expect(login.emailInput).toHaveValue('student@wisc.edu');
  });

  test('page URL is /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Auth page — Split layout (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('branded left panel is visible on desktop', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.assertSplitLayoutVisible();
  });

  test('left panel shows CribAI branding', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.brandHeading).toBeVisible();
  });

  test('left panel shows feature bullets', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.getByText('Verified .edu student network')).toBeVisible();
    await expect(page.getByText('AI-matched listings & fair pricing')).toBeVisible();
    await expect(page.getByText('Direct tour booking & lease analysis')).toBeVisible();
  });

  test('left panel shows "Find your perfect college apartment" headline', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.getByRole('heading', { name: /Find your perfect college apartment/i })).toBeVisible();
  });
});

test.describe('Auth page — Split layout hidden on mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('branded left panel is hidden on mobile', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.brandPanel).not.toBeVisible();
  });

  test('form is still visible on mobile', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.assertFormVisible();
  });
});

test.describe('Auth page — OTP step (client-side only)', () => {
  // We can't trigger a real OTP send, but we can test client-side validation.

  test('submitting non-.edu email shows error', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.submitEmail('user@gmail.com');
    await expect(login.errorMessage).toBeVisible();
    await expect(login.errorMessage).toContainText('.edu');
  });

  test('email step has Mail icon', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.locator('svg.lucide-mail')).toBeVisible();
  });
});

test.describe('/post auth guard (middleware)', () => {
  test('unauthenticated visit to /post redirects to /login', async ({ page }) => {
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('/post redirect includes returnTo=/post param', async ({ page }) => {
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain('returnTo=%2Fpost');
  });

  test('login form is displayed after /post redirect', async ({ page }) => {
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    const login = new LoginPage(page);
    await login.assertFormVisible();
  });
});

test.describe('Navigation from homepage to login', () => {
  test('"Get Started" nav button leads to the login form', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.getStartedNavButton.click();
    await page.waitForURL('/login');
    const login = new LoginPage(page);
    await login.assertFormVisible();
  });
});
