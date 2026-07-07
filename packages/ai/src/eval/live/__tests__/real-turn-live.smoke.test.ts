/**
 * AIN-93 live-eval harness — LIVE smoke for one REAL turn end-to-end,
 * exercising the harness's OWN modules (`auth.ts` -> `conversation.ts` ->
 * `http-turn.ts`) against a real target. Skipped unless E2E_LIVE_AIN93=1 AND
 * every env var the auth/target/DB path needs is present.
 *
 * Every other test in this package (`__tests__/*.test.ts`) mocks `fetch` and
 * the Supabase client — they prove the harness's pure logic (SSE parsing,
 * hard checks, report shaping) but never prove the glue actually works
 * against a live deployment: real `signInWithPassword`, a real
 * `conversations` insert, and a real SSE round trip to `/api/ai/cribai`.
 * This smoke is the one place that seam gets exercised for real.
 *
 * Two-tier assertion, mirroring the ticket's ask ("IF the seeded fixture
 * exists ... additionally assert a tool_call"):
 *   - ALWAYS asserted: HTTP 200, a `done` event terminated the stream, and no
 *     error markers (`checks/errors.ts`'s `checkNoErrors` — the SAME checker
 *     the full live-eval runner uses per turn).
 *   - ONLY IF the AIN-93 8-row seed fixture is already present for the
 *     dedicated account (`seed-cli.ts`'s `resolveSeedListingIds`, which
 *     throws when it's missing — caught here rather than propagated):
 *     additionally assert a `rank_compare` tool_call fired, since the prompt
 *     ("which of my saved places should I pick and why?") is exactly the
 *     pick-for-me shape the seeded corpus expects to trigger it.
 *
 * Never logs the access token, Authorization header, or any secret env var —
 * only requestId, event-type counts, and latency.
 *
 * Run (all secrets passed inline, never committed):
 *   E2E_LIVE_AIN93=1 AIN93_TARGET_BASE_URL=http://localhost:3000 \
 *     AIN93_CONFIRM_TARGET=local NEXT_PUBLIC_SUPABASE_URL=... \
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY=... E2E_TEST_USER_EMAIL=... \
 *     E2E_TEST_USER_PASSWORD=... SUPABASE_SECRET_KEY=... \
 *     pnpm --filter @campusnest/ai exec vitest run src/eval/live/__tests__/real-turn-live.smoke.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { ChatEvent } from '../../../cribai';
import { resolveTargetConfig, resolveCampusSlug } from '../config';
import { provisionAndSignInTestUser } from '../auth';
import { createConversationRow, deleteConversationRow } from '../conversation';
import { postTurn } from '../http-turn';
import { checkNoErrors } from '../checks/errors';
import { toChatEvents } from '../checks/types';

const LIVE = process.env.E2E_LIVE_AIN93 === '1';

/**
 * Every env var the real auth/target/DB path needs. `AIN93_CONFIRM_TARGET`
 * is included because `resolveTargetConfig` throws without it — a missing
 * value here should skip cleanly, not blow up test collection.
 */
const REQUIRED_ENV_VARS = [
  'AIN93_TARGET_BASE_URL',
  'AIN93_CONFIRM_TARGET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'E2E_TEST_USER_EMAIL',
  'E2E_TEST_USER_PASSWORD',
  'SUPABASE_SECRET_KEY',
] as const;

function missingEnvVars(): readonly string[] {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
}

const missing = LIVE ? missingEnvVars() : [];
const SHOULD_RUN = LIVE && missing.length === 0;

if (LIVE && missing.length > 0) {
  // eslint-disable-next-line no-console
  console.warn(
    `[real-turn-live.smoke] E2E_LIVE_AIN93=1 but missing required env var(s): ` +
      `${missing.join(', ')} — skipping this smoke. Set all of: ${REQUIRED_ENV_VARS.join(', ')}.`,
  );
}

describe.skipIf(!SHOULD_RUN)(
  'one real AIN-93 turn — LIVE smoke (auth -> conversation -> http-turn)',
  () => {
    it(
      'signs in, creates a conversation row, POSTs one turn, and gets a clean done stream',
      async () => {
        const target = resolveTargetConfig();
        const campusSlug = resolveCampusSlug();
        const user = await provisionAndSignInTestUser();

        const { createSecretClient } = await import('@campusnest/supabase/server');
        const supabase = createSecretClient();

        const conversationId = await createConversationRow(supabase, { userId: user.id });

        try {
          const startedAt = Date.now();
          const result = await postTurn({
            baseUrl: target.baseUrl,
            accessToken: user.accessToken,
            query: 'which of my saved places should I pick and why?',
            campusSlug,
            conversationId,
          });
          const latencyMs = Date.now() - startedAt;

          const noErrors = checkNoErrors({
            events: result.events,
            httpStatus: result.httpStatus,
          });
          const hasDone = result.events.some((e) => e.type === 'done');

          const toolCallNames = toChatEvents(result.events)
            .filter((e): e is Extract<ChatEvent, { type: 'tool_call' }> => e.type === 'tool_call')
            .map((e) => e.name);
          const rankCompareCalled = toolCallNames.includes('rank_compare');

          const eventTypeCounts: Record<string, number> = {};
          for (const e of result.events) {
            eventTypeCounts[e.type] = (eventTypeCounts[e.type] ?? 0) + 1;
          }

          // Preflight for the stronger, optional assertion below: is the
          // AIN-93 8-row seed fixture present for this account?
          // `resolveSeedListingIds` throws when it's missing — caught here so
          // an unseeded account still lets this smoke prove the base
          // no-error/done contract instead of hard-failing outright.
          let fixtureAvailable = true;
          try {
            const { resolveSeedListingIds } = await import('../seed-cli');
            await resolveSeedListingIds(supabase, user.id);
          } catch {
            fixtureAvailable = false;
          }

          // Never logs the access token / Authorization header / any secret —
          // only the request correlator, event-type counts, and latency.
          // eslint-disable-next-line no-console
          console.log(
            'LIVE_SMOKE_RESULT ' +
              JSON.stringify({
                requestId: result.requestId,
                httpStatus: result.httpStatus,
                eventTypeCounts,
                hasDone,
                noErrorsPass: noErrors.pass,
                fixtureAvailable,
                rankCompareCalled,
                latencyMs,
                note: fixtureAvailable
                  ? 'seed fixture present — rank_compare tool_call assertion enforced'
                  : 'seed fixture ABSENT — only the no-error/done contract was asserted; ' +
                    "run `pnpm eval:live:seed -- seed` for the stronger assertion",
              }),
          );

          expect(result.httpStatus).toBe(200);
          expect(hasDone, 'a done event must terminate the SSE stream').toBe(true);
          expect(noErrors.pass, noErrors.detail).toBe(true);

          if (fixtureAvailable) {
            expect(
              rankCompareCalled,
              `expected a rank_compare tool_call; got tool_call names: ${JSON.stringify(
                toolCallNames,
              )}`,
            ).toBe(true);
          }
        } finally {
          await deleteConversationRow(supabase, conversationId);
        }
      },
      90_000,
    );
  },
);
