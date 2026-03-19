import { describe, it, expect, afterEach } from 'vitest';
import { isEduEmail, isAllowedEmail } from '../edu-validation';

describe('isEduEmail', () => {
  it('accepts a standard .edu email', () => {
    expect(isEduEmail('student@wisc.edu')).toBe(true);
  });

  it('accepts another .edu domain', () => {
    expect(isEduEmail('student@university.edu')).toBe(true);
  });

  it('rejects a non-.edu email', () => {
    expect(isEduEmail('user@gmail.com')).toBe(false);
  });

  it('rejects an email where edu is part of the domain but not TLD', () => {
    expect(isEduEmail('user@edu.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isEduEmail('')).toBe(false);
  });

  it('rejects a string without @ sign', () => {
    expect(isEduEmail('no-at-sign')).toBe(false);
  });

  it('accepts .edu email case-insensitively', () => {
    expect(isEduEmail('STUDENT@WISC.EDU')).toBe(true);
  });

  it('accepts a subdomain .edu email', () => {
    expect(isEduEmail('student@sub.university.edu')).toBe(true);
  });
});

describe('isAllowedEmail', () => {
  const originalEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ADMIN_EMAILS;
    } else {
      process.env.NEXT_PUBLIC_ADMIN_EMAILS = originalEnv;
    }
  });

  it('allows .edu emails regardless of whitelist', () => {
    delete process.env.NEXT_PUBLIC_ADMIN_EMAILS;
    expect(isAllowedEmail('student@wisc.edu')).toBe(true);
  });

  it('rejects non-.edu email when no whitelist is set', () => {
    delete process.env.NEXT_PUBLIC_ADMIN_EMAILS;
    expect(isAllowedEmail('user@gmail.com')).toBe(false);
  });

  it('allows a whitelisted non-.edu email', () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = 'admin@outlook.com,recruiter@gmail.com';
    expect(isAllowedEmail('admin@outlook.com')).toBe(true);
  });

  it('allows whitelisted email case-insensitively', () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = 'Admin@Outlook.com';
    expect(isAllowedEmail('admin@outlook.com')).toBe(true);
    expect(isAllowedEmail('ADMIN@OUTLOOK.COM')).toBe(true);
  });

  it('rejects non-whitelisted non-.edu email', () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = 'admin@outlook.com';
    expect(isAllowedEmail('hacker@evil.com')).toBe(false);
  });

  it('handles whitespace in the whitelist gracefully', () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = ' admin@outlook.com , recruiter@gmail.com ';
    expect(isAllowedEmail('admin@outlook.com')).toBe(true);
    expect(isAllowedEmail('recruiter@gmail.com')).toBe(true);
  });

  it('rejects empty string', () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = 'admin@outlook.com';
    expect(isAllowedEmail('')).toBe(false);
  });

  it('rejects string without @ sign', () => {
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = 'admin@outlook.com';
    expect(isAllowedEmail('no-at-sign')).toBe(false);
  });
});
