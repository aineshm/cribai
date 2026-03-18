import { test, expect, type Page } from '@playwright/test';

/**
 * E2E test — Explore page map-pin update after AI chat search
 *
 * Goal: Verify that after the user sends a chat query ("find me 2 bedroom
 * apartments under $2000"), the map panel updates to show only AI-matched
 * listings (fewer pins / narrowed count) rather than the full dataset.
 *
 * Key selectors:
 *  - Map panel info overlay: text matching /\d+ geocoded matches/
 *    (rendered in MapPanel.tsx: "{geoListings.length} geocoded matches syncing with your filters")
 *  - Map price-pin buttons: aria-label containing "per month"
 *  - Chat input: role="textbox", name=/chat message input/i
 *  - AI response bubble: .bg-gray-100\/80 (assistant message)
 *
 * Pass criterion for map update:
 *   The geocoded-match count OR the visible price-pin count decreases after
 *   the AI responds — i.e. the map is narrowed to matched listings.
 *
 * NOTE: At time of writing, ExploreClient does NOT wire the onMapListings
 * callback from CribAIChat to MapPanel. This test will therefore report
 * FAIL on the map-update criterion and serve as a regression guard once the
 * wiring is added.
 */

const EXPLORE_URL = '/explore';
const QUERY = 'find me 2 bedroom apartments under $2000';

/**
 * Parse "N geocoded matches" count from the map panel overlay text.
 * Returns null if the text is not found.
 */
async function getGeocodedCount(page: Page): Promise<number | null> {
  const overlayLocator = page.locator('text=/geocoded matches/i').first();
  const exists = await overlayLocator.count();
  if (!exists) return null;
  const text = await overlayLocator.innerText();
  const match = text.match(/(\d[\d,]*)\s+geocoded/i);
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
  const assistantBubble = page.locator('.bg-gray-100\\/80').last();
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
    await expect(page.locator('text=/geocoded matches/i').first()).toBeVisible({ timeout: 15_000 });

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
      description: `Geocoded count from overlay: ${initialGeoCount ?? 'not found'} | DOM pin buttons: ${initialPinCount}`,
    });

    // The map must be rendering some listings initially
    const hasInitialData = (initialGeoCount !== null && initialGeoCount > 0) || initialPinCount > 0;
    expect(hasInitialData, 'Map should have listings visible before any search').toBe(true);

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
    // STEP 7: MAP UPDATE CRITERION
    //
    // Pass: post-search geocoded count is less than initial count, OR
    //       post-search pin count is less than initial pin count.
    //
    // This tests whether ExploreClient wires onMapListings → MapPanel.
    // Currently it does NOT (onMapListings is not passed to CribAIChat),
    // so we expect this to FAIL as a regression sentinel.
    // ------------------------------------------------------------------
    const geocodedCountDecreased =
      initialGeoCount !== null &&
      postGeoCount !== null &&
      postGeoCount < initialGeoCount;

    const pinCountDecreased =
      initialPinCount > 0 &&
      postPinCount < initialPinCount;

    const mapUpdated = geocodedCountDecreased || pinCountDecreased;

    const mapUpdateSummary = [
      `Initial geocoded: ${initialGeoCount ?? 'N/A'} → Post: ${postGeoCount ?? 'N/A'} (decreased: ${geocodedCountDecreased})`,
      `Initial pins: ${initialPinCount} → Post: ${postPinCount} (decreased: ${pinCountDecreased})`,
      `MAP UPDATE: ${mapUpdated ? 'PASS' : 'FAIL'}`,
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
      mapUpdated,
      `Map pin count did not narrow after AI search. ${mapUpdateSummary}. ` +
      `This means ExploreClient is not wiring onMapListings from CribAIChat to MapPanel. ` +
      `Fix: add onMapListings handler to ExploreClient that calls setListings(matched).`,
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
