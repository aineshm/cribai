import { test, expect, type Page } from '@playwright/test';
import { findActiveListingId } from './utils/find-listing';
import {
  countPendingTourRequests,
  deleteConversation,
  deletePendingTourRequests,
  getMostRecentConversationId,
  waitForConversationState,
  waitForPendingActionKind,
} from './utils/db-assertions';
import { getTestUserSession, plantSession, type TestUser } from './utils/test-user-auth';

/**
 * E2E spec — AIN-32: schedule_tour two-phase HITL (preview → publish).
 *
 * Covers the contract shipped in PR #71 ("fix(schedule-tour): implement HITL
 * preview/publish gate"). The four assertions target seams that survive the
 * Day 10 (AIN-13) cutover from the deterministic runtime to the LLM-first
 * runtime — we assert on observable behavior (preview block rendered, DB
 * untouched, pendingAction cleared) rather than on the internal regex /
 * `looksLikeTour*` helpers in apps/web/lib/cribai-runtime.ts.
 *
 * Auth: the chat HITL path requires a real Supabase session because
 *   (a) /api/ai/cribai derives userId via Bearer-token decoding, and
 *   (b) the schedule_tour handler throws "must be signed in" when userId is
 *       absent (packages/ai/src/tools/handlers/schedule-tour.ts:210-212).
 * We use the same Bearer-token code path production users hit, NOT the
 * BYPASS_AUTH=true dev-cookie shortcut — that path is what Day 10 deletes.
 *
 * Listing-context priming: the deterministic runtime's
 * `resolveReferencedListingIds` (cribai-runtime.ts:213) does NOT extract
 * bare UUIDs from message text — it relies on `lastSearch.resultListingIds`
 * or `selectedListingId`. To satisfy this contract without baking the
 * implementation into the test, we use the same flow a real user does:
 *  1. Navigate to /listing/{id}
 *  2. Click "Ask AI About This Listing" — this opens the AIChatPanel Sheet
 *     with `listingIdSeed` set, so the FIRST chat message carries the
 *     structured listingId field
 *  3. Send the pre-filled prompt to get a detail turn that persists
 *     `selectedListingId` into conversation_state JSONB
 *  4. Subsequent tour messages resolve to the same listing via the
 *     persisted state — no need to repeat the listingId in each message
 *
 * Cleanup: each test deletes its tour_requests rows and (when applicable)
 * its conversation row so reruns don't FK-collide on the
 * idx_tour_requests_dedup unique index.
 *
 * Parallel safety: the four tests share user + listingId. We run them
 * serially within the describe block to avoid the race where
 * `getMostRecentConversationId` (picks most-recent conversation for the
 * user) cross-talks between tests.
 *
 * Viewport: we pin a desktop viewport via `test.use` below so the
 * listing-detail CTASidebar holds the "Ask AI About This Listing" button
 * we use to prime listing context. The HITL contract under test is the
 * server-side conversation_state / tour_requests behavior, which is
 * viewport-agnostic — the mobile-chrome project also runs this spec to
 * keep us honest if the prime-context flow ever forks per viewport.
 */

const TOUR_DATES = ['2026-06-15', '2026-06-16'];

// Matches the two transient error replies the runtime emits when Gemini
// rate-limits or any downstream stream errors out. Both surface as a single
// assistant bubble so the count-poll still satisfies; we filter on the text.
const TRANSIENT_ERROR_REGEX =
  /temporarily unavailable|something went wrong|please try again/i;

/**
 * Send a message into the chat panel and wait for the *next* assistant
 * bubble to settle. Tracks the count of assistant bubbles before submit so
 * we don't read the previous turn's reply by accident.
 *
 * Includes a small retry loop for transient Gemini rate-limit / stream-error
 * replies. The cancellation test (test 3) and any LLM-routed turn fall
 * through to Gemini, which returns 429 under load — surfaced to the chat as
 * "CribAI is temporarily unavailable..." (route.ts:814) or the catch-all
 * "Sorry, something went wrong" (cribai-chat.tsx:540). We back off and retry
 * a few times before letting the spec fail — that resilience matters both
 * for our iteration loop AND for the post-AIN-13 world where all four tests
 * go through the LLM path.
 */
async function sendChatMessage(
  page: Page,
  message: string,
  attempts = 2,
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const previousCount = await page.locator('[data-role="assistant"]').count();
    const input = page.getByRole('textbox', { name: /chat message input/i });
    await input.fill(message);
    await input.press('Enter');

    await expect
      .poll(
        async () => page.locator('[data-role="assistant"]').count(),
        { timeout: 45_000, intervals: [250, 500, 1000] },
      )
      .toBeGreaterThan(previousCount);

    const bubble = page.locator('[data-role="assistant"]').last();
    await expect(bubble).not.toBeEmpty({ timeout: 45_000 });
    const text = await bubble.innerText();
    if (!TRANSIENT_ERROR_REGEX.test(text)) {
      return text;
    }
    if (i === attempts - 1) {
      throw new Error(
        `sendChatMessage: rate-limit / transient-error retry exhausted after ${attempts} attempts. ` +
          `Last reply: ${text.slice(0, 200)}`,
      );
    }
    // Short backoff before single retry — Gemini Flash quotas typically
    // refill at the per-minute boundary, but we keep this brief so a single
    // retry stays inside the test's 180s budget. Production stream-error
    // retries should rely on the user pressing Enter again, not on us.
    await page.waitForTimeout(15_000);
  }
  // Unreachable — the loop either returns or throws.
  throw new Error('sendChatMessage: unreachable');
}

/**
 * Open the chat with listing context pre-bound.
 *
 * The flow mirrors what a real user does: navigate to /listing/{id}, click
 * the "Ask AI About This Listing" CTA (which calls setDraftListingId +
 * openChat). The CTA pre-fills the input with "Tell me about this listing
 * at {address}." — we press Enter immediately so the FIRST send carries the
 * structured listingId field (cribai-chat.tsx:331 reads pendingListingIdRef
 * which is wired from listingIdSeed → draftListingId).
 *
 * After this priming turn, the deterministic runtime persists
 * `selectedListingId` into conversation_state.JSONB, and subsequent tour
 * messages resolve via `resolveReferencedListingIds(query, state, 1)` →
 * `state.selectedListingId` (cribai-runtime.ts:235) without needing to
 * repeat the UUID.
 *
 * Note: we MUST NOT touch the input field between the CTA click and the
 * Enter press. The input's onChange (cribai-chat.tsx:664) clears
 * pendingListingIdRef whenever the trimmed value transitions to empty —
 * Playwright's `fill()` clears first, which would null the listingId
 * before send.
 */
async function primeChatWithListingContext(page: Page, listingId: string): Promise<void> {
  await page.goto(`/listing/${listingId}`, { waitUntil: 'domcontentloaded' });

  // Wait for hydration before clicking. The CTA button is rendered
  // immediately in the SSR HTML, but its onClick handler is bound only
  // after React hydrates. Clicking too early no-ops silently — the button
  // looks "active" in a snapshot but the Sheet never opens.
  //
  // networkidle waits for both the SSR streaming chunks and any client-side
  // data fetches (saved-status check, etc.) to settle. Faster but less
  // reliable: `page.waitForLoadState('load')`. We pick correctness over
  // speed here; the test budget allows it.
  await page.waitForLoadState('networkidle');

  const cta = page.getByRole('button', { name: /ask ai about this listing/i });
  await expect(cta).toBeVisible({ timeout: 15_000 });
  await expect(cta).toBeEnabled({ timeout: 5_000 });
  await cta.click();

  // The Sheet animates open with a transform; the input is visible only
  // after the animation settles. We wait on the input itself (the Sheet's
  // open state is internal React state we can't inspect directly). Retry
  // the click once if the first click missed (hydration races sometimes
  // beat the visibility wait above).
  const input = page.getByRole('textbox', { name: /chat message input/i });
  try {
    await expect(input).toBeVisible({ timeout: 8_000 });
  } catch {
    // First click likely landed before hydration completed. Try once more.
    await cta.click();
    await expect(input).toBeVisible({ timeout: 10_000 });
  }
  // Sanity: input should already have the seeded prompt. If this is empty
  // the CTA's setDraftPrompt didn't fire — surface that as the actual
  // failure rather than letting the next press(Enter) silently no-op.
  await expect(input).not.toHaveValue('', { timeout: 5_000 });

  // We can't use sendChatMessage here because that helper calls input.fill()
  // — which would clear the seeded listingId. The first turn must be sent
  // via input.press('Enter') on the pre-filled prompt.
  //
  // The priming turn is routed deterministically (cribai-runtime.ts:699-700:
  // hasExplicitListingReference("this listing") + isHighConfidenceListingDetail
  // → buildDetailTurn → get_listing_detail tool, no Gemini call), so we don't
  // need the rate-limit retry shield that sendChatMessage uses for LLM-routed
  // turns. A bare expect-poll for the next assistant bubble is enough.
  const previousCount = await page.locator('[data-role="assistant"]').count();
  await input.press('Enter');

  await expect
    .poll(
      async () => page.locator('[data-role="assistant"]').count(),
      { timeout: 60_000, intervals: [500, 1000, 1500] },
    )
    .toBeGreaterThan(previousCount);
  await expect(page.locator('[data-role="assistant"]').last())
    .not.toBeEmpty({ timeout: 45_000 });
}

test.describe('Tour HITL — schedule_tour preview/publish gate (PR #71, AIN-32)', () => {
  // Desktop viewport — listing-detail CTASidebar holds the "Ask AI About
  // This Listing" button we use to prime listing context.
  test.use({ viewport: { width: 1280, height: 900 } });
  test.setTimeout(180_000);
  // Serial mode: all four tests share user.id + listingId, and
  // getMostRecentConversationId picks the most-recently-updated
  // conversation for the user. Running them in parallel would cross-talk.
  test.describe.configure({ mode: 'serial' });

  let user: TestUser;
  let listingId: string;
  let activeConversationId: string | null = null;

  test.beforeAll(async ({ request }) => {
    user = await getTestUserSession();
    listingId = await findActiveListingId(request);
  });

  test.beforeEach(async ({ context }) => {
    activeConversationId = null;
    // Ensure no stale pending tour row from a previous failed run pins the
    // unique constraint on (user_id, listing_id, status='pending').
    await deletePendingTourRequests(user.id, listingId);
    await plantSession(context, user);
  });

  test.afterEach(async () => {
    // Per-test cleanup so reruns don't carry conversation_state forward
    // and so accumulated tour rows don't poison the unique index.
    if (activeConversationId) {
      await deleteConversation(activeConversationId).catch(() => undefined);
    }
    await deletePendingTourRequests(user.id, listingId).catch(() => undefined);
  });

  // ---------------------------------------------------------------------
  // TEST 1 — Preview phase: assistant emits structured preview, NO DB write
  // ---------------------------------------------------------------------
  test('preview phase emits tour fields without writing tour_requests row', async ({ page }) => {
    // Prime listing context via the listing-detail CTA. After this returns
    // the deterministic runtime has persisted selectedListingId so
    // subsequent tour messages don't need to embed the UUID.
    await primeChatWithListingContext(page, listingId);

    // Tour-request turn: looksLikeTourTurn matches "schedule a tour";
    // adding email + ISO date triggers the all-fields-present preview branch
    // (cribai-runtime.ts:635). On the LLM cutover the same message should
    // produce a preview via the LLM's structured-output path — the assertion
    // (preview text + no DB row) holds regardless.
    const previewMessage =
      `please schedule a tour for this listing on ${TOUR_DATES[0]} ` +
      `using e2e-tour-hitl@cribai.test`;

    const reply = await sendChatMessage(page, previewMessage);

    // ASSERTION A: a preview/confirmation bubble appeared. The runtime emits
    // a text block whose copy explicitly asks for confirmation and references
    // the proposed dates + email. We assert on those structural markers
    // (without pinning the exact phrasing — that's churn-prone).
    expect(reply.toLowerCase()).toMatch(/tour|visit|schedule/);
    expect(reply).toContain(TOUR_DATES[0]);
    expect(reply.toLowerCase()).toContain('e2e-tour-hitl@cribai.test');
    // Confirmation prompt: runtime ends with a "should I send it / reply
    // yes to confirm" cue. Match on a lenient regex so minor wording changes
    // (and the LLM-runtime's eventual phrasing) don't snap the test.
    expect(reply.toLowerCase()).toMatch(/confirm|send it|should i|reply.+yes|book it/);

    // ASSERTION B: NO tour_requests row written. The pre-test cleanup zeroed
    // this counter; only handlePublish() should ever insert.
    activeConversationId = await getMostRecentConversationId(user.id);
    const pendingState = await waitForPendingActionKind(activeConversationId, 'tour');
    expect(pendingState.pendingAction.payload?.previewConfirmedReady).toBe(true);

    const rowCount = await countPendingTourRequests(user.id, listingId);
    expect(rowCount).toBe(0);
  });

  // ---------------------------------------------------------------------
  // TEST 2 — Confirm/publish: DB write + confirmation block in chat
  // ---------------------------------------------------------------------
  test('confirmation turn writes tour_requests row and renders confirmed state', async ({ page }) => {
    await primeChatWithListingContext(page, listingId);

    // Set up preview state (same all-fields message as Test 1).
    await sendChatMessage(
      page,
      `schedule a tour for this listing on ${TOUR_DATES[0]} ` +
        `using e2e-tour-hitl@cribai.test`,
    );

    activeConversationId = await getMostRecentConversationId(user.id);
    await waitForPendingActionKind(activeConversationId, 'tour');

    // Sanity: still zero rows before the user confirms.
    expect(await countPendingTourRequests(user.id, listingId)).toBe(0);

    // Confirmation turn — bare "yes" is the canonical affirmative in
    // looksLikeTourConfirmation; production users also reach handlePublish
    // through this message.
    const confirmReply = await sendChatMessage(page, 'yes');

    // ASSERTION A: DB write happened. The handler inserts exactly one row
    // into tour_requests on the confirm turn.
    await expect
      .poll(() => countPendingTourRequests(user.id, listingId), {
        timeout: 15_000,
        intervals: [500, 1000, 1500],
      })
      .toBe(1);

    // ASSERTION B: assistant message reflects confirmed state. The handler
    // emits a `tour_confirmation` clientBlock. The UI renders it as a card —
    // we assert on its observable text affordances rather than DOM internals
    // so the assertion survives a future card redesign.
    const fullPageText = await page.locator('body').innerText();
    // The tour_confirmation card surfaces the listing address and a
    // confirmation marker. Allow either an explicit "tour confirmed" /
    // "tour requested" copy OR the presence of a pending-status badge —
    // both are stable markers across PR #71's handler output.
    expect(
      /tour\s+(request(ed|\s+submitted)?|confirmed|booked)/i.test(confirmReply) ||
        /tour\s+(request(ed|\s+submitted)?|confirmed|booked|pending)/i.test(fullPageText),
    ).toBe(true);

    // ASSERTION C: pendingAction was cleared (handlePublish unsets it).
    const finalState = await waitForPendingActionKind(activeConversationId, null);
    expect(finalState.pendingAction.kind).toBeNull();
  });

  // ---------------------------------------------------------------------
  // TEST 3 — Cancel mid-flow clears pendingAction (regression on 3dc4596)
  // ---------------------------------------------------------------------
  test('cancellation clears pendingAction without writing tour_requests', async ({ page }) => {
    await primeChatWithListingContext(page, listingId);

    // Set up the same preview state.
    await sendChatMessage(
      page,
      `schedule a tour for this listing on ${TOUR_DATES[0]} ` +
        `using e2e-tour-hitl@cribai.test`,
    );
    activeConversationId = await getMostRecentConversationId(user.id);
    await waitForPendingActionKind(activeConversationId, 'tour');

    // Cancel — looksLikeCancellationIntent matches "nevermind" anchored at
    // the start of the trimmed message (conversation-state-helpers.ts).
    // The chat will fall through to the LLM streaming branch where
    // preservePendingActionAfterLLMTurn detects the cancel intent and
    // clears pendingAction.
    await sendChatMessage(page, 'nevermind, cancel that');

    // ASSERTION A: pendingAction cleared in conversation_state JSONB.
    const clearedState = await waitForPendingActionKind(activeConversationId, null);
    expect(clearedState.pendingAction.kind).toBeNull();
    expect(clearedState.pendingAction.payload).toBeNull();

    // ASSERTION B: no DB write happened during the abandoned flow.
    expect(await countPendingTourRequests(user.id, listingId)).toBe(0);

    // ASSERTION C: a follow-up unrelated query is interpreted as a SEARCH,
    // not as a stray tour confirmation — pendingAction must stay null
    // across the next turn (the cancel did not resurrect via downstream
    // re-priming). The search itself may legitimately return zero rows on
    // some datasets, so we don't assert on result counts here — only that
    // the cleared pendingAction survives one more round-trip.
    await sendChatMessage(page, 'show me 2 bedroom apartments under 1500');
    const afterSearchState = await waitForConversationState(activeConversationId);
    expect(afterSearchState.pendingAction.kind).toBeNull();
  });

  // ---------------------------------------------------------------------
  // TEST 4 — Name-only edit (regression on 87a828d + 232ff13)
  // ---------------------------------------------------------------------
  test('name-only edit updates studentName without confirming the tour', async ({ page }) => {
    await primeChatWithListingContext(page, listingId);

    // Set up preview with a default-derived name (inferred from email).
    // The runtime's inferNameFromEmail will pull "E2E Tour Hitl" from the
    // local-part of e2e-tour-hitl@cribai.test.
    await sendChatMessage(
      page,
      `schedule a tour for this listing on ${TOUR_DATES[0]} ` +
        `using e2e-tour-hitl@cribai.test`,
    );
    activeConversationId = await getMostRecentConversationId(user.id);
    const initialState = await waitForPendingActionKind(activeConversationId, 'tour');
    const initialName = initialState.pendingAction.payload?.studentName as string | null;
    // Sanity: the runtime populated *some* name from the email.
    expect(initialName ?? '').not.toBe('');

    // Name-only edit. looksLikeTourPreviewEdit matches "use Alex" with the
    // `\buse <Capitalized>` pattern.
    await sendChatMessage(page, 'actually use Alex');

    // ASSERTION A: studentName updated to "Alex" in the pending payload.
    const updatedState = await waitForConversationState(activeConversationId);
    expect(updatedState.pendingAction.kind).toBe('tour');
    expect(updatedState.pendingAction.payload?.studentName).toBe('Alex');
    // ASSERTION B: previewConfirmedReady remains true — the edit re-previews
    // rather than starting from scratch (per the 87a828d commit message).
    expect(updatedState.pendingAction.payload?.previewConfirmedReady).toBe(true);
    // The OTHER preview fields are preserved (dates, email).
    expect(updatedState.pendingAction.payload?.extractedEmail).toBe('e2e-tour-hitl@cribai.test');
    expect(updatedState.pendingAction.payload?.extractedDates).toEqual([TOUR_DATES[0]]);

    // ASSERTION C: NO DB write — the name edit did NOT auto-confirm.
    expect(await countPendingTourRequests(user.id, listingId)).toBe(0);
  });
});
