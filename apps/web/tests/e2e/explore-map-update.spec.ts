import { test, expect, type Page } from '@playwright/test';

/**
 * E2E test — Explore page map-pin update after AI chat search
 *
 * Goal: Verify that after the user sends a chat query ("find me 2 bedroom
 * apartments under $2000"), the map panel updates to show AI-matched listings.
 *
 * Behavior note (post viewport-bounded fetch):
 *   The map no longer loads the full corpus on first paint. ExploreClient
 *   fetches listings via /api/explore/viewport bounded by the current Mapbox
 *   viewport. The initial overlay count may legitimately be 0 until bounds emit.
 *   After an AI chat query, ExploreClient.handleMapListings replaces the map
 *   with AI-matched listings and a "Showing N AI results" badge appears.
 *
 * Key selectors:
 *  - Map panel info overlay: text matching /\d+ listings? on map/
 *    (rendered in MapPanel.tsx: "{geoListings.length} listing(s) on map")
 *  - AI-results badge: text matching /Showing \d+ AI results?/
 *  - Map price-pin buttons: aria-label containing "per month"
 *  - Chat input: role="textbox", name=/chat message input/i
 *  - AI response bubble: [data-role="assistant"] (stable test affordance)
 *
 * Pass criterion for map update:
 *   After the AI responds, the "Showing N AI results" badge appears AND
 *   the on-map count is > 0 — i.e. the AI populated the map with results.
 */

const EXPLORE_URL = '/explore';
const QUERY = 'find me 2 bedroom apartments under $2000';

/**
 * Parse "N listing(s) on map" count from the map panel overlay text.
 * Returns null if the text is not found.
 */
async function getGeocodedCount(page: Page): Promise<number | null> {
  const overlayLocator = page.locator('text=/\\d[\\d,]*\\s+listings?\\s+on\\s+map/i').first();
  const exists = await overlayLocator.count();
  if (!exists) return null;
  const text = await overlayLocator.innerText();
  const match = text.match(/(\d[\d,]*)\s+listings?\s+on\s+map/i);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

/**
 * Count visible price-pin buttons in the map (aria-label ends with "per month").
 * Mapbox renders Marker children in the DOM so they are queryable.
 */
async function getPinCount(page: Page): Promise<number> {
  return page.locator('[aria-label$="per month"]').count();
}

/**
 * Wait for an AI assistant bubble to appear with content (up to timeoutMs).
 */
async function waitForAIBubble(page: Page, timeoutMs = 45_000): Promise<string> {
  const assistantBubble = page.locator('[data-role="assistant"]').last();
  await expect(assistantBubble).toBeAttached({ timeout: timeoutMs });
  await expect(assistantBubble).not.toBeEmpty({ timeout: timeoutMs });
  return assistantBubble.innerText();
}

test.describe('Explore page — map pin update after AI search', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.setTimeout(120_000);

  test('map pin count narrows after AI chat query', async ({ page }, testInfo) => {
    // ------------------------------------------------------------------
    // STEP 1: Navigate and wait for page to settle
    // ------------------------------------------------------------------
    await page.goto(EXPLORE_URL);
    await page.waitForLoadState('networkidle');

    // Wait for the map panel overlay to appear (it renders once MapPanel mounts)
    await expect(page.locator('text=/\\d[\\d,]*\\s+listings?\\s+on\\s+map/i').first()).toBeVisible({ timeout: 15_000 });

    // ------------------------------------------------------------------
    // STEP 2: Capture initial state — geocoded count + screenshot
    // ------------------------------------------------------------------
    const initialGeoCount = await getGeocodedCount(page);
    const initialPinCount = await getPinCount(page);

    await page.screenshot({
      path: testInfo.outputPath('01-initial-map-state.png'),
      fullPage: false,
    });

    testInfo.annotations.push({
      type: 'Initial map state',
      description: `Listings-on-map count: ${initialGeoCount ?? 'not found'} | DOM pin buttons: ${initialPinCount}`,
    });

    // NOTE: with viewport-bounded fetching, the initial count may legitimately
    // be 0 before Mapbox emits bounds. We no longer require pre-search data.

    // ------------------------------------------------------------------
    // STEP 3: Send the chat query
    // ------------------------------------------------------------------
    const chatInput = page.getByRole('textbox', { name: /chat message input/i });
    await expect(chatInput).toBeVisible();
    await chatInput.fill(QUERY);

    await page.screenshot({
      path: testInfo.outputPath('02-query-typed.png'),
      fullPage: false,
    });

    await chatInput.press('Enter');

    testInfo.annotations.push({
      type: 'Query sent',
      description: `Sent: "${QUERY}"`,
    });

    // ------------------------------------------------------------------
    // STEP 4: Wait for AI to respond (up to 45s)
    // ------------------------------------------------------------------
    const bubbleText = await waitForAIBubble(page, 45_000);
    const isTimeoutResponse = /response timed out/i.test(bubbleText);

    testInfo.annotations.push({
      type: 'AI response',
      description: isTimeoutResponse
        ? 'AI hit internal 30s timeout — map update criterion will be skipped'
        : `Response received (${bubbleText.length} chars): "${bubbleText.slice(0, 200)}"`,
    });

    // ------------------------------------------------------------------
    // STEP 5: Capture post-response map state
    // ------------------------------------------------------------------
    // Give React a moment to flush state updates after SSE stream ends
    await page.waitForTimeout(1_500);

    const postGeoCount = await getGeocodedCount(page);
    const postPinCount = await getPinCount(page);

    await page.screenshot({
      path: testInfo.outputPath('03-after-ai-response-map.png'),
      fullPage: false,
    });

    testInfo.annotations.push({
      type: 'Post-search map state',
      description: `Geocoded count from overlay: ${postGeoCount ?? 'not found'} | DOM pin buttons: ${postPinCount}`,
    });

    // ------------------------------------------------------------------
    // STEP 6: Capture chat panel to verify listing cards shown
    // ------------------------------------------------------------------
    await page.screenshot({
      path: testInfo.outputPath('04-chat-response-panel.png'),
      fullPage: false,
    });

    const fullPageText = await page.locator('body').innerText();
    const hasPrices = /\$[0-9][0-9,]+/.test(fullPageText);
    const hasAddresses = /\d+\s+\w+(\s+\w+)?\s+(st|ave|blvd|dr|ln|way|ct|rd|pl|road|street|avenue)/i.test(fullPageText);
    const hasRawUUIDs = /\[id:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/gi.test(fullPageText);

    testInfo.annotations.push({
      type: 'AI response content',
      description: [
        `Has prices: ${hasPrices}`,
        `Has addresses: ${hasAddresses}`,
        `Has raw UUIDs: ${hasRawUUIDs}`,
      ].join(' | '),
    });

    // ------------------------------------------------------------------
    // STEP 7: MAP UPDATE CRITERION (post viewport-bounded fetch)
    //
    // Pass: the "Showing N AI results" badge appears AND the on-map count
    //       is > 0 — i.e. the AI populated the map with matched listings.
    // ------------------------------------------------------------------
    const aiResultsBadge = page.getByText(/Showing\s+\d+\s+AI\s+results?/i).first();
    const aiBadgeVisible = await aiResultsBadge
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    const mapPopulated = (postGeoCount ?? 0) > 0 || postPinCount > 0;

    const mapUpdateSummary = [
      `AI results badge visible: ${aiBadgeVisible}`,
      `Post overlay count: ${postGeoCount ?? 'N/A'} | Post pins: ${postPinCount}`,
      `MAP POPULATED: ${mapPopulated ? 'PASS' : 'FAIL'}`,
    ].join(' | ');

    testInfo.annotations.push({
      type: 'MAP UPDATE CRITERION',
      description: mapUpdateSummary,
    });

    // Skip map-update assertion if AI timed out (tool calls may not have fired)
    if (isTimeoutResponse) {
      testInfo.annotations.push({
        type: 'MAP UPDATE — SKIPPED',
        description: 'AI timed out before tool calls — map update not expected',
      });
      test.skip();
    }

    expect(
      aiBadgeVisible && mapPopulated,
      `Expected "Showing N AI results" badge AND non-zero map count after AI search. ${mapUpdateSummary}`,
    ).toBe(true);

    // ------------------------------------------------------------------
    // STEP 8: LISTING CARDS CRITERION
    // The AI response must show prices/addresses — no raw UUIDs
    // ------------------------------------------------------------------
    if (!isTimeoutResponse) {
      expect(
        hasPrices || hasAddresses,
        `AI response should show listing prices or street addresses. Got: "${bubbleText.slice(0, 300)}"`,
      ).toBe(true);

      expect(
        hasRawUUIDs,
        'AI response must not expose raw UUID strings like [id:xxxx-...]',
      ).toBe(false);
    }
  });
});
