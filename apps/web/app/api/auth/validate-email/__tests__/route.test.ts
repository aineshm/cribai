import { describe, it, expect } from 'vitest';
import { POST } from '../route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/validate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/validate-email', () => {
  it('accepts .edu emails with isEdu=true and badge=verified_student', async () => {
    const res = await POST(makeRequest({ email: 'student@wisc.edu' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      valid: true,
      isEdu: true,
      badge: 'verified_student',
    });
  });

  it('accepts non-.edu emails with isEdu=false and no badge', async () => {
    const res = await POST(makeRequest({ email: 'user@gmail.com' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ valid: true, isEdu: false });
  });

  it('accepts subdomain .edu emails', async () => {
    const res = await POST(makeRequest({ email: 'student@cs.wisc.edu' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.isEdu).toBe(true);
    expect(data.badge).toBe('verified_student');
  });

  it('is case-insensitive for .edu detection', async () => {
    const res = await POST(makeRequest({ email: 'STUDENT@WISC.EDU' }));
    const data = await res.json();
    expect(data.isEdu).toBe(true);
  });

  it('treats edu.com as non-.edu (TLD check, not substring)', async () => {
    const res = await POST(makeRequest({ email: 'user@edu.com' }));
    const data = await res.json();
    expect(data).toEqual({ valid: true, isEdu: false });
  });

  it('returns 400 for missing email field', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for empty email', async () => {
    const res = await POST(makeRequest({ email: '  ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for malformed email (no @)', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for malformed email (no TLD)', async () => {
    const res = await POST(makeRequest({ email: 'user@host' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/auth/validate-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });
});
