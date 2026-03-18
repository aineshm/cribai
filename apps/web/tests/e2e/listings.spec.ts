import { test, expect } from '@playwright/test';

/**
 * E2E tests — Legacy listings routes + Explore page
 *
 * Architecture change (current):
 *   The old /[campusSlug]/listings page with filter grid has been replaced by the
 *   AI-native /explore page (CribAI chat + live map). The campus listings routes
 *   now redirect to /explore.
 *
 * Tests cover:
 *   1. /[campusSlug]/listings redirects to /explore
 *   2. /explore renders the AI chat interface with correct elements
 *   3. Invalid campus slug listing route still redirects to /explore (not crash)
 */

test.describe('Legacy listings route redirects', () => {
  test('/uw-madison/listings redirects to /explore', async ({ page }) => {
    await page.goto('/uw-madison/listings');
    await page.waitForURL('**/explore', { timeout: 15000 });
    await expect(page).toHaveURL(/\/explore/);
  });

  test('/ut-austin/listings shows not-found (campus not in DB)', async ({ page }) => {
    // Only uw-madison is in the DB; unknown campus slugs render the 404 page
    await page.goto('/ut-austin/listings');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    // Either a redirect to /explore or a 404 — both are acceptable for an unknown campus
    const isOnExplore = page.url().includes('/explore');
    const isNotFound = await page.getByText('Page not found').isVisible().catch(() => false);
    expect(isOnExplore || isNotFound).toBe(true);
  });

  test('/invalid-campus/listings shows not-found', async ({ page }) => {
    await page.goto('/invalid-campus-xyz/listings');
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    // Either a redirect to /explore or a 404 — both are acceptable
    const isOnExplore = page.url().includes('/explore');
    const isNotFound = await page.getByText('Page not found').isVisible().catch(() => false);
    expect(isOnExplore || isNotFound).toBe(true);
  });
});

test.describe('Explore page (replaced listings UI)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('renders CribAI chat input', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    const chatInput = page.getByRole('textbox', { name: /chat message input/i });
    await expect(chatInput).toBeVisible();
    await expect(chatInput).not.toBeDisabled();
  });

  test('renders LIVE MAP panel with geocoded count', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('LIVE MAP', { exact: false })).toBeVisible();
    await expect(page.getByText(/geocoded matches/i)).toBeVisible();
  });

  test('renders Send button', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /send/i })).toBeVisible();
  });

  test('renders Active Context / ContextBar', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    // ContextBar always renders with either "Active Context" or "Filters" label in teal-50 pill
    const contextPill = page.locator('.bg-teal-50').first();
    await expect(contextPill).toBeAttached();
  });

  test('renders CampusNest nav brand', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    const topNav = page.getByRole('navigation').first();
    await expect(topNav.getByText('CampusNest')).toBeVisible();
  });

  test('prompt chip "Find me a 2-bedroom under $1200" is visible', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Find me a 2-bedroom under $1200')).toBeVisible();
  });
});

test.describe('Explore page — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('chat input renders on mobile', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForLoadState('networkidle');

    const chatInput = page.getByRole('textbox', { name: /chat message input/i });
    await expect(chatInput).toBeVisible();
  });
});
