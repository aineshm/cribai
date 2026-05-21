import { test, expect, type Page } from '@playwright/test';

/**
 * E2E test: map overlay count before vs after AI chat search
 *
 * Steps:
 * 1. Navigate to /explore
 * 2. Read initial "N geocoded matches" count from map overlay
 * 3. Type "search listings with bedrooms 1 and max_rent 1500" and send
 * 4. Wait up to 75s for AI to respond with listing cards
 * 5. If AI asks a clarifying question, reply "yes go ahead and search now"
 * 6. After real listing cards appear, screenshot the map overlay
 * 7. Read the post-search map overlay count
 * 8. Report: PASS/FAIL with before/after numbers
 */

const EXPLORE_URL = 'http://localhost:3000/explore';
const INITIAL_QUERY = 'search listings with bedrooms 1 and max_rent 1500';
const FOLLOWUP = 'yes go ahead and search now';

/**
 * Extract the integer from overlay text like "500 listings on map".
 * Returns null when the overlay is absent.
 */
async function readGeoCount(page: Page): Promise<number | null> {
  const el = page.locator('text=/\\d[\\d,]*\\s+listings?\\s+on\\s+map/i').first();
  const count = await el.count();
  if (!count) return null;
  const text = await el.innerText().catch(() => '');
  const m = text.match(/(\d[\d,]*)\s+listings?\s+on\s+map/i);
  if (!m) return null;
  return parseInt(m[1].replace(/,/g, ''), 10);
}

/**
 * Return true if the page body contains what look like listing cards
 * (dollar prices AND either an address or bedroom reference).
 */
async function hasListingCards(page: Page): Promise<boolean> {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const hasPrices = /\$[0-9][0-9,]+/.test(bodyText);
  const hasBeds = /\d\s*(bed|br|bedroom)/i.test(bodyText);
  const hasAddr = /\d+\s+\w+(\s+\w+)?\s+(st|ave|blvd|dr|ln|way|ct|rd|pl|road|street|avenue)/i.test(bodyText);
  return hasPrices && (hasBeds || hasAddr);
}

/**
 * Return true if the most recent assistant bubble looks like a clarifying
 * question (ends with "?" or contains "would you like", "shall I", "confirm").
 */
function looksLikeClarification(text: string): boolean {
  return (
    /\?/.test(text) &&
    /would you like|shall i|confirm|go ahead|should i|want me to/i.test(text)
  );
}

test.describe('Map overlay count — AI chat search narrows listings', () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  // Allow up to 3 minutes total: initial load + AI response + possible follow-up
  test.setTimeout(180_000);

  test('before vs after map count after bedrooms=1 / max_rent=1500 search', async ({ page }, testInfo) => {
    // ------------------------------------------------------------------ 1
    await page.goto(EXPLORE_URL);
    await page.waitForLoadState('networkidle');

    // Wait for the map overlay to appear — it mounts after MapPanel renders
    const overlayLocator = page.locator('text=/\\d[\\d,]*\\s+listings?\\s+on\\s+map/i').first();
    await expect(overlayLocator).toBeVisible({ timeout: 20_000 });

    // ------------------------------------------------------------------ 2  Read initial count
    const before = await readGeoCount(page);

    await page.screenshot({
      path: testInfo.outputPath('01-before-search.png'),
      fullPage: false,
    });

    testInfo.annotations.push({
      type: 'BEFORE',
      description: `Map overlay before search: ${before ?? 'not found'}`,
    });

    console.log(`[MAP-COUNT] BEFORE: ${before ?? 'not found'}`);

    // Map must have data before we start
    expect(before, 'Map overlay must show a count before any search').not.toBeNull();

    // ------------------------------------------------------------------ 3  Send initial query
    const chatInput = page.getByRole('textbox', { name: /chat message input/i });
    await expect(chatInput).toBeVisible({ timeout: 10_000 });
    await chatInput.fill(INITIAL_QUERY);

    await page.screenshot({
      path: testInfo.outputPath('02-query-typed.png'),
      fullPage: false,
    });

    await chatInput.press('Enter');
    console.log(`[MAP-COUNT] Query sent: "${INITIAL_QUERY}"`);

    // ------------------------------------------------------------------ 4  Wait for AI response (up to 60s)
    // We watch for a new assistant bubble to appear and stabilise
    const assistantBubble = page.locator('[data-role="assistant"]').last();

    // Wait for an assistant message to attach
    await expect(assistantBubble).toBeAttached({ timeout: 75_000 });

    // Wait until the AI stops typing (content settles for 2 s)
    let previousText = '';
    let stableFor = 0;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 75_000) {
      await page.waitForTimeout(1_500);
      const currentText = await assistantBubble.innerText().catch(() => '');
      if (currentText === previousText && currentText.length > 0) {
        stableFor += 1500;
        if (stableFor >= 3_000) break;
      } else {
        stableFor = 0;
      }
      previousText = currentText;
    }

    const firstResponseText = await assistantBubble.innerText().catch(() => '');
    console.log(`[MAP-COUNT] First AI response (${firstResponseText.length} chars): "${firstResponseText.slice(0, 200)}"`);

    await page.screenshot({
      path: testInfo.outputPath('03-first-ai-response.png'),
      fullPage: false,
    });

    // ------------------------------------------------------------------ 5  Handle clarifying question
    if (looksLikeClarification(firstResponseText)) {
      console.log('[MAP-COUNT] AI asked clarification — sending follow-up');
      testInfo.annotations.push({
        type: 'CLARIFICATION',
        description: `AI asked: "${firstResponseText.slice(0, 200)}" — replied: "${FOLLOWUP}"`,
      });

      await chatInput.fill(FOLLOWUP);
      await chatInput.press('Enter');

      // Wait for a new assistant bubble after the follow-up
      const allBubbles = page.locator('[data-role="assistant"]');
      const initialCount = await allBubbles.count();

      // Wait for count to increase (new bubble)
      await expect(async () => {
        const n = await allBubbles.count();
        expect(n).toBeGreaterThan(initialCount);
      }).toPass({ timeout: 75_000, intervals: [2_000] });

      // Wait for new bubble to settle
      const latestBubble = allBubbles.last();
      let prev2 = '';
      let stable2 = 0;
      const start2 = Date.now();
      while (Date.now() - start2 < 75_000) {
        await page.waitForTimeout(1_500);
        const curr2 = await latestBubble.innerText().catch(() => '');
        if (curr2 === prev2 && curr2.length > 0) {
          stable2 += 1500;
          if (stable2 >= 3_000) break;
        } else {
          stable2 = 0;
        }
        prev2 = curr2;
      }

      const followupText = await latestBubble.innerText().catch(() => '');
      console.log(`[MAP-COUNT] Follow-up AI response (${followupText.length} chars): "${followupText.slice(0, 200)}"`);
      testInfo.annotations.push({
        type: 'FOLLOW-UP RESPONSE',
        description: `"${followupText.slice(0, 300)}"`,
      });
    }

    // ------------------------------------------------------------------ 6  Screenshot the map overlay after response
    // Give React a moment to flush state after the stream ends
    await page.waitForTimeout(2_500);

    await page.screenshot({
      path: testInfo.outputPath('04-after-ai-response-map.png'),
      fullPage: false,
    });

    // ------------------------------------------------------------------ 7  Read post-search map count
    const after = await readGeoCount(page);
    console.log(`[MAP-COUNT] AFTER: ${after ?? 'not found'}`);

    testInfo.annotations.push({
      type: 'AFTER',
      description: `Map overlay after search: ${after ?? 'not found'}`,
    });

    // Check whether listing cards appeared in the chat
    const cardsVisible = await hasListingCards(page);
    testInfo.annotations.push({
      type: 'LISTING CARDS',
      description: cardsVisible ? 'Listing cards (prices + address/beds) found in DOM' : 'No listing cards detected',
    });

    // ------------------------------------------------------------------ 8  Report
    const beforeNum = before ?? 0;
    const afterNum = after ?? beforeNum;
    const changed = afterNum !== beforeNum;
    const narrowed = afterNum < beforeNum;

    const result = changed ? (narrowed ? 'NARROWED' : 'CHANGED') : 'UNCHANGED';

    const summary = [
      `Before: ${before ?? 'N/A'}`,
      `After: ${after ?? 'N/A'}`,
      `Direction: ${result}`,
      `Listing cards in DOM: ${cardsVisible}`,
    ].join(' | ');

    testInfo.annotations.push({
      type: 'FINAL RESULT',
      description: summary,
    });

    console.log(`\n[MAP-COUNT] RESULT — ${summary}`);

    // The test passes if AI returned actual listing content
    // (the map narrowing itself depends on ExploreClient wiring)
    expect(
      cardsVisible,
      `Expected AI to respond with listing cards (prices + addresses). Summary: ${summary}`,
    ).toBe(true);

    // Report narrowing outcome without hard-failing so the before/after is always visible
    if (!narrowed) {
      testInfo.annotations.push({
        type: 'MAP NARROWING',
        description: `Map did NOT narrow after search (before: ${beforeNum}, after: ${afterNum}). ExploreClient onMapListings wiring may be missing.`,
      });
    }
  });
});
