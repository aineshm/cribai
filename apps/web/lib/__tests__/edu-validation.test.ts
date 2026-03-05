import { describe, it, expect } from 'vitest';
import { isEduEmail } from '../edu-validation';

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
