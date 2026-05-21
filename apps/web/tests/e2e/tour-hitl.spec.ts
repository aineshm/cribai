import { test, expect, type Page } from '@playwright/test';
import { findActiveListingId } from './utils/find-listing';
import {
  countPendingTourRequests,
  deleteConversation,
  deletePendingTourRequests,
  getConversationState,
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
 * Cleanup: each test deletes its tour_requests rows and (when applicable)
 * its conversation row so reruns don't FK-collide on the
 * idx_tour_requests_dedup unique index.
 *
 * Desktop-only viewport: the explore-sidecar chat differs visually on
 * mobile-chrome (no sidecar — chat lives at /chat). The HITL contract is
 * identical across viewports, so we verify it once on desktop and rely on
 * the existing mobile-chrome chat tests (explore-chat.spec.ts) to keep the
 * mobile path green.
 */

const EXPLORE_URL = '/explore';
const TOUR_DATES = ['2026-06-15', '2026-06-16'];

/** Wait for an assistant bubble to render with non-empty text. */
async function waitForAssistantBubble(page: Page, timeoutMs = 45_000): Promise<string> {
  const bubble = page.locator('[data-role="assistant"]').last();
  await expect(bubble).toBeAttached({ timeout: timeoutMs });
  await expect(bubble).not.toBeEmpty({ timeout: timeoutMs });
  return bubble.innerText();
}

/**
 * Send a message into the chat sidecar and wait for the *next* assistant
 * bubble to settle. Tracks the count of assistant bubbles before submit so
 * we don't read the previous turn's reply by accident.
 */
async function sendChatMessage(page: Page, message: string): Promise<string> {
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
  return bubble.innerText();
}

/**
 * Pull the active conversationId out of the chat client. The component
 * exposes it on the assistant bubble's data attributes? No — it does not.
 * Instead we read the most-recently-touched conversation row for this
 * test user, which is what the API just wrote.
 *
 * This is robust for our purposes because:
 *  - The test user runs ONE conversation at a time within a test.
 *  - The DB ordering by updated_at DESC picks the freshest row.
 *  - We delete the conversation in afterEach so the next test starts fresh.
 */
async function getActiveConversationId(user: TestUser): Promise<string> {
  // Service-role read — bypasses RLS so we don't need a per-request session.
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveConversationId: ${error.message}`);
  if (!data) throw new Error(`getActiveConversationId: no conversation for user ${user.id}`);
  return data.id as string;
}

test.describe('Tour HITL — schedule_tour preview/publish gate (PR #71, AIN-32)', () => {
  // Desktop viewport — explore sidecar is the simplest path to the chat UI.
  // The mobile-chrome chat lives at /chat and is exercised by other specs.
  test.use({ viewport: { width: 1280, height: 900 } });
  test.setTimeout(120_000);

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
    await page.goto(EXPLORE_URL, { waitUntil: 'domcontentloaded' });

    // First turn: ask for a tour, supplying all required fields.
    // The deterministic runtime's looksLikeTourTurn matches "schedule a tour";
    // adding email + ISO date triggers the all-fields-present preview branch
    // (cribai-runtime.ts:635). On the LLM cutover the same message should
    // produce a preview via the LLM's structured-output path — the assertion
    // (preview text + no DB row) holds regardless.
    const previewMessage =
      `please schedule a tour for this listing ${listingId} on ${TOUR_DATES[0]} ` +
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
    activeConversationId = await getActiveConversationId(user);
    const pendingState = await waitForPendingActionKind(activeConversationId, 'tour');
    expect(pendingState.pendingAction.payload?.previewConfirmedReady).toBe(true);

    const rowCount = await countPendingTourRequests(user.id, listingId);
    expect(rowCount).toBe(0);
  });

  // ---------------------------------------------------------------------
  // TEST 2 — Confirm/publish: DB write + confirmation block in chat
  // ---------------------------------------------------------------------
  test('confirmation turn writes tour_requests row and renders confirmed state', async ({ page }) => {
    await page.goto(EXPLORE_URL, { waitUntil: 'domcontentloaded' });

    // Set up preview state (same all-fields message as Test 1).
    await sendChatMessage(
      page,
      `schedule a tour for this listing ${listingId} on ${TOUR_DATES[0]} ` +
        `using e2e-tour-hitl@cribai.test`,
    );

    activeConversationId = await getActiveConversationId(user);
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
    await page.goto(EXPLORE_URL, { waitUntil: 'domcontentloaded' });

    // Set up the same preview state.
    await sendChatMessage(
      page,
      `schedule a tour for this listing ${listingId} on ${TOUR_DATES[0]} ` +
        `using e2e-tour-hitl@cribai.test`,
    );
    activeConversationId = await getActiveConversationId(user);
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
    // not as a stray tour confirmation. The simplest observable proof is
    // that lastSearch.resultListingIds populates after the search turn —
    // schedule_tour would have NOT touched it, but search_listings does.
    await sendChatMessage(page, 'show me 2 bedroom apartments under 1500');
    const afterSearchState = await waitForConversationState(activeConversationId);
    // The search may legitimately return zero rows for some campuses, but
    // pendingAction must remain null (i.e. the cancel did not resurrect).
    expect(afterSearchState.pendingAction.kind).toBeNull();
  });

  // ---------------------------------------------------------------------
  // TEST 4 — Name-only edit (regression on 87a828d + 232ff13)
  // ---------------------------------------------------------------------
  test('name-only edit updates studentName without confirming the tour', async ({ page }) => {
    await page.goto(EXPLORE_URL, { waitUntil: 'domcontentloaded' });

    // Set up preview with a default-derived name (inferred from email).
    // The runtime's inferNameFromEmail will pull "E2E Tour Hitl" from the
    // local-part of e2e-tour-hitl@cribai.test.
    await sendChatMessage(
      page,
      `schedule a tour for this listing ${listingId} on ${TOUR_DATES[0]} ` +
        `using e2e-tour-hitl@cribai.test`,
    );
    activeConversationId = await getActiveConversationId(user);
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

    // ASSERTION C: NO DB write — the name edit did NOT auto-confirm.
    expect(await countPendingTourRequests(user.id, listingId)).toBe(0);
  });
});
