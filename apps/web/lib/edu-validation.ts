/**
 * Validates whether an email address belongs to a .edu domain.
 *
 * Checks the top-level domain of the email, supporting subdomains
 * (e.g., student@cs.university.edu is valid). Case-insensitive.
 */
export function isEduEmail(email: string): boolean {
  if (!email || !email.includes('@')) {
    return false;
  }

  const domain = email.split('@')[1];
  if (!domain) {
    return false;
  }

  return domain.toLowerCase().endsWith('.edu');
}

/**
 * Parses the admin email whitelist from the NEXT_PUBLIC_ADMIN_EMAILS
 * environment variable (comma-separated, case-insensitive).
 */
function getAdminEmails(): ReadonlyArray<string> {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Checks whether an email is allowed to sign in.
 *
 * An email is allowed if it is a .edu address OR if it appears in the
 * NEXT_PUBLIC_ADMIN_EMAILS whitelist (comma-separated env var).
 */
export function isAllowedEmail(email: string): boolean {
  if (isEduEmail(email)) return true;
  if (!email || !email.includes('@')) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
