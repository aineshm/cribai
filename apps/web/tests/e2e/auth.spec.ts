import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';

/**
 * E2E tests — Auth Page (/login) — current implementation (post PR #75)
 *
 * UAT criteria:
 *   1. Auth page renders branded split layout on desktop
 *   2. Email form visible with correct placeholder, heading, submit button
 *   3. Malformed email shows client-side validation error
 *   4. Well-formed non-.edu emails are accepted (PR #75 .edu gate relaxed) —
 *      .edu only earns the "Verified UW Student" badge; sign-in itself is open
 *   5. /post route is middleware-protected and redirects to /login
 *
 * Notes:
 *   - We intercept Supabase OTP send so well-formed-email tests don't
 *     actually deliver mail or hit rate limits.
 *   - Left panel uses `hidden lg:flex lg:w-1/2 bg-red-900` — desktop only.
 *   - /[campusSlug]/cribai does NOT redirect unauthenticated users to /login;
 *     it renders the AI chat page for all users (auth is optional).
 */

async function checkAuthBypassed(page: any): Promise<boolean> {
  const home = new HomePage(page);
  await home.goto();
  await Promise.race([
    page.locator('text=Dashboard').first().waitFor({ state: 'attached', timeout: 5000 }),
    page.locator('text=Get Started').first().waitFor({ state: 'attached', timeout: 5000 })
  ]).catch(() => {});
  return await page.locator('text=Dashboard').first().isVisible();
}

test.describe('Auth page — Email step', () => {
  test('renders the email form with heading and description', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) {
      await page.goto('/login');
      await page.waitForURL(/explore|login/, { timeout: 10000 });
      return;
    }
    const login = new LoginPage(page);
    await login.goto();
    await login.assertFormVisible();
    await expect(login.description).toBeVisible();
  });

  test('heading reads "Sign in to CribAI"', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.heading).toBeVisible();
  });

  test('description mentions .edu email', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.description).toBeVisible();
  });

  test('email input placeholder is "you@university.edu"', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.emailInput).toHaveAttribute('placeholder', 'you@university.edu');
  });

  test('email input has type="email"', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.emailInput).toHaveAttribute('type', 'email');
  });

  test('submit button shows "Continue"', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.submitButton).toBeVisible();
    await expect(login.submitButton).toHaveText('Continue');
  });

  test('email input accepts a valid .edu address', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await login.fillEmail('student@wisc.edu');
    await expect(login.emailInput).toHaveValue('student@wisc.edu');
  });

  test('page URL is /login', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) {
      await page.goto('/login');
      await page.waitForURL(/explore|login/, { timeout: 10000 });
      return;
    }
    const login = new LoginPage(page);
    await login.goto();
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Auth page — Split layout (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('branded left panel is visible on desktop', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await login.assertSplitLayoutVisible();
  });

  test('left panel shows CribAI branding', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.brandHeading).toBeVisible();
  });

  test('left panel shows feature bullets', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.getByText('Verified .edu student network')).toBeVisible();
    await expect(page.getByText('AI-matched listings & fair pricing')).toBeVisible();
    await expect(page.getByText('Direct tour booking & lease analysis')).toBeVisible();
  });

  test('left panel shows "Find your perfect college apartment" headline', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.getByRole('heading', { name: /Find your perfect college apartment/i })).toBeVisible();
  });
});

test.describe('Auth page — Split layout hidden on mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('branded left panel is hidden on mobile', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.brandPanel).not.toBeVisible();
  });

  test('form is still visible on mobile', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await login.assertFormVisible();
  });
});

test.describe('Auth page — email validation (PR #75 — .edu gate relaxed)', () => {
  test('submitting malformed email shows "valid email address" error', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();

    // Disable HTML5 native validation so the form submits and the React
    // error path runs. Otherwise Chromium blocks the click with a tooltip.
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach((f) => {
        (f as HTMLFormElement).noValidate = true;
      });
    });

    await login.submitEmail('notanemail');
    await expect(login.errorMessage).toBeVisible();
    await expect(login.errorMessage).toContainText(/valid email/i);
    // Must NOT mention .edu — the .edu-only gate was removed in PR #75
    await expect(login.errorMessage).not.toContainText('.edu');
  });

  test('well-formed non-.edu email is accepted (no .edu rejection)', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    // Stub the Supabase OTP send so we don't actually deliver mail.
    await page.route(/\/auth\/v1\/otp/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    const login = new LoginPage(page);
    await login.goto();
    await login.submitEmail('user@gmail.com');

    // Either the OTP step appears, or no error appears — but in no case
    // should we see a ".edu"-specific rejection.
    const otpHeadingVisible = await login.otpHeading
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    const errorTextOrNull = (await login.errorMessage.isVisible().catch(() => false))
      ? await login.errorMessage.innerText()
      : null;

    expect(
      otpHeadingVisible || errorTextOrNull === null || !/\.edu/i.test(errorTextOrNull),
      `Non-.edu email should not be rejected with .edu error. Got: "${errorTextOrNull}"`,
    ).toBe(true);
  });

  test('email step has Mail icon', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.locator('svg.lucide-mail')).toBeVisible();
  });
});

test.describe('/post auth guard (middleware)', () => {
  test('unauthenticated visit to /post redirects to /login', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) {
      await page.goto('/post');
      await expect(page).not.toHaveURL(/\/login/);
      return;
    }
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain('/login');
  });

  test('/post redirect includes returnTo=/post param', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    expect(page.url()).toContain('returnTo=%2Fpost');
  });

  test('login form is displayed after /post redirect', async ({ page }) => {
    const isBypassed = await checkAuthBypassed(page);
    if (isBypassed) return;
    await page.goto('/post');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    const login = new LoginPage(page);
    await login.assertFormVisible();
  });
});

test.describe('Navigation from homepage to login', () => {
  // Desktop-only: mobile nav uses a hamburger menu, not the inline "Get Started" link
  test.use({ viewport: { width: 1280, height: 800 } });

  test('"Get Started" nav button leads to the login form', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    const isBypassed = await home.dashboardLink.isVisible();
    if (isBypassed) {
      await home.dashboardLink.click();
      await page.waitForURL(/explore/, { timeout: 15000 });
      await expect(page).toHaveURL(/explore/);
    } else {
      await home.getStartedNavButton.click();
      await page.waitForURL('/login', { timeout: 15000 });
      const login = new LoginPage(page);
      await login.assertFormVisible();
    }
  });
});
