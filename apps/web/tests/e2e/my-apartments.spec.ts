import { test, expect } from '@playwright/test';

/**
 * E2E — "My Apartments" Personal CRM front end (Phase 5 / plan Task 15).
 *
 * Covers the user-visible contract on the two CRM routes. Everything is
 * MOCK-DRIVEN (NEXT_PUBLIC_CRM_MOCK=true, the default — the flag is only off
 * when explicitly set to 'false'), so no backend / network is exercised; the
 * mock client adds ~350ms delays per call which `toBeVisible()` auto-waits out.
 *
 * Desktop-first layout: `CrmWorkspace` branches on `useIsMobile` (matchMedia,
 * 980px). At a mobile viewport the canvas renders as a `CanvasSheet` overlay
 * rather than the 60% desktop pane, and the chat narrows. We pin a desktop
 * viewport on the whole describe so the canvas-toggle assertions hold under the
 * `mobile-chrome` Playwright project too (same pattern as navigation.spec.ts /
 * explore-chat.spec.ts).
 *
 * Routes (`/my-apartments`, `/my-apartments/board`) live under the (main)
 * layout, which renders unauthenticated (verified 200, no /login redirect).
 */

const WORKSPACE_URL = '/my-apartments';
const BOARD_URL = '/my-apartments/board';
const CHAPTER_URL = 'https://www.chapteratmadison.com/floor-plan/studio-s1/';

test.describe('My Apartments — CRM front end', () => {
  // Desktop viewport: the workspace canvas is desktop-only (matchMedia 980px).
  test.use({ viewport: { width: 1280, height: 900 } });
  // First hit to each route cold-compiles under Turbopack; give nav headroom.
  test.setTimeout(90_000);

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
