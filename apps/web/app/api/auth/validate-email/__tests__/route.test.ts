import { describe, it, expect, afterEach, vi } from 'vitest';
import { POST } from '../route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/validate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/validate-email', () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = originalEnv;
    }
  });

  it('allows .edu emails', async () => {
    delete process.env.ADMIN_EMAILS;
    const res = await POST(makeRequest({ email: 'student@wisc.edu' }));
    const data = await res.json();
    expect(data).toEqual({ allowed: true });
  });

  it('rejects non-.edu email when no whitelist is set', async () => {
    delete process.env.ADMIN_EMAILS;
    const res = await POST(makeRequest({ email: 'user@gmail.com' }));
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.error).toBe('CribAI requires a .edu email address');
  });

  it('allows a whitelisted non-.edu email', async () => {
    process.env.ADMIN_EMAILS = 'admin@outlook.com,recruiter@gmail.com';
    const res = await POST(makeRequest({ email: 'admin@outlook.com' }));
    const data = await res.json();
    expect(data).toEqual({ allowed: true });
  });

  it('allows whitelisted email case-insensitively', async () => {
    process.env.ADMIN_EMAILS = 'Admin@Outlook.com';
    const res1 = await POST(makeRequest({ email: 'admin@outlook.com' }));
    const data1 = await res1.json();
    expect(data1).toEqual({ allowed: true });

    const res2 = await POST(makeRequest({ email: 'ADMIN@OUTLOOK.COM' }));
    const data2 = await res2.json();
    expect(data2).toEqual({ allowed: true });
  });

  it('rejects non-whitelisted non-.edu email', async () => {
    process.env.ADMIN_EMAILS = 'admin@outlook.com';
    const res = await POST(makeRequest({ email: 'hacker@evil.com' }));
    const data = await res.json();
    expect(data.allowed).toBe(false);
  });

  it('handles whitespace in the whitelist gracefully', async () => {
    process.env.ADMIN_EMAILS = ' admin@outlook.com , recruiter@gmail.com ';
    const res = await POST(makeRequest({ email: 'admin@outlook.com' }));
    const data = await res.json();
    expect(data).toEqual({ allowed: true });
  });

  it('returns 400 for missing email field', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.allowed).toBe(false);
  });

  it('returns 400 for empty email', async () => {
    const res = await POST(makeRequest({ email: '  ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.allowed).toBe(false);
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
    expect(data.allowed).toBe(false);
  });
});
