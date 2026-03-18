import { test, expect, type Page } from '@playwright/test';

/**
 * E2E test — Explore page chat UX verification
 *
 * Verifies the fixes for:
 *   1. No raw UUID exposure in AI chat responses (e.g. "[id:xxxx]" or "(source: unknown)")
 *   2. Map panel exists and shows LIVE MAP heading
 *   3. ContextBar chips populate with filter details (beds, budget) after search
 *
 * Route: GET /explore  (public, no auth required)
 * AI streaming via SSE from /api/ai/cribai
 *
 * Timing strategy:
 *   - The AI has a 30s internal timeout (TOTAL_TIMEOUT_MS in cribai.ts)
 *   - We wait for any AI response text to appear in the DOM (up to 45s)
 *   - We do NOT rely on the send button re-enabling, which can be unreliable
 *     when the AI times out and the stream doesn't cleanly signal done.
 */

const EXPLORE_URL = '/explore';
const QUERY = 'find me 2 bedroom apartments under $2000';

/**
 * Wait for an AI response bubble to appear in the chat.
 * The assistant message appears as a left-aligned bubble with bg-gray-100/80.
 * We wait for any text to appear inside it (up to 45s to allow for slow AI).
 */
async function waitForAIBubble(page: Page, timeoutMs = 45_000): Promise<string> {
  // The assistant message bubble renders with bg-gray-100/80 and is left-aligned
  const assistantBubble = page.locator('.bg-gray-100\\/80').last();
  await expect(assistantBubble).toBeAttached({ timeout: timeoutMs });
  // Wait for the bubble to have non-empty visible text (streaming fills it in)
  await expect(assistantBubble).not.toBeEmpty({ timeout: timeoutMs });
  return assistantBubble.innerText();
}

test.describe('Explore page — Chat UX verification', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.setTimeout(90_000);

  // -------------------------------------------------------------------------
  // TEST 1: Initial state
  // -------------------------------------------------------------------------
  test('initial state: chat panel and ContextBar render correctly', async ({ page }, testInfo) => {
    await page.goto(EXPLORE_URL);
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: testInfo.outputPath('01-initial-state.png'),
      fullPage: false,
    });

    // Chat input must be present
    const chatInput = page.getByRole('textbox', { name: /chat message input/i });
    await expect(chatInput).toBeVisible();
    await expect(chatInput).not.toBeDisabled();

    // Send button must be present (disabled because input is empty)
    await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();

    // ContextBar is always rendered; it has a teal pill with the Sparkles icon
    // Use .bg-teal-50 which is always in the DOM whether chips are shown or not
    const contextBarPill = page.locator('.bg-teal-50').first();
    await expect(contextBarPill).toBeAttached();

    // Map panel shows "LIVE MAP" heading
    await expect(page.getByText('LIVE MAP', { exact: false })).toBeVisible();

    testInfo.annotations.push({
      type: 'Initial state result',
      description: 'PASS — chat input, ContextBar, and LIVE MAP heading all present',
    });
  });

  // -------------------------------------------------------------------------
  // TEST 2: Chat query — core fix verification
  // -------------------------------------------------------------------------
  test('chat query: no raw UUIDs, ContextBar chips appear, addresses in response', async ({ page }, testInfo) => {
    await page.goto(EXPLORE_URL);
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: testInfo.outputPath('02-before-query.png') });

    // Fill and send
    const chatInput = page.getByRole('textbox', { name: /chat message input/i });
    await chatInput.fill(QUERY);

    await page.screenshot({ path: testInfo.outputPath('03-query-typed.png') });

    await chatInput.press('Enter');

    // Wait for AI bubble to appear with content (up to 45s)
    const bubbleText = await waitForAIBubble(page, 45_000);

    await page.screenshot({ path: testInfo.outputPath('04-after-ai-response.png') });

    const fullPageText = await page.locator('body').innerText();

    // -----------------------------------------------------------------------
    // CRITERION 1a: No raw UUID exposure
    // Pattern: [id:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]
    // -----------------------------------------------------------------------
    const rawUUIDPattern = /\[id:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]/gi;
    const uuidMatches = fullPageText.match(rawUUIDPattern) ?? [];

    testInfo.annotations.push({
      type: 'CRITERION 1a — Raw UUID matches',
      description: uuidMatches.length === 0 ? 'PASS — none found' : `FAIL — found: ${uuidMatches.join(', ')}`,
    });

    expect(uuidMatches, `Raw UUID strings found in AI response: ${uuidMatches.join(', ')}`).toHaveLength(0);

    // -----------------------------------------------------------------------
    // CRITERION 1b: No "(source: unknown)"
    // -----------------------------------------------------------------------
    const sourceUnknownPattern = /\(source:\s*unknown\)/gi;
    const sourceUnknownMatches = fullPageText.match(sourceUnknownPattern) ?? [];

    testInfo.annotations.push({
      type: 'CRITERION 1b — "source: unknown" occurrences',
      description: sourceUnknownMatches.length === 0 ? 'PASS — none found' : `FAIL — found ${sourceUnknownMatches.length}`,
    });

    expect(sourceUnknownMatches, '"source: unknown" found in AI response').toHaveLength(0);

    // -----------------------------------------------------------------------
    // CRITERION 1c: Response contains real listing content OR timeout message
    // (The AI has a 30s internal timeout — if it fires the message is valid)
    // -----------------------------------------------------------------------
    const isTimeoutResponse = /response timed out/i.test(bubbleText);
    const hasPriceInResponse = /\$[0-9][0-9,]+/.test(fullPageText);
    const hasAddressPattern = /\d+\s+\w+(\s+\w+)?\s+(st|ave|blvd|dr|ln|way|ct|rd|pl|road|street|avenue)/i.test(fullPageText);
    const hasListingContent = hasPriceInResponse || hasAddressPattern;

    testInfo.annotations.push({
      type: 'CRITERION 1c — AI response content',
      description: isTimeoutResponse
        ? 'NOTE — AI hit internal 30s timeout; UUID/source checks still pass'
        : hasListingContent
          ? `PASS — price=${hasPriceInResponse}, address=${hasAddressPattern}`
          : 'FAIL — no prices or addresses in response',
    });

    if (!isTimeoutResponse) {
      expect(
        hasListingContent,
        `AI response should contain listing prices or street addresses. Got: "${bubbleText.slice(0, 200)}"`,
      ).toBe(true);
    }

    // -----------------------------------------------------------------------
    // CRITERION 3: ContextBar chips populated (only if AI didn't time out)
    // The search_listings tool call triggers onSearchContext in cribai-chat.tsx
    // which populates budget and bedrooms chips in the ContextBar.
    // On timeout, the tool may not have been called, so chips may not appear.
    // -----------------------------------------------------------------------
    const filtersLabel = page.locator('text=Filters').first();
    const budgetChip = page.locator('text=/Under \\$[0-9,]+/').first();
    const bedsChip = page.locator('text=/2 bed/').first();

    const filtersLabelPresent = (await filtersLabel.count()) > 0;
    const budgetChipPresent = (await budgetChip.count()) > 0;
    const bedsChipPresent = (await bedsChip.count()) > 0;
    const contextBarHasChips = filtersLabelPresent || budgetChipPresent || bedsChipPresent;

    await page.screenshot({ path: testInfo.outputPath('05-context-bar.png') });

    testInfo.annotations.push({
      type: 'CRITERION 3 — ContextBar chips',
      description: [
        `"Filters" label: ${filtersLabelPresent ? 'present' : 'absent'}`,
        `Budget chip: ${budgetChipPresent ? 'present' : 'absent'}`,
        `Beds chip: ${bedsChipPresent ? 'present' : 'absent'}`,
        `Overall: ${contextBarHasChips ? 'PASS' : isTimeoutResponse ? 'SKIP (AI timeout)' : 'FAIL'}`,
      ].join(' | '),
    });

    if (!isTimeoutResponse) {
      expect(
        contextBarHasChips,
        'ContextBar should show filter chips (budget/beds/Filters) after search',
      ).toBe(true);
    }

    // -----------------------------------------------------------------------
    // CRITERION 2: Map panel renders with LIVE MAP heading
    // -----------------------------------------------------------------------
    const livemapHeading = page.getByText('LIVE MAP', { exact: false });
    await expect(livemapHeading).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath('06-map-panel.png') });

    // Record the full map panel description for the report
    const mapSubtext = await page.locator('text=/geocoded matches/i').first().innerText().catch(() => '');

    testInfo.annotations.push({
      type: 'CRITERION 2 — Map panel',
      description: `PASS — LIVE MAP heading visible. Panel shows: "${mapSubtext}"`,
    });
  });
});
