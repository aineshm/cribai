import { NextResponse } from 'next/server';

import { isEduEmail } from '@/lib/edu-validation';
import { buildExtensionCorsHeaders } from '../../crm/_lib/extension-cors';

/**
 * POST /api/auth/validate-email
 *
 * Server-side email validation. As of PDR-003 (Track B Day 2, 2026-05-21) the
 * `.edu` gate is relaxed: any well-formed email is accepted for sign-in /
 * sign-up. `.edu` users get a "Verified UW Student" badge surfaced via the
 * `isEdu` + `badge` fields in the response, which the client persists to
 * `auth.users.user_metadata.is_verified_student` after OTP verification.
 *
 * The supply-side `.edu` gate (sublease posting) is enforced separately in
 * `apps/web/app/api/submit-listing/route.ts`.
 *
 * Response shape:
 *   - `{ valid: true,  isEdu: true,  badge: 'verified_student' }` for .edu
 *   - `{ valid: true,  isEdu: false }`                            for other
 *   - `{ valid: false, error: '...' }`                            for malformed
 *
 * No auth required (this is pre-auth).
 *
 * CORS: the Chrome extension calls this route cross-origin before
 * `signInWithOtp` (its sign-up parity gate). The single configured extension
 * origin gets CORS headers (see `_lib/extension-cors.ts`); same-origin web
 * callers are unaffected. CORS is not a security boundary here — the route is
 * pre-auth validation only.
 */

/** OPTIONS — CORS preflight for the Chrome extension. */
export async function OPTIONS(request: Request) {
  const corsHeaders = buildExtensionCorsHeaders(request.headers.get('origin'));
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const corsHeaders = buildExtensionCorsHeaders(request.headers.get('origin'));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Invalid request body' },
      { status: 400, headers: corsHeaders },
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('email' in body) ||
    typeof (body as { email: unknown }).email !== 'string'
  ) {
    return NextResponse.json(
      { valid: false, error: 'Missing or invalid email field' },
      { status: 400, headers: corsHeaders },
    );
  }

  const email = (body as { email: string }).email.trim();

  if (!email) {
    return NextResponse.json(
      { valid: false, error: 'Email is required' },
      { status: 400, headers: corsHeaders },
    );
  }

  // Basic well-formed-email check. We accept any TLD; .edu just earns a badge.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { valid: false, error: 'Please enter a valid email address.' },
      { status: 400, headers: corsHeaders },
    );
  }

  const isEdu = isEduEmail(email);

  if (isEdu) {
    return NextResponse.json(
      {
        valid: true,
        isEdu: true,
        badge: 'verified_student' as const,
      },
      { headers: corsHeaders },
    );
  }

  return NextResponse.json({ valid: true, isEdu: false }, { headers: corsHeaders });
}
