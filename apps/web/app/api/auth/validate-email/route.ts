import { NextResponse } from 'next/server';

import { isEduEmail } from '@/lib/edu-validation';

/**
 * Parses the admin email whitelist from the server-only ADMIN_EMAILS
 * environment variable (comma-separated, case-insensitive).
 */
function getAdminEmails(): ReadonlyArray<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Checks whether an email is allowed to sign in.
 * Allowed if it is a .edu address OR if it appears in the ADMIN_EMAILS whitelist.
 */
function isAllowedEmail(email: string): boolean {
  if (isEduEmail(email)) return true;
  if (!email || !email.includes('@')) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/**
 * POST /api/auth/validate-email
 *
 * Server-side email validation. Checks whether the given email is a .edu
 * address or is in the admin whitelist (ADMIN_EMAILS env var, private).
 * No auth required (this is pre-auth).
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== 'object' ||
      !('email' in body) ||
      typeof (body as { email: unknown }).email !== 'string'
    ) {
      return NextResponse.json(
        { allowed: false, error: 'Missing or invalid email field' },
        { status: 400 },
      );
    }

    const email = (body as { email: string }).email.trim();

    if (!email) {
      return NextResponse.json(
        { allowed: false, error: 'Email is required' },
        { status: 400 },
      );
    }

    if (isAllowedEmail(email)) {
      return NextResponse.json({ allowed: true });
    }

    return NextResponse.json({
      allowed: false,
      error: 'CribAI requires a .edu email address',
    });
  } catch {
    return NextResponse.json(
      { allowed: false, error: 'Invalid request body' },
      { status: 400 },
    );
  }
}
