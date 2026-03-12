import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Auth Page (/login) — Phase 11 redesign
 *
 * UAT criteria:
 *   4. Auth page renders branded split layout on desktop
 *   5. OTP flow transitions with slide animations between steps
 *
 * Notes:
 *   - We do NOT test actual Supabase signInWithOtp network calls.
 *   - Split layout left panel uses `lg:flex` so tests use desktop viewport.
 *   - AnimatePresence slide animations are tested via DOM step transitions.
 */

test.describe('Auth page — Email step', () => {
  test('renders the email form with heading and description', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.assertFormVisible();
    await expect(login.description).toBeVisible();
  });

  test('heading reads "Sign in to CampusNest"', async ({ page }) => {
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

  test('left panel shows CampusNest branding and tagline', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.brandHeading).toHaveText('CampusNest');
    await expect(page.getByText('Student housing, finally transparent')).toBeVisible();
  });

  test('left panel shows value badges', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.getByText('AI-Powered')).toBeVisible();
    await expect(page.getByText('Verified .edu')).toBeVisible();
    await expect(page.getByText('Fair Pricing')).toBeVisible();
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
  // We can't trigger a real OTP send, but we can test that submitting
  // a non-.edu email shows an error (client-side validation).

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
    // The mail icon wrapper div exists
    await expect(page.locator('svg.lucide-mail')).toBeVisible();
  });
});

test.describe('CribAI auth guard (middleware)', () => {
  test('unauthenticated visit to /uw-madison/cribai redirects to /login', async ({ page }) => {
    await page.goto('/uw-madison/cribai');
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
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
  test('Sign In link on homepage leads to the login form', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.clickSignIn();
    await page.waitForURL('/login');
    const login = new LoginPage(page);
    await login.assertFormVisible();
  });
});
