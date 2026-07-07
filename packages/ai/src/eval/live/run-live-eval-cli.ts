/**
 * AIN-93 live-eval harness — `pnpm eval:live` CLI entry point.
 *
 * Split out of `run-live-eval.ts` (CodeRabbit PR #123 review pass) so that
 * file stays the pure-ish orchestration core (`runLiveEval`, unit-testable
 * with mocked deps, no live network calls) while this file owns wiring the
 * REAL implementations (Supabase, auth, the actual `postTurn`/`probeRuntime`
 * calls) and process-level concerns (`process.exitCode`, `console.log`).
 *
 *   1. probe turn — confirm the CRM surface is on the LLM-first runtime.
 *   2. seed check — resolve the 8 fixed truth-table rows to real DB ids
 *      (throws with guidance if the fixture hasn't been seeded).
 *   3. run the full corpus via `runLiveEval`.
 *   4. print the report; non-zero exit when the pass bar isn't met.
 */
import { postTurn } from './http-turn';
import { probeRuntime } from './probe';
import { loadLiveCorpus } from './corpus';
import { resolveTargetConfig, resolveCampusSlug } from './config';
import { formatLiveReport } from './report';
import { runLiveEval } from './run-live-eval';

async function main(): Promise<void> {
  const target = resolveTargetConfig();
  const campusSlug = resolveCampusSlug();

  const { provisionAndSignInTestUser } = await import('./auth');
  const { createSecretClient } = await import('@campusnest/supabase/server');
  const { resolveSeedListingIds, deleteCrmListingsByIds } = await import('./seed-cli');
  const { createConversationRow, deleteConversationRow } = await import('./conversation');

  const supabase = createSecretClient();
  const user = await provisionAndSignInTestUser();

  // Preflight 1: the 8 fixed truth rows must already be seeded.
  const seedIdsByKey = await resolveSeedListingIds(supabase, user.id);

  // Preflight 2: the CRM surface must be on the LLM-first runtime.
  await probeRuntime({
    postProbeTurn: () =>
      postTurn({
        baseUrl: target.baseUrl,
        accessToken: user.accessToken,
        query: 'hello',
        campusSlug,
      }),
    fetchRuntimeForRequestId: async (requestId) => {
      const { data } = await supabase
        .from('ai_request_metrics')
        .select('runtime')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { runtime?: string } | null)?.runtime ?? null;
    },
  });

  const report = await runLiveEval({
    scenarios: loadLiveCorpus(),
    baseUrl: target.baseUrl,
    accessToken: user.accessToken,
    campusSlug,
    seedIdsByKey,
    fetchLatencyRow: async (requestId) => {
      const { data } = await supabase
        .from('ai_request_metrics')
        .select('request_id, request_received_at, first_model_token_at, request_completed_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        request_id: string;
        request_received_at: string;
        first_model_token_at: string | null;
        request_completed_at: string;
      };
      return {
        requestId: row.request_id,
        requestReceivedAt: row.request_received_at,
        firstModelTokenAt: row.first_model_token_at,
        requestCompletedAt: row.request_completed_at,
      };
    },
    createConversation: () => createConversationRow(supabase, { userId: user.id }),
    deleteConversation: (id) => deleteConversationRow(supabase, id),
    deleteCreatedListings: (ids) => deleteCrmListingsByIds(supabase, ids),
  });

  // eslint-disable-next-line no-console
  console.log(formatLiveReport(report));

  if (!report.passBarMet) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  /run-live-eval-cli(\.[cm]?[jt]s)?$/.test(process.argv[1] ?? '');

if (isDirectRun) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[ain93 eval:live] run failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
