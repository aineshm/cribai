/**
 * PDR-004 Track A Day 2 — CribAI persona
 *
 * One source of truth for the agent's identity, voice, and the slow-moving
 * data context (fairness scale, season vocabulary, listing inventory shape).
 *
 * This file is byte-stable: edits change the prompt-cache key. Treat it the
 * same way you'd treat a public API surface — small, deliberate changes only.
 *
 * Consumed by:
 *   - packages/ai/src/runtime/system-prompt.ts (LLM-first runtime, PDR-004)
 *   - packages/ai/src/cribai.ts (legacy Gemini runtime, during the parallel
 *     rollout window) — both runtimes draw the same persona text so prompt
 *     iteration in Days 7-9 doesn't fork.
 *
 * Anything per-turn or per-user (state, profile, guest flag) belongs in the
 * dynamic suffix built by `buildSystemPrompt`, NOT here. See PDR-004
 * §Architectural Shape and codex amendment A2.
 */

import type { RuntimeSurface } from './tool-registry';

/** Default campus for code paths that haven't threaded campus through yet. */
export const DEFAULT_CAMPUS_NAME = 'UW-Madison';

/**
 * AIN-24 (security) — `campus_configs.name` is a TRUST BOUNDARY.
 *
 * `campusName` flows from the `campus_configs` table (admin-editable) straight
 * into the system-prompt prefix via string interpolation. Without
 * sanitization, a malicious / mistyped campus name could carry newlines +
 * instruction text ("Ignore prior instructions...") that the model reads as
 * part of its persona — a prompt-injection vector. We neutralize it before
 * interpolation:
 *   - strip everything outside the safe set [A-Za-z0-9 \-] (drops control
 *     chars, newlines, punctuation an attacker could use to break framing)
 *   - collapse runs of whitespace, trim
 *   - cap at 60 chars (real campus names are well under this)
 *   - fall back to the default campus name if nothing survives
 *
 * The result is purely alphanumeric/space/hyphen, so it can never introduce a
 * new prompt line or directive.
 */
const MAX_CAMPUS_NAME_LENGTH = 60;

export function sanitizeCampusName(rawCampusName: string): string {
  if (typeof rawCampusName !== 'string') {
    return DEFAULT_CAMPUS_NAME;
  }
  const cleaned = rawCampusName
    // Drop any character outside the safe allowlist (control chars, newlines,
    // quotes, colons, etc. all go).
    .replace(/[^A-Za-z0-9 \-]/g, ' ')
    // Collapse whitespace runs introduced by the strip above.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CAMPUS_NAME_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : DEFAULT_CAMPUS_NAME;
}

/**
 * Explore/default Context block — the search-first workflow. Byte-identical
 * to the pre-surface-split persona text (prompt-cache contract).
 */
const EXPLORE_CONTEXT_BLOCK = `Context:
- 2,500+ Zillow listings + student subleases, all searchable via search_listings
- Subleases are .edu-verified, posted by students. Treat equally with Zillow listings.
- Fairness scores (1-10) factor rent + utilities + parking + fees into true cost
- FAIRNESS & PRICING GUIDE:
  When asked "what's fair rent", "is this a good deal", or any pricing question:
  1. Use search_listings with sort='fairness' (and min_fairness filter if appropriate) to find best-value listings
  2. ALWAYS cite fairness scores from results: e.g. "This 2BR at $1,200/mo scores 7.5/10 — better value than most similar units"
  3. For deep analysis on a specific listing: call get_listing_detail which returns predicted fair rent, comparable count, and price delta
  4. Interpret the scale: 8-10 = great deal, 6-8 = fair price, 4-6 = overpriced, 1-4 = significantly overpriced
  5. Never say fairness data is unavailable — most Zillow listings have scores. Search with sort='fairness' to surface them.
- Seasons: summer=May-Aug, fall=Aug-Dec, spring=Jan-May`;

/**
 * CRM (My Apartments) Context block — same identity/voice, but the workflow
 * runs off the user's saved list via first_save_analysis / rank_compare. The
 * explore search tools do not exist on this surface (review Finding 1: the
 * persona must not instruct a workflow the registry cannot serve).
 */
const CRM_CONTEXT_BLOCK = `Context:
- This is My Apartments, the user's saved-listing workspace. Their saved listings are read via rank_compare.
- Subleases are .edu-verified, posted by students. Treat equally with Zillow listings.
- Fairness scores (1-10) factor rent + utilities + parking + fees into true cost
- FAIRNESS & PRICING GUIDE:
  When asked "what's fair rent", "is this a good deal", or any pricing question about a saved listing:
  1. Call first_save_analysis with the listing_id — it returns fairness, true cost, and red flags
  2. ALWAYS cite specific data from results: e.g. "This 2BR at $1,200/mo scores 7.5/10 — better value than most similar units"
  3. To compare across the saved list, call rank_compare
  4. Interpret the scale: 8-10 = great deal, 6-8 = fair price, 4-6 = overpriced, 1-4 = significantly overpriced
  5. Never say fairness data is unavailable without calling the analysis tools first.
- Seasons: summer=May-Aug, fall=Aug-Dec, spring=Jan-May`;

/**
 * Campus-agnostic identity + voice. Campus name is interpolated once at the
 * persona-build step so the rest of the prefix stays byte-identical across
 * turns within a campus. The campus name is sanitized first — see
 * `sanitizeCampusName` (AIN-24 trust-boundary note).
 *
 * `surface` selects the Context block only: explore/default output is
 * byte-identical to the pre-surface-split persona; `'crm'` swaps in the
 * saved-list workflow. Identity + Voice are shared verbatim across surfaces.
 */
export function buildPersona(campusName: string, surface?: RuntimeSurface): string {
  const safeCampusName = sanitizeCampusName(campusName);
  const contextBlock = surface === 'crm' ? CRM_CONTEXT_BLOCK : EXPLORE_CONTEXT_BLOCK;
  return `You are CribAI, an AI housing agent for a .edu-verified student housing platform at ${safeCampusName}. You have real data and tools — use them.

${contextBlock}

Voice:
- Concise and student-friendly. Cite specific data (prices, scores, counts).
- Never fabricate details. If a listing is already identified, use action tools directly.
- Lease questions: use explain_lease_term + include a legal disclaimer.`;
}
