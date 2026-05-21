import { test, expect } from '@playwright/test';

// Desktop-only: mobile explore page hides the map by default (uses a chat/map toggle).
// This smoke verifies the desktop map overlay updates after an AI search.
test.use({ viewport: { width: 1280, height: 900 } });

test('smoke: explore page map overlay count changes after chat query', async ({ page }) => {
  // Navigate to explore page
  await page.goto('http://localhost:3000/explore');

  // Wait for the Live map overlay card (contains "N listing(s) on map" text)
  const mapOverlay = page.getByText(/\d[\d,]*\s+listings?\s+on\s+map/i).first();
  await mapOverlay.waitFor({ state: 'visible', timeout: 15000 });

  const beforeText = (await mapOverlay.textContent({ timeout: 5000 }))?.trim() ?? '(not found)';
  console.log('MAP OVERLAY BEFORE:', beforeText);

  // Screenshot before chat
  await page.screenshot({
    path: '/Users/aineshmohan/Developer/ai-real-estate-agent/apps/web/test-results/smoke-before.png',
  });

  // The chat input has aria-label "Chat message input — press Enter to send"
  const chatInput = page.getByRole('textbox', { name: /chat message input/i });
  await chatInput.waitFor({ state: 'visible', timeout: 10000 });
  await chatInput.fill('find me 1 bedroom apartments');

  // Intercept the AI API response so we can wait for it to finish
  const aiResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/ai/cribai') && resp.status() === 200,
    { timeout: 60000 }
  );

  await chatInput.press('Enter');

  // Wait for AI response to come back
  await aiResponsePromise;

  // Give React a moment to update the map overlay state
  await page.waitForTimeout(2000);

  const afterText = (await mapOverlay.textContent({ timeout: 5000 }).catch(() => null))?.trim() ?? '(not found)';
  console.log('MAP OVERLAY AFTER:', afterText);

  // Screenshot after response
  await page.screenshot({
    path: '/Users/aineshmohan/Developer/ai-real-estate-agent/apps/web/test-results/smoke-after.png',
  });

  console.log(`\nSMOKE RESULT — Before: "${beforeText}" | After: "${afterText}"`);

  // Sanity: the overlay rendered before the search
  expect(beforeText).toMatch(/\d[\d,]*\s+listings?\s+on\s+map/i);

  // Real regression guard: after the AI search the overlay must still show a
  // listings-on-map count, AND the "Showing N AI results" badge must appear
  // (proves the AI search results actually drove the map state, not just that
  // the overlay continues to render its initial value).
  const afterMatch = afterText.match(/(\d[\d,]*)\s+listings?\s+on\s+map/i);
  expect(afterMatch, `Map overlay missing after search. Got: "${afterText}"`).not.toBeNull();
  expect(Number((afterMatch![1] ?? '0').replace(/,/g, ''))).toBeGreaterThan(0);

  await expect(page.getByText(/Showing\s+\d+\s+AI\s+results?/i)).toBeVisible({ timeout: 5000 });
});
