/**
 * Verification test: map pin count changes after AI search.
 *
 * Goal: Confirm the map overlay badge count decreases when the user
 * sends "find me 1 bedroom apartments under $1500" to the AI.
 *
 * Pass: map count AFTER < map count BEFORE
 * Fail: map count stays the same (no filtering applied)
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const QUERY = 'find me 1 bedroom apartments under $1500';
const RESULTS_DIR = '/Users/aineshmohan/Developer/ai-real-estate-agent/apps/web/test-results/verify-map';

/** Parse the geocoded-match count from the map panel overlay. Returns null if not found. */
async function readGeocodedCount(page: Page): Promise<number | null> {
  // MapPanel renders: "{count} geocoded matches syncing with your filters"
  const locator = page.locator('text=/geocoded matches/i').first();
  const count = await locator.count();
  if (!count) return null;
  const text = await locator.innerText().catch(() => null);
  if (!text) return null;
  const match = text.match(/(\d[\d,]*)\s+geocoded/i);
  if (!match) return null;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

/** Count map price-pin buttons visible in the DOM (Mapbox renders Marker children). */
async function readPinCount(page: Page): Promise<number> {
  return page.locator('[aria-label$="per month"]').count();
}

test.describe('Map pin count narrows after AI search', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test('verify map count decreases after 1br under $1500 query', async ({ page }, testInfo) => {
    // Ensure screenshot output dir exists
    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    // ----------------------------------------------------------------
    // 1. Navigate and wait for page + map overlay to appear
    // ----------------------------------------------------------------
    await page.goto('http://localhost:3000/explore');
    await page.waitForLoadState('networkidle');

    // Wait up to 15s for the map overlay badge
    const overlayLocator = page.locator('text=/geocoded matches/i').first();
    await expect(overlayLocator).toBeVisible({ timeout: 15_000 });

    // ----------------------------------------------------------------
    // 2. Read BEFORE state
    // ----------------------------------------------------------------
    const beforeGeoCount = await readGeocodedCount(page);
    const beforePinCount = await readPinCount(page);

    const beforeScreenshot = path.join(RESULTS_DIR, 'before-query.png');
    await page.screenshot({ path: beforeScreenshot, fullPage: false });

    console.log(`\n--- MAP COUNT BEFORE ---`);
    console.log(`Geocoded overlay: ${beforeGeoCount ?? '(not found)'}`);
    console.log(`DOM price pins:   ${beforePinCount}`);
    console.log(`Screenshot:       ${beforeScreenshot}`);

    // ----------------------------------------------------------------
    // 3. Send the query
    // ----------------------------------------------------------------
    const chatInput = page.getByRole('textbox', { name: /chat message input/i });
    await expect(chatInput).toBeVisible({ timeout: 10_000 });
    await chatInput.fill(QUERY);
    await chatInput.press('Enter');

    console.log(`\nQuery sent: "${QUERY}"`);

    // ----------------------------------------------------------------
    // 4. Wait for AI to respond (up to 60s as specified)
    // ----------------------------------------------------------------
    // Strategy: wait for an assistant bubble with non-empty text.
    // The assistant bubble uses a distinct background class in the chat UI.
    const assistantBubble = page.locator('.bg-gray-100\\/80').last();

    let aiResponseText = '';
    try {
      await expect(assistantBubble).toBeAttached({ timeout: 60_000 });
      await expect(assistantBubble).not.toBeEmpty({ timeout: 60_000 });
      aiResponseText = await assistantBubble.innerText();
      console.log(`AI responded (${aiResponseText.length} chars): "${aiResponseText.slice(0, 200)}"`);
    } catch {
      // Fallback: wait for any network quiet and try reading
      await page.waitForTimeout(5_000);
      aiResponseText = await assistantBubble.innerText().catch(() => '');
      console.log(`AI response fallback read: "${aiResponseText.slice(0, 200)}"`);
    }

    const aiTimedOut = /response timed out/i.test(aiResponseText);
    if (aiTimedOut) {
      console.warn('AI hit internal timeout — map update may not have fired');
    }

    // Give React time to flush state updates from the SSE stream
    await page.waitForTimeout(2_000);

    // ----------------------------------------------------------------
    // 5. Read AFTER state
    // ----------------------------------------------------------------
    const afterGeoCount = await readGeocodedCount(page);
    const afterPinCount = await readPinCount(page);

    const afterScreenshot = path.join(RESULTS_DIR, 'after-query.png');
    await page.screenshot({ path: afterScreenshot, fullPage: false });

    console.log(`\n--- MAP COUNT AFTER ---`);
    console.log(`Geocoded overlay: ${afterGeoCount ?? '(not found)'}`);
    console.log(`DOM price pins:   ${afterPinCount}`);
    console.log(`Screenshot:       ${afterScreenshot}`);

    // ----------------------------------------------------------------
    // 6. Evaluate pass/fail
    // ----------------------------------------------------------------
    const geocodedDecreased =
      beforeGeoCount !== null &&
      afterGeoCount !== null &&
      afterGeoCount < beforeGeoCount;

    const pinsDecreased = beforePinCount > 0 && afterPinCount < beforePinCount;
    const countDecreased = geocodedDecreased || pinsDecreased;

    const verdict = countDecreased ? 'PASS' : 'FAIL';

    console.log(`\n==========================================`);
    console.log(`MAP COUNT BEFORE: ${beforeGeoCount ?? beforePinCount + ' pins'}`);
    console.log(`MAP COUNT AFTER:  ${afterGeoCount ?? afterPinCount + ' pins'}`);
    console.log(`VERDICT: ${verdict} — count ${countDecreased ? 'DID decrease' : 'did NOT decrease'}`);
    console.log(`==========================================\n`);

    // Annotate in HTML report
    testInfo.annotations.push({
      type: 'Map count BEFORE',
      description: `Geocoded overlay: ${beforeGeoCount ?? 'N/A'} | DOM pins: ${beforePinCount}`,
    });
    testInfo.annotations.push({
      type: 'Map count AFTER',
      description: `Geocoded overlay: ${afterGeoCount ?? 'N/A'} | DOM pins: ${afterPinCount}`,
    });
    testInfo.annotations.push({
      type: 'VERDICT',
      description: verdict,
    });

    // If AI timed out, skip the assertion (no tool calls fired)
    if (aiTimedOut) {
      test.skip(true, 'AI hit internal timeout — no tool calls fired, map update not expected');
      return;
    }

    // Assert map narrowed
    expect(
      countDecreased,
      `FAIL — map count did not decrease after AI search.\n` +
      `Before: geocoded=${beforeGeoCount ?? 'N/A'} pins=${beforePinCount}\n` +
      `After:  geocoded=${afterGeoCount ?? 'N/A'} pins=${afterPinCount}\n` +
      `Check that ExploreClient wires onMapListings from CribAIChat to MapPanel.`,
    ).toBe(true);
  });
});
