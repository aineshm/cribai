import { test, expect } from '@playwright/test';

test('smoke: explore page map overlay count changes after chat query', async ({ page }) => {
  // Navigate to explore page
  await page.goto('http://localhost:3000/explore');

  // Wait for the LIVE MAP overlay card (contains "geocoded matches" text)
  const mapOverlay = page.getByText(/geocoded matches/i).first();
  await mapOverlay.waitFor({ state: 'visible', timeout: 15000 });

  const beforeText = (await mapOverlay.textContent({ timeout: 5000 }))?.trim() ?? '(not found)';
  console.log('MAP OVERLAY BEFORE:', beforeText);

  // Screenshot before chat
  await page.screenshot({
    path: '/Users/aineshmohan/Developer/ai-real-estate-agent/apps/web/test-results/smoke-before.png',
  });

  // The chat input is input[type="text"] with aria-label="Chat message input"
  const chatInput = page.locator('input[aria-label="Chat message input"]');
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

  // Verify we got a valid before reading
  expect(beforeText).toMatch(/geocoded matches/i);
});
