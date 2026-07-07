/**
 * AIN-93 live-eval harness — target config, guard, and shared constants.
 *
 * The live runner drives the REAL prod chat API (`POST /api/ai/cribai`)
 * against a seeded account. Unlike the in-process eval (`../run-eval.ts`,
 * gated by `EVAL_ALLOW_PROD` and defaulting to "refuse prod"), this harness
 * is deliberate-prod BY DESIGN: it REQUIRES both `AIN93_TARGET_BASE_URL` and
 * `AIN93_CONFIRM_TARGET` (exactly `'prod'` or `'local'`) and refuses to run
 * without them — same "must opt in explicitly" discipline, inverted because
 * prod IS the point of this harness.
 */

export type LiveTarget = 'prod' | 'local';

export interface LiveTargetConfig {
  readonly baseUrl: string;
  readonly target: LiveTarget;
}

export interface ResolveTargetConfigEnv {
  readonly AIN93_TARGET_BASE_URL?: string;
  readonly AIN93_CONFIRM_TARGET?: string;
}

/** Hostnames that unambiguously mean "this points at a local dev server". */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

/**
 * `baseUrl` parse failures fall back to "not local" — an unparsable URL is
 * caught separately (the fetch itself will fail loudly), not silently
 * treated as a local-target match here.
 */
function isLocalHostname(baseUrl: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve + validate the target base URL and confirmation flag. Throws with
 * an actionable message on any ambiguity — this guard is the whole safety
 * mechanism, so it fails loudly rather than falling back to a default.
 */
export function resolveTargetConfig(
  env: ResolveTargetConfigEnv = process.env,
): LiveTargetConfig {
  const baseUrl = env.AIN93_TARGET_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      'AIN93_TARGET_BASE_URL is required (e.g. https://cribai.app or ' +
        'http://localhost:3000). The live-eval harness refuses to guess a target.',
    );
  }

  const confirm = env.AIN93_CONFIRM_TARGET?.trim();
  if (confirm !== 'prod' && confirm !== 'local') {
    throw new Error(
      `AIN93_CONFIRM_TARGET must be exactly 'prod' or 'local' (got ${JSON.stringify(
        confirm ?? null,
      )}). This is a deliberate-prod posture: the harness never runs without an ` +
        'explicit, unambiguous target confirmation.',
    );
  }

  // CodeRabbit PR #123 fix 3 — cross-check baseUrl against the confirmed
  // target. A copy-paste mistake (leftover AIN93_CONFIRM_TARGET=prod from a
  // previous run, pointed at a freshly-started localhost server, or vice
  // versa) is exactly the class of error this deliberate-prod guard exists
  // to catch — so a mismatch is a hard error, not a warning.
  const local = isLocalHostname(baseUrl);
  if (local && confirm !== 'local') {
    throw new Error(
      `AIN93_TARGET_BASE_URL (${baseUrl}) looks like localhost but AIN93_CONFIRM_TARGET is ` +
        `'${confirm}'. A localhost baseUrl requires AIN93_CONFIRM_TARGET=local — refusing to run ` +
        'against a mismatched target.',
    );
  }
  if (!local && confirm !== 'prod') {
    throw new Error(
      `AIN93_TARGET_BASE_URL (${baseUrl}) is not a localhost URL but AIN93_CONFIRM_TARGET is ` +
        `'${confirm}'. A non-localhost baseUrl requires AIN93_CONFIRM_TARGET=prod — refusing to ` +
        'run against a mismatched target.',
    );
  }

  return { baseUrl, target: confirm };
}

// ---------------------------------------------------------------------------
// Cost ceiling (judge-call budget)
// ---------------------------------------------------------------------------

/**
 * Default judge-call cost ceiling in USD. Reuses the SAME env var name as
 * the in-process eval (`CRIBAI_EVAL_COST_CEILING_USD`) but a higher default
 * ($5 vs $3): the live harness's chat-turn spend is billed to prod's key and
 * reported separately from `ai_request_metrics`, so only judge calls count
 * against this ceiling here.
 */
const LIVE_COST_CEILING_DEFAULT_USD = 5.0;

export function resolveLiveCostCeilingUsd(
  env: { readonly CRIBAI_EVAL_COST_CEILING_USD?: string } = process.env,
): number {
  const raw = env.CRIBAI_EVAL_COST_CEILING_USD;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return LIVE_COST_CEILING_DEFAULT_USD;
}

// ---------------------------------------------------------------------------
// Campus slug
// ---------------------------------------------------------------------------

const DEFAULT_CAMPUS_SLUG = 'uw-madison';

export function resolveCampusSlug(
  env: { readonly AIN93_CAMPUS_SLUG?: string } = process.env,
): string {
  return env.AIN93_CAMPUS_SLUG?.trim() || DEFAULT_CAMPUS_SLUG;
}

// ---------------------------------------------------------------------------
// Pacing + throttle discipline (plan decision 8)
// ---------------------------------------------------------------------------

/** Minimum spacing enforced between turns, one scenario at a time. */
export const MIN_TURN_SPACING_MS = 3000;
/** Up to 2 retries on a throttle/quota response before labeling the turn `throttled`. */
export const MAX_THROTTLE_RETRIES = 2;
/** Exponential backoff base — attempt N waits `THROTTLE_BACKOFF_BASE_MS * 2^N`. */
export const THROTTLE_BACKOFF_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// Latency budget (plan decision 6 — proposed, founder tunes at report time)
// ---------------------------------------------------------------------------

export const LATENCY_TOTAL_P95_BUDGET_MS = 12_000;
export const LATENCY_TTFT_P95_BUDGET_MS = 6_000;

// ---------------------------------------------------------------------------
// Pass bar (ticket): >=90% of scenarios pass ALL hard criteria in >=2 of 3 runs.
// ---------------------------------------------------------------------------

export const RUNS_PER_SCENARIO = 3;
export const PASS_BAR_RUN_THRESHOLD = 2;
export const PASS_BAR_SCENARIO_PCT = 0.9;
