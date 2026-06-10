import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCrmEnabled } from '@/lib/crm/feature-flag';

describe('isCrmEnabled (CRM visibility gate)', () => {
  const original = process.env.NEXT_PUBLIC_CRM_ENABLED;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CRM_ENABLED;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_CRM_ENABLED;
    else process.env.NEXT_PUBLIC_CRM_ENABLED = original;
  });

  it('is off when the flag is unset (safe prod default)', () => {
    expect(isCrmEnabled()).toBe(false);
  });

  it('is on only for the literal string "true"', () => {
    process.env.NEXT_PUBLIC_CRM_ENABLED = 'true';
    expect(isCrmEnabled()).toBe(true);
  });

  it('stays off for any other truthy-looking value', () => {
    for (const v of ['1', 'TRUE', 'yes', 'on', '']) {
      process.env.NEXT_PUBLIC_CRM_ENABLED = v;
      expect(isCrmEnabled()).toBe(false);
    }
  });
});
