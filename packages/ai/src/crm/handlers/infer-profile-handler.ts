/**
 * infer-profile-handler — CRM tool handler adapter (AIN-15, Track C Phase 1).
 *
 * Validates args (none required), checks sign-in, obtains the service-role
 * client via `getCrmServiceClient`, calls `inferProfile`, then maps the
 * `InferProfileResult` discriminant into a ToolResult.
 *
 * getCrmServiceClient is called inside a try/catch so a missing env var
 * produces a graceful ToolResult rather than an uncaught throw.
 *
 * Does NOT register into tool-registry.ts (Phase 2).
 */

import type { ToolContext, ToolResult } from '../../tools/types';
import { inferProfile } from '../infer-profile';
import { getCrmServiceClient } from '../service-client';
import { inferProfileInput } from '../schemas';
import type { InferredProfile } from '../types';

// ---------------------------------------------------------------------------
// Sign-in gate
// ---------------------------------------------------------------------------

const SIGN_IN_RESULT: ToolResult = {
  modelContext: 'CRM action requires sign-in.',
  clientBlock: { type: 'text' as const, content: 'Please sign in to use your personal CRM.' },
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatInferredProfile(profile: InferredProfile): { modelContext: string; content: string } {
  const rentBand =
    profile.rent_min != null && profile.rent_max != null
      ? `$${profile.rent_min}–$${profile.rent_max}/mo`
      : profile.rent_max != null
      ? `up to $${profile.rent_max}/mo`
      : profile.rent_min != null
      ? `$${profile.rent_min}+/mo`
      : 'unknown';

  const beds = profile.bedrooms_target != null ? `${profile.bedrooms_target} bed` : 'unknown';
  const mustHaves = profile.must_have_amenities.length > 0
    ? profile.must_have_amenities.join(', ')
    : 'none identified';
  const confidence = `${Math.round(profile.confidence * 100)}%`;

  const modelContext = [
    'Inferred profile:',
    `  Rent band: ${rentBand}`,
    `  Target bedrooms: ${beds}`,
    `  Must-haves: ${mustHaves}`,
    `  Confidence: ${confidence}`,
    '',
    'INSTRUCTIONS: Share the profile summary with the user and confirm it looks right.',
  ].join('\n');

  const content = [
    '**Your Housing Profile**',
    '',
    `Rent budget: ${rentBand}`,
    `Bedrooms: ${beds}`,
    `Must-haves: ${mustHaves}`,
    `Confidence: ${confidence}`,
  ].join('\n');

  return { modelContext, content };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handler for the `infer_profile` CRM tool.
 *
 * @param args    - Raw tool arguments (no required fields; userId from context).
 * @param context - ToolContext (supabase, userId, etc.).
 * @returns       A ToolResult — never throws to the runtime.
 */
export async function inferProfileHandler(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  // --- Sign-in gate ---
  if (!context.userId) {
    return SIGN_IN_RESULT;
  }

  // --- Input validation (no required fields; still run for unknown-key stripping) ---
  const parsed = inferProfileInput.safeParse(args);
  if (!parsed.success) {
    return {
      modelContext: `Invalid input: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      clientBlock: {
        type: 'text' as const,
        content: "I couldn't run profile inference — invalid input.",
      },
    };
  }

  // --- Service-role client (may throw on missing env) ---
  let writeDb;
  try {
    writeDb = getCrmServiceClient();
  } catch (err: unknown) {
    return {
      modelContext: `Server configuration error — cannot obtain service client: ${String(err)}`,
      clientBlock: {
        type: 'text' as const,
        content: "There's a server configuration issue. Please try again later.",
      },
    };
  }

  try {
    const result = await inferProfile(context.userId, {
      readDb: context.supabase,
      writeDb,
      userId: context.userId,
    });

    if (result.status === 'needs_more_data') {
      const question = result.steeringQuestion;
      return {
        modelContext: [
          `Not enough data to infer profile yet (${result.savedCount} listing(s) saved; need at least 3).`,
          `Steering: ${question}`,
        ].join('\n'),
        clientBlock: { type: 'text' as const, content: question },
      };
    }

    // status === 'inferred'
    const { modelContext, content } = formatInferredProfile(result.profile);
    return {
      modelContext,
      clientBlock: { type: 'text' as const, content },
    };
  } catch (err: unknown) {
    return {
      modelContext: `Profile inference failed: ${String(err)}`,
      clientBlock: {
        type: 'text' as const,
        content: "Couldn't run profile inference. Please try again.",
      },
    };
  }
}
