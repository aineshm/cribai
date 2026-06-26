/**
 * Unit tests for mission API helper utilities (AIN-77).
 *
 * redactMissionSecrets — strips secret-named keys from mission.input so the
 * GET /api/missions/[id] response never echoes a key, token, or credential.
 */

import { describe, it, expect } from 'vitest';
import { redactMissionSecrets } from '../_helpers';

describe('redactMissionSecrets', () => {
  it('removes placesApiKey, apiToken, and clientSecret from mission.input', () => {
    const mission: Record<string, unknown> = {
      id: 'mission-1',
      user_id: 'user-1',
      input: {
        listingId: 'listing-1',
        sourceUrl: 'https://example.com',
        placesApiKey: 'AIza-secret-key-value',
        apiToken: 'tok_live_abc123',
        clientSecret: 'cs_prod_xyz',
      },
    };

    const result = redactMissionSecrets(mission);

    // Non-secret fields survive
    expect((result.input as Record<string, unknown>).listingId).toBe('listing-1');
    expect((result.input as Record<string, unknown>).sourceUrl).toBe('https://example.com');

    // Secret-named keys are stripped
    expect((result.input as Record<string, unknown>).placesApiKey).toBeUndefined();
    expect((result.input as Record<string, unknown>).apiToken).toBeUndefined();
    expect((result.input as Record<string, unknown>).clientSecret).toBeUndefined();

    // Top-level mission fields are untouched
    expect(result.id).toBe('mission-1');
    expect(result.user_id).toBe('user-1');
  });

  it('preserves listingId and sourceUrl (non-secret keys)', () => {
    const mission: Record<string, unknown> = {
      id: 'mission-2',
      input: {
        listingId: 'listing-2',
        sourceUrl: 'https://example.com/listing',
        rowAddress: '123 Main St, Madison, WI',
        rowTitle: 'Nice studio near campus',
      },
    };

    const result = redactMissionSecrets(mission);
    const input = result.input as Record<string, unknown>;

    expect(input.listingId).toBe('listing-2');
    expect(input.sourceUrl).toBe('https://example.com/listing');
    expect(input.rowAddress).toBe('123 Main St, Madison, WI');
    expect(input.rowTitle).toBe('Nice studio near campus');
  });

  it('returns mission unchanged when input is absent', () => {
    const mission: Record<string, unknown> = { id: 'mission-3', status: 'pending' };
    const result = redactMissionSecrets(mission);
    expect(result).toEqual({ id: 'mission-3', status: 'pending' });
    expect(result.input).toBeUndefined();
  });

  it('returns mission unchanged when input is null', () => {
    const mission: Record<string, unknown> = { id: 'mission-4', input: null };
    const result = redactMissionSecrets(mission);
    expect(result.input).toBeNull();
  });

  it('returns mission unchanged when input is a string (non-object)', () => {
    const mission: Record<string, unknown> = { id: 'mission-5', input: 'raw-string' };
    const result = redactMissionSecrets(mission);
    expect(result.input).toBe('raw-string');
  });

  it('returns mission unchanged when input is an array (non-plain-object)', () => {
    const mission: Record<string, unknown> = { id: 'mission-6', input: ['a', 'b'] };
    const result = redactMissionSecrets(mission);
    expect(Array.isArray(result.input)).toBe(true);
    expect(result.input).toEqual(['a', 'b']);
  });

  it('does not mutate the original mission or its input', () => {
    const originalInput = {
      listingId: 'listing-7',
      placesApiKey: 'secret-key',
    };
    const mission: Record<string, unknown> = {
      id: 'mission-7',
      input: originalInput,
    };

    redactMissionSecrets(mission);

    // Original input must remain untouched
    expect(originalInput.placesApiKey).toBe('secret-key');
    expect((mission.input as Record<string, unknown>).placesApiKey).toBe('secret-key');
  });

  it('strips keys case-insensitively: API_KEY, mySecret, TOKEN, passwordHash', () => {
    const mission: Record<string, unknown> = {
      id: 'mission-8',
      input: {
        API_KEY: 'val1',
        mySecret: 'val2',
        TOKEN: 'val3',
        passwordHash: 'val4',
        normalField: 'should-survive',
        credentialId: 'val5',
      },
    };

    const result = redactMissionSecrets(mission);
    const input = result.input as Record<string, unknown>;

    expect(input.API_KEY).toBeUndefined();
    expect(input.mySecret).toBeUndefined();
    expect(input.TOKEN).toBeUndefined();
    expect(input.passwordHash).toBeUndefined();
    expect(input.credentialId).toBeUndefined();
    expect(input.normalField).toBe('should-survive');
  });

  it('returns a new object — top-level mission reference is not mutated', () => {
    const mission: Record<string, unknown> = {
      id: 'mission-9',
      input: { placesApiKey: 'secret', listingId: 'l-1' },
    };

    const result = redactMissionSecrets(mission);

    expect(result).not.toBe(mission); // new object returned
    expect(result.input).not.toBe(mission.input); // new input object
  });
});
