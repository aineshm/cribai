/**
 * JSON-LD extraction upgrades for real Zillow page shapes (AIN-62, Phase-0
 * finding 2):
 *
 *   1. `AggregateOffer` support — building pages publish per-floorplan price
 *      RANGES (`lowPrice`/`highPrice`), not a single `price`. The extractor
 *      collapses them to the lowest low bound (the "from" price students
 *      filter by — same range→low rule as og.ts / dom.ts).
 *   2. Deeper entity traversal — on real pages the entity that carries
 *      address/geo/beds nests INSIDE the yielded root: `offers.itemOffered`
 *      (a SingleFamilyResidence) on /homedetails/ pages, `about` (an
 *      ApartmentComplex) on /apartments/ building pages. Nested entities
 *      gap-fill ONLY — the root always wins on conflicts.
 *
 * Deliberately NOT traversed: `containsPlace` children. Those are sub-units /
 * floorplans of a wrapping Place, and reading a specific unit's beds/price as
 * the building's would mislabel the listing (pinned by extraction.test.ts
 * "extracts a top-level Place listing even when nested Apartment children
 * exist").
 */

import { describe, it, expect } from 'vitest';

import { extractFromJsonLd } from '../json-ld';

const URL = 'https://www.zillow.com/apartments/test/';

function htmlWithJsonLd(jsonLd: unknown): string {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(
    jsonLd,
  )}</script></head><body></body></html>`;
}

describe('AggregateOffer price ranges (AIN-62)', () => {
  it('reads lowPrice from a single AggregateOffer', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'RealEstateListing',
        name: 'Building',
        offers: { '@type': 'AggregateOffer', lowPrice: 1825, highPrice: 1990 },
      }),
      URL,
    );
    expect(result?.price).toBe(1825);
  });

  it('takes the MINIMUM lowPrice across multiple AggregateOffers (per-floorplan ranges)', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'RealEstateListing',
        name: 'Building',
        offers: [
          { '@type': 'AggregateOffer', lowPrice: 1825, highPrice: 1990 },
          { '@type': 'AggregateOffer', lowPrice: 1819, highPrice: 2308 },
          { '@type': 'AggregateOffer', lowPrice: 2650, highPrice: 3663 },
        ],
      }),
      URL,
    );
    expect(result?.price).toBe(1819);
  });

  it('prefers a direct offer price over AggregateOffer low bounds', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'RealEstateListing',
        name: 'Mixed',
        offers: [
          { '@type': 'AggregateOffer', lowPrice: 900 },
          { '@type': 'Offer', price: 1500 },
        ],
      }),
      URL,
    );
    // Direct price keeps its existing first-match precedence; the range pass
    // only runs when no offer carried a concrete price.
    expect(result?.price).toBe(1500);
  });

  it('falls back to highPrice when an AggregateOffer has no lowPrice', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'RealEstateListing',
        name: 'High only',
        offers: { '@type': 'AggregateOffer', highPrice: 2100 },
      }),
      URL,
    );
    expect(result?.price).toBe(2100);
  });

  it('ignores non-numeric lowPrice values', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'RealEstateListing',
        name: 'Garbage',
        offers: { '@type': 'AggregateOffer', lowPrice: 'call for pricing' },
      }),
      URL,
    );
    expect(result?.price).toBeUndefined();
  });

  it('parses string lowPrice values like "$1,819"', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'RealEstateListing',
        name: 'String low',
        offers: { '@type': 'AggregateOffer', lowPrice: '$1,819' },
      }),
      URL,
    );
    expect(result?.price).toBe(1819);
  });
});

describe('nested listing entity traversal (AIN-62)', () => {
  // The real /homedetails/ shape: root carries name + offers.price; the
  // SingleFamilyResidence inside offers.itemOffered carries everything else.
  const singleUnitShape = {
    '@type': ['RealEstateListing', 'Product'],
    name: '2306 Kendall Ave, Madison, WI 53726',
    offers: {
      '@type': 'Offer',
      price: 3180,
      itemOffered: {
        '@type': 'SingleFamilyResidence',
        name: 'NESTED NAME MUST NOT WIN',
        numberOfBedrooms: 3,
        floorSize: { '@type': 'QuantitativeValue', value: 1733 },
        address: {
          '@type': 'PostalAddress',
          streetAddress: '2306 Kendall Ave',
          addressLocality: 'Madison',
          addressRegion: 'WI',
          postalCode: '53726',
        },
        geo: { '@type': 'GeoCoordinates', latitude: 43.071693, longitude: -89.42597 },
      },
    },
  };

  it('gap-fills address/beds/geo/sqft from offers.itemOffered', () => {
    const result = extractFromJsonLd(htmlWithJsonLd(singleUnitShape), URL);
    expect(result?.price).toBe(3180);
    expect(result?.bedrooms).toBe(3);
    expect(result?.square_feet).toBe(1733);
    expect(result?.address).toBe('2306 Kendall Ave');
    expect(result?.city).toBe('Madison');
    expect(result?.state).toBe('WI');
    expect(result?.zip).toBe('53726');
    expect(result?.latitude).toBe(43.071693);
    expect(result?.longitude).toBe(-89.42597);
  });

  it('never overwrites a root field with a nested value', () => {
    const result = extractFromJsonLd(htmlWithJsonLd(singleUnitShape), URL);
    expect(result?.title).toBe('2306 Kendall Ave, Madison, WI 53726');
  });

  it('keeps the ROOT entity as raw_json_ld', () => {
    const result = extractFromJsonLd(htmlWithJsonLd(singleUnitShape), URL);
    expect(result?.raw_json_ld?.name).toBe('2306 Kendall Ave, Madison, WI 53726');
  });

  it('gap-fills address/geo/amenities/photo from an `about` ApartmentComplex (building pages)', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': ['RealEstateListing', 'Product'],
        name: 'EO Madison Yards',
        description: 'Luxury living.',
        about: {
          '@type': 'ApartmentComplex',
          name: 'EO Madison Yards',
          address: {
            '@type': 'PostalAddress',
            streetAddress: '4702 Madison Yards Way',
            addressLocality: 'Madison',
            addressRegion: 'WI',
            postalCode: '53705',
          },
          geo: { '@type': 'GeoCoordinates', latitude: 43.074676, longitude: -89.457967 },
          image: 'https://photos.zillowstatic.com/fp/abc-p_d.jpg',
          amenityFeature: [
            { '@type': 'LocationFeatureSpecification', name: 'Fitness Center', value: true },
          ],
        },
        offers: [{ '@type': 'AggregateOffer', lowPrice: 1819, highPrice: 2308 }],
      }),
      URL,
    );
    expect(result?.title).toBe('EO Madison Yards');
    expect(result?.price).toBe(1819);
    expect(result?.address).toBe('4702 Madison Yards Way');
    expect(result?.zip).toBe('53705');
    expect(result?.latitude).toBe(43.074676);
    expect(result?.photos).toEqual(['https://photos.zillowstatic.com/fp/abc-p_d.jpg']);
    expect(result?.amenities).toEqual(['Fitness Center']);
  });

  it('does NOT read containsPlace sub-units (floorplans are not the listing)', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'Place',
        name: 'Main Property',
        address: { '@type': 'PostalAddress', streetAddress: '1 Main St' },
        containsPlace: [
          { '@type': 'Apartment', name: 'Unit A', numberOfBedrooms: 1, offers: { price: 900 } },
        ],
      }),
      URL,
    );
    expect(result?.title).toBe('Main Property');
    expect(result?.bedrooms).toBeUndefined();
    expect(result?.price).toBeUndefined();
  });

  it('does not descend below a yielded nested entity (sub-sub-units stay unread)', () => {
    const result = extractFromJsonLd(
      htmlWithJsonLd({
        '@type': 'RealEstateListing',
        name: 'Root',
        about: {
          '@type': 'ApartmentComplex',
          name: 'Complex',
          containsPlace: { '@type': 'Apartment', numberOfBedrooms: 2, offers: { price: 700 } },
        },
      }),
      URL,
    );
    // The ApartmentComplex itself has no beds/price; its containsPlace child
    // must not leak through two levels of nesting.
    expect(result?.bedrooms).toBeUndefined();
    expect(result?.price).toBeUndefined();
  });
});
