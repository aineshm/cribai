/**
 * Tests for toCrmUnit (AIN-61) — adapts a real CrmListingRow into the CrmUnit
 * shape the UI consumes, synthesizing honest `_proposed` defaults.
 */
import { describe, it, expect } from 'vitest';
import type { CrmListingRow } from '@campusnest/ai';
import { toCrmUnit } from '../crm/to-crm-unit';

const VIEWER_ID = 'u-1';

const BASE_ROW: CrmListingRow = {
  id: 'b7e8f3a0-1111-4222-8333-444455556666',
  user_id: VIEWER_ID,
  source_url: 'https://www.zillow.com/x',
  source_site: 'zillow',
  title: 'Dayton Row · 2BR',
  address: '523 W Dayton St',
  rent: 1650,
  bedrooms: 2,
  bathrooms: 1,
  sqft: 880,
  available_from: '2026-08-15',
  description: 'desc',
  amenities: ['Dishwasher', 'Heat included'],
  photo_urls: [],
  extraction_confidence: 0.9,
  status: 'active',
  user_notes: null,
  saved_at: '2026-06-01T00:00:00Z',
};

describe('toCrmUnit', () => {
  it('preserves every contract field from the row', () => {
    const unit = toCrmUnit(BASE_ROW, VIEWER_ID);
    for (const [key, value] of Object.entries(BASE_ROW)) {
      expect(unit[key as keyof CrmListingRow]).toEqual(value);
    }
  });

  it('does not mutate the input row', () => {
    const frozen = Object.freeze({ ...BASE_ROW });
    expect(() => toCrmUnit(frozen, VIEWER_ID)).not.toThrow();
  });

  it.each([
    ['active', 'saved'],
    ['toured', 'toured'],
    ['applied', 'applied'],
    ['declined', 'decision'],
  ] as const)('maps status %s → application stage %s', (status, stage) => {
    const unit = toCrmUnit({ ...BASE_ROW, status }, VIEWER_ID);
    expect(unit._proposed.application.stage).toBe(stage);
  });

  it('synthesizes honest application defaults (no fabricated deadlines/documents)', () => {
    const { application } = toCrmUnit(BASE_ROW, VIEWER_ID)._proposed;
    expect(application.deadline).toBeNull();
    expect(application.deadlineLabel).toBeNull();
    expect(application.submittedAt).toBeNull();
    expect(application.documents).toEqual([]);
  });

  it('scopes all amenities to the unit (no fabricated building split)', () => {
    const { amenitySplit } = toCrmUnit(BASE_ROW, VIEWER_ID)._proposed;
    expect(amenitySplit.unit).toEqual(['Dishwasher', 'Heat included']);
    expect(amenitySplit.building).toEqual([]);
  });

  it('handles null amenities', () => {
    const unit = toCrmUnit({ ...BASE_ROW, amenities: null }, VIEWER_ID);
    expect(unit._proposed.amenitySplit.unit).toEqual([]);
  });

  it('attributes addedBy to the current viewer', () => {
    expect(toCrmUnit(BASE_ROW, VIEWER_ID)._proposed.addedBy).toBe(VIEWER_ID);
  });

  it('derives the unit label from bedrooms (0 → Studio, n → n bed, null → Unit)', () => {
    expect(toCrmUnit({ ...BASE_ROW, bedrooms: 0 }, VIEWER_ID)._proposed.unit.unitLabel).toBe('Studio');
    expect(toCrmUnit({ ...BASE_ROW, bedrooms: 2 }, VIEWER_ID)._proposed.unit.unitLabel).toBe('2 bed');
    expect(toCrmUnit({ ...BASE_ROW, bedrooms: null }, VIEWER_ID)._proposed.unit.unitLabel).toBe('Unit');
  });

  // AIN-65 fold-in — photo_urls render straight into <img src>; only https:
  // URLs may survive the adapter (mixed-content / tracking vector otherwise).
  describe('photo_urls https-only filter', () => {
    it('keeps https URLs and drops http ones, preserving order', () => {
      const unit = toCrmUnit(
        {
          ...BASE_ROW,
          photo_urls: [
            'http://example.com/a.jpg',
            'https://example.com/b.jpg',
            'https://example.com/c.jpg',
          ],
        },
        VIEWER_ID,
      );
      expect(unit.photo_urls).toEqual([
        'https://example.com/b.jpg',
        'https://example.com/c.jpg',
      ]);
    });

    it('drops non-http(s) schemes and unparseable values', () => {
      const unit = toCrmUnit(
        {
          ...BASE_ROW,
          photo_urls: [
            'javascript:alert(1)',
            'data:image/png;base64,xyz',
            '//example.com/protocol-relative.jpg',
            'not a url',
            'HTTPS://EXAMPLE.COM/UPPER.JPG',
          ],
        },
        VIEWER_ID,
      );
      // Scheme matching is case-insensitive per URL spec — the uppercase
      // https URL survives; everything else is dropped.
      expect(unit.photo_urls).toEqual(['HTTPS://EXAMPLE.COM/UPPER.JPG']);
    });

    it('preserves null photo_urls as null and empty arrays as empty', () => {
      expect(toCrmUnit({ ...BASE_ROW, photo_urls: null }, VIEWER_ID).photo_urls).toBeNull();
      expect(toCrmUnit({ ...BASE_ROW, photo_urls: [] }, VIEWER_ID).photo_urls).toEqual([]);
    });
  });

  it('falls back through title → address → generic for the building name', () => {
    expect(toCrmUnit(BASE_ROW, VIEWER_ID)._proposed.unit.building).toBe(BASE_ROW.title);
    expect(
      toCrmUnit({ ...BASE_ROW, title: null }, VIEWER_ID)._proposed.unit.building,
    ).toBe(BASE_ROW.address);
    expect(
      toCrmUnit({ ...BASE_ROW, title: null, address: null }, VIEWER_ID)._proposed.unit.building,
    ).toBe('Saved listing');
  });
});
