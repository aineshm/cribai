import { describe, it, expect } from 'vitest';
import { sanitizeArgs, extractResultSummary } from '../lib/agent-run-logger';
import type { ToolResult } from '../types';

describe('sanitizeArgs', () => {
  it('strips PII fields from create_sublease args', () => {
    const args = {
      address: '123 Langdon St, Madison, WI',
      contact_email: 'jane@wisc.edu',
      rent_monthly: 900,
      bedrooms_total: 3,
      bedrooms_available: 1,
      description: 'Great place near campus',
      confirmed: false,
    };

    const sanitized = sanitizeArgs('create_sublease', args);

    expect(sanitized).not.toHaveProperty('contact_email');
    expect(sanitized).not.toHaveProperty('description');
    expect(sanitized).toHaveProperty('rent_monthly', 900);
    expect(sanitized).toHaveProperty('bedrooms_total', 3);
    expect(sanitized).toHaveProperty('confirmed', false);
  });

  it('strips PII fields from schedule_tour args', () => {
    const args = {
      listing_id: 'uuid-123',
      student_name: 'Jane',
      student_email: 'jane@wisc.edu',
      preferred_dates: ['2026-04-01'],
      notes: 'Morning preferred',
    };

    const sanitized = sanitizeArgs('schedule_tour', args);

    expect(sanitized).not.toHaveProperty('student_name');
    expect(sanitized).not.toHaveProperty('student_email');
    expect(sanitized).not.toHaveProperty('notes');
    expect(sanitized).toHaveProperty('listing_id', 'uuid-123');
    expect(sanitized).toHaveProperty('preferred_dates_count', 1);
  });

  it('strips message from contact_pm args', () => {
    const args = { listing_id: 'uuid-123', message: 'Hey, is this available?' };
    const sanitized = sanitizeArgs('contact_pm', args);

    expect(sanitized).not.toHaveProperty('message');
    expect(sanitized).toHaveProperty('listing_id');
  });

  it('passes through structural args for unknown tools', () => {
    const args = { listing_id: 'uuid-123', sort: 'price_asc', limit: 5 };
    const sanitized = sanitizeArgs('search_listings', args);

    expect(sanitized).toEqual(args);
  });
});

describe('extractResultSummary', () => {
  it('extracts result_count from clientBlock listing_card', () => {
    const result = {
      modelContext: 'Found 3 listings',
      clientBlock: { type: 'listing_card' as const, listings: [{}, {}, {}] },
    } as unknown as ToolResult;

    const summary = extractResultSummary('search_listings', result);

    expect(summary).toHaveProperty('result_count', 3);
  });

  it('returns empty object for text blocks', () => {
    const result = {
      modelContext: 'Some context',
      clientBlock: { type: 'text' as const, content: 'Hello' },
    } as ToolResult;

    const summary = extractResultSummary('explain_lease_term', result);

    expect(summary).toEqual({});
  });
});
