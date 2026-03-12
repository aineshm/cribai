import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from '../steps/01-search';
import type { HousingSearchInput } from '@campusnest/types';

describe('buildSearchQuery', () => {
  it('combines bedrooms, maxRent, and preferences into a query string', () => {
    const input: HousingSearchInput = { bedrooms: 2, maxRent: 1200, preferences: 'quiet', topN: 5 };
    const result = buildSearchQuery(input);
    expect(result).toContain('2 bedroom');
    expect(result).toContain('1200');
    expect(result).toContain('quiet');
  });

  it('returns a fallback string when no fields are provided', () => {
    const input: HousingSearchInput = { topN: 5 };
    const result = buildSearchQuery(input);
    expect(result).toBe('affordable student housing near campus');
  });

  it('includes dealbreaker exclusions in the query', () => {
    const input: HousingSearchInput = {
      dealbreakers: ['shared bathroom', 'no pets'],
      topN: 5,
    };
    const result = buildSearchQuery(input);
    expect(result).toContain('shared bathroom');
    expect(result).toContain('no pets');
  });

  it('works with only preferences', () => {
    const input: HousingSearchInput = { preferences: 'natural light, close to campus', topN: 5 };
    const result = buildSearchQuery(input);
    expect(result).toContain('natural light');
    expect(result).not.toBe('affordable student housing near campus');
  });
});
