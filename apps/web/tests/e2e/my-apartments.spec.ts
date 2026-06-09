import { test, expect } from '@playwright/test';

/**
 * E2E — "My Apartments" Personal CRM front end (Phase 5 / plan Task 15).
 *
 * Two gates guard these routes:
 *  - Visibility flag NEXT_PUBLIC_CRM_ENABLED — without 'true' the routes 404
 *    and the nav entries are hidden ("merge dark" kill-switch).
 *  - Middleware auth (proxy.ts `protectedFlatRoutes`) — an unauthenticated
 *    visit to /my-apartments(/board) redirects to /login, exactly like /post.
 *
 * The data layer is MOCK-DRIVEN (NEXT_PUBLIC_CRM_MOCK=true, the default), so no
 * backend / network is exercised; the mock client adds ~350ms delays per call
 * which `toBeVisible()` auto-waits out.
 *
 * Suite split:
 *  - "route protection" runs in the default (unauthenticated) suite — it asserts
 *    the /login redirect and does not depend on either flag.
 *  - "workspace UI" needs an authenticated session (dev-auth: BYPASS_AUTH=true)
 *    AND NEXT_PUBLIC_CRM_ENABLED=true. It auto-skips when the route redirects to
 *    /login (i.e. auth isn't bypassed), so the default suite stays green while
 *    the assertions still run under a dev-auth e2e configuration.
 */

const WORKSPACE_URL = '/my-apartments';
const BOARD_URL = '/my-apartments/board';
const CHAPTER_URL = 'https://www.chapteratmadison.com/floor-plan/studio-s1/';

test.describe('My Apartments — route protection', () => {
  // Under dev-auth (BYPASS_AUTH=true) the proxy short-circuits BEFORE the
  // protectedFlatRoutes check and injects a dev user, so these routes render
  // instead of redirecting. The redirect assertion therefore applies only to
  // the unauthenticated suite — probe at runtime and skip when auth is bypassed
  // (env-agnostic; mirrors navigation.spec.ts's checkAuthBypassed approach).
  const expectLoginRedirect = async (
    page: import('@playwright/test').Page,
    url: string,
  ): Promise<void> => {
    await page.goto(url);
    test.skip(!/\/login/.test(page.url()), 'auth bypassed (dev-auth) — route renders, no redirect to assert');
    await expect(page).toHaveURL(/\/login/);
  };

  test('workspace route redirects unauthenticated visitors to /login', async ({ page }) => {
    await expectLoginRedirect(page, WORKSPACE_URL);
  });

  test('board route redirects unauthenticated visitors to /login', async ({ page }) => {
    await expectLoginRedirect(page, BOARD_URL);
  });
});

test.describe('My Apartments — workspace UI (requires dev-auth)', () => {
  // Desktop viewport: the workspace canvas is desktop-only (matchMedia 980px).
  test.use({ viewport: { width: 1280, height: 900 } });
  // First hit to each route cold-compiles under Turbopack; give nav headroom.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    // In the default (unauthenticated) suite the proxy redirects these routes to
    // /login — skip the UI assertions there. They run only under dev-auth
    // (BYPASS_AUTH=true) with NEXT_PUBLIC_CRM_ENABLED=true.
    await page.goto(WORKSPACE_URL);
    if (/\/login/.test(page.url())) {
      test.skip(true, 'requires dev-auth (BYPASS_AUTH=true) + NEXT_PUBLIC_CRM_ENABLED=true');
    }
  });

  test('workspace: pasting a listing URL yields a saved unit + first-look analysis', async ({
    page,
  }) => {
    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');

    // The composer carries the (partial-match) placeholder and an id+name.
    const composer = page.getByPlaceholder(/paste a listing/i);
    await expect(composer).toBeVisible();

    // The first keystroke can be lost if it lands before React attaches the
    // input's onKeyDown handler (the saved-unit never appears, no retry). Wrap
    // the submit + first assertion in toPass so a dropped Enter is re-issued.
    await expect(async () => {
      await composer.fill(CHAPTER_URL);
      await composer.press('Enter');
      // Pasted URL → crmClient.addListing → SavedUnitCard (building + unit label).
      await expect(page.getByText(/Chapter at Madison/i).first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await expect(page.getByText(/Studio S1/i).first()).toBeVisible();

    // …then crmClient.getAnalysis → FirstSaveAnalysisCard ("First look" + True Cost).
    await expect(page.getByText(/first look/i)).toBeVisible();
    await expect(page.getByText(/true cost/i)).toBeVisible();
  });

  test('workspace: the "My Apartments" canvas opens and switches to Rank', async ({ page }) => {
    await page.goto(WORKSPACE_URL);
    await page.waitForLoadState('networkidle');

    // The canvas is conditionally mounted — its content is absent until opened.
    // Scope to the toggle BUTTON (a nav LINK of the same name may also exist).
    // toPass re-issues the toggle click if it lands pre-hydration.
    const toggle = page.getByRole('button', { name: /my apartments/i });
    await expect(async () => {
      await toggle.click();
      await expect(page.getByText(/Fall 2026 hunt/i)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    // Switch List → Rank; the leaderboard surfaces per-row "Score" content.
    await page.getByRole('tab', { name: /rank/i }).click();
    await expect(page.getByText(/score/i).first()).toBeVisible();
  });

  test('board: pipeline stages render, and Compare shows a table', async ({ page }) => {
    await page.goto(BOARD_URL);
    await page.waitForLoadState('networkidle');

    // Pipeline kanban columns are role="group" with the stage as accessible name
    // (rendered server-side — findable without hydration).
    await expect(page.getByRole('group', { name: /applied/i })).toBeVisible();

    // Switch the view to Compare → RankCompareTable renders a <table> (lazy ~350ms).
    // toPass re-issues the view-switch click if it lands pre-hydration.
    const compareTab = page.getByRole('tab', { name: /compare/i });
    await expect(async () => {
      await compareTab.click();
      await expect(page.getByRole('table')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  });
});
