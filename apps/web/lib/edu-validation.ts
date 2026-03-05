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
