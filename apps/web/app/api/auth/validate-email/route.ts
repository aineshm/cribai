import { NextResponse } from 'next/server';

import { isEduEmail } from '@/lib/edu-validation';

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
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Invalid request body' },
      { status: 400 },
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
      { status: 400 },
    );
  }

  const email = (body as { email: string }).email.trim();

  if (!email) {
    return NextResponse.json(
      { valid: false, error: 'Email is required' },
      { status: 400 },
    );
  }

  // Basic well-formed-email check. We accept any TLD; .edu just earns a badge.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { valid: false, error: 'Please enter a valid email address.' },
      { status: 400 },
    );
  }

  const isEdu = isEduEmail(email);

  if (isEdu) {
    return NextResponse.json({
      valid: true,
      isEdu: true,
      badge: 'verified_student' as const,
    });
  }

  return NextResponse.json({ valid: true, isEdu: false });
}
