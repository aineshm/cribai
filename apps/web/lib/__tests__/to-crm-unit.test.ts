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
  nickname: null,
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

  // AIN-95 — nickname is a user-renamable display name, distinct from the
  // extraction-derived title. It takes priority over the whole title/address
  // fallback chain when present.
  describe('nickname display fallback (AIN-95)', () => {
    it('uses the nickname for the building name when present', () => {
      const unit = toCrmUnit({ ...BASE_ROW, nickname: 'The Dayton Spot' }, VIEWER_ID);
      expect(unit._proposed.unit.building).toBe('The Dayton Spot');
    });

    it('falls back to title when nickname is null', () => {
      const unit = toCrmUnit({ ...BASE_ROW, nickname: null }, VIEWER_ID);
      expect(unit._proposed.unit.building).toBe(BASE_ROW.title);
    });

    it('nickname wins over title even when both are present', () => {
      const unit = toCrmUnit(
        { ...BASE_ROW, nickname: 'My Favorite Place', title: 'Some Extracted Title' },
        VIEWER_ID,
      );
      expect(unit._proposed.unit.building).toBe('My Favorite Place');
    });
  });

  // AIN-74 security HIGH — source_url renders as <a href> in UnitDetailDrawer;
  // only absolute https: URLs may pass through (javascript: / data: XSS vectors).
  describe('source_url https-only guard', () => {
    it('drops a javascript: source_url → null', () => {
      const unit = toCrmUnit({ ...BASE_ROW, source_url: 'javascript:alert(1)' }, VIEWER_ID);
      expect(unit.source_url).toBeNull();
    });

    it('drops a data: source_url → null', () => {
      const unit = toCrmUnit({ ...BASE_ROW, source_url: 'data:text/html,<b>hi</b>' }, VIEWER_ID);
      expect(unit.source_url).toBeNull();
    });

    it('preserves a valid https source_url unchanged', () => {
      const url = 'https://www.zillow.com/x';
      const unit = toCrmUnit({ ...BASE_ROW, source_url: url }, VIEWER_ID);
      expect(unit.source_url).toBe(url);
    });

    it('preserves null source_url as null', () => {
      const unit = toCrmUnit({ ...BASE_ROW, source_url: null }, VIEWER_ID);
      expect(unit.source_url).toBeNull();
    });
  });

  // AIN-83 — building-page floor-plan enrichment: real floor_plans /
  // price_is_from from deep_extract, surfaced on CrmUnit for the dashboard
  // and chat cards (both flow through this one adapter).
  describe('floor-plan enrichment (AIN-83)', () => {
    const FLOOR_PLANS = [
      { name: 'A11', bedrooms: 1, bathrooms: 1, rent_min: 1819, rent_max: 2118, sqft: 799 },
      { name: 'S1', bedrooms: 0, bathrooms: 1, rent_min: 1825, rent_max: 1825, sqft: 547 },
    ];

    it('populates floorPlans + priceIsFrom from deep_extract when present', () => {
      const unit = toCrmUnit(
        {
          ...BASE_ROW,
          deep_extract: { floor_plans: FLOOR_PLANS, price_is_from: true },
        },
        VIEWER_ID,
      );
      expect(unit.floorPlans).toEqual(FLOOR_PLANS);
      expect(unit.priceIsFrom).toBe(true);
    });

    it('defaults to an empty array / false on a legacy row with no deep_extract', () => {
      const unit = toCrmUnit(BASE_ROW, VIEWER_ID);
      expect(unit.floorPlans).toEqual([]);
      expect(unit.priceIsFrom).toBe(false);
    });

    it('defaults to an empty array / false when deep_extract is explicitly null', () => {
      const unit = toCrmUnit({ ...BASE_ROW, deep_extract: null }, VIEWER_ID);
      expect(unit.floorPlans).toEqual([]);
      expect(unit.priceIsFrom).toBe(false);
    });

    it('treats a null floor_plans / price_is_from inside deep_extract the same as absent', () => {
      const unit = toCrmUnit(
        { ...BASE_ROW, deep_extract: { floor_plans: null, price_is_from: false } },
        VIEWER_ID,
      );
      expect(unit.floorPlans).toEqual([]);
      expect(unit.priceIsFrom).toBe(false);
    });

    it('sets _proposed.unit.floorPlan to the single plan name when exactly one plan exists', () => {
      const unit = toCrmUnit(
        {
          ...BASE_ROW,
          deep_extract: { floor_plans: [FLOOR_PLANS[0]!], price_is_from: true },
        },
        VIEWER_ID,
      );
      expect(unit._proposed.unit.floorPlan).toBe('A11');
    });

    it('leaves _proposed.unit.floorPlan empty (honest, no single label) when multiple plans exist', () => {
      const unit = toCrmUnit(
        { ...BASE_ROW, deep_extract: { floor_plans: FLOOR_PLANS, price_is_from: true } },
        VIEWER_ID,
      );
      expect(unit._proposed.unit.floorPlan).toBe('');
    });

    it('leaves _proposed.unit.floorPlan empty when there are no plans (legacy row)', () => {
      expect(toCrmUnit(BASE_ROW, VIEWER_ID)._proposed.unit.floorPlan).toBe('');
    });
  });

  // AIN-98 — units the user viewed on a saved building (Trinity motivating
  // example: the save recorded a "from" price while the founder viewed a
  // specific, pricier unit). Surfaced from deep_extract.units_of_interest,
  // same never-fabricated contract as floorPlans above.
  describe('units of interest (AIN-98)', () => {
    const UNITS = [
      { zpid: '111', unit_number: 'Unit 101', plan_name: 'S1', price: 1500, viewed_at: '2026-07-01T00:00:00.000Z' },
      { zpid: '222', unit_number: 'Unit 504', plan_name: 'A2', price: 1800, viewed_at: '2026-07-18T07:00:00.000Z' },
    ];

    it('populates unitsOfInterest from deep_extract when present', () => {
      const unit = toCrmUnit(
        { ...BASE_ROW, deep_extract: { units_of_interest: UNITS } },
        VIEWER_ID,
      );
      expect(unit.unitsOfInterest).toEqual(UNITS);
    });

    it('defaults to an empty array on a legacy row with no deep_extract', () => {
      expect(toCrmUnit(BASE_ROW, VIEWER_ID).unitsOfInterest).toEqual([]);
    });

    it('defaults to an empty array when deep_extract is explicitly null', () => {
      expect(toCrmUnit({ ...BASE_ROW, deep_extract: null }, VIEWER_ID).unitsOfInterest).toEqual([]);
    });

    it('defaults to an empty array when units_of_interest is null', () => {
      const unit = toCrmUnit({ ...BASE_ROW, deep_extract: { units_of_interest: null } }, VIEWER_ID);
      expect(unit.unitsOfInterest).toEqual([]);
    });

    it('defaults to an empty array when units_of_interest is malformed (not an array)', () => {
      const unit = toCrmUnit(
        { ...BASE_ROW, deep_extract: { units_of_interest: 'not-an-array' as unknown as never } },
        VIEWER_ID,
      );
      expect(unit.unitsOfInterest).toEqual([]);
    });
  });
});
