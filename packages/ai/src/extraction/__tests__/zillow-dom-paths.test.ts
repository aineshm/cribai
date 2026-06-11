/**
 * Zillow Layer-3 `__NEXT_DATA__` path upgrades (AIN-62, Phase-0 finding 4).
 *
 * Real Zillow pages no longer keep the listing at
 * `props.pageProps.componentProps.property`. Two shapes exist today:
 *
 *   - single-unit /homedetails/: `componentProps.gdpClientCache` — a JSON
 *     STRING (Apollo cache blob) keyed by GraphQL query, each value holding
 *     a `property` object with price/beds/baths/address/geo/photos
 *     (`responsivePhotos`).
 *   - building /apartments/: `componentProps.initialReduxState.gdp.building`
 *     — buildingName, address parts, lat/lng, `floorPlans[].units[]` with
 *     per-unit price, `galleryPhotos[].mixedSources`.
 *
 * The legacy `componentProps.property` path is kept for older captures.
 */

import { describe, it, expect } from 'vitest';

import { extractZillow } from '../sites/zillow';

const URL = 'https://www.zillow.com/homedetails/test_zpid/';

function htmlWithNextData(data: unknown): string {
  return `<!doctype html><html><head><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    data,
  )}</script></head><body></body></html>`;
}

function gdpCachePage(property: Record<string, unknown>): string {
  const cache = JSON.stringify({
    'ForRentShopperPlatformFullRenderQuery{"zpid":1}': { property },
  });
  return htmlWithNextData({
    props: { pageProps: { componentProps: { zpid: 1, gdpClientCache: cache } } },
  });
}

function buildingPage(building: Record<string, unknown>): string {
  return htmlWithNextData({
    props: { pageProps: { componentProps: { initialReduxState: { gdp: { building } } } } },
  });
}

describe('Zillow gdpClientCache path (single-unit /homedetails/)', () => {
  it('reads price/beds/baths/sqft/address/geo from the cached property', () => {
    const fields = extractZillow(
      gdpCachePage({
        price: 3180,
        bedrooms: 3,
        bathrooms: 1,
        livingArea: 1733,
        streetAddress: '2306 Kendall Ave',
        city: 'Madison',
        state: 'WI',
        zipcode: '53726',
        latitude: 43.071693,
        longitude: -89.42597,
        description: 'All utilities included!',
      }),
      URL,
    );
    expect(fields.price).toBe(3180);
    expect(fields.bedrooms).toBe(3);
    expect(fields.bathrooms).toBe(1);
    expect(fields.square_feet).toBe(1733);
    expect(fields.address).toBe('2306 Kendall Ave');
    expect(fields.city).toBe('Madison');
    expect(fields.state).toBe('WI');
    expect(fields.zip).toBe('53726');
    expect(fields.latitude).toBe(43.071693);
    expect(fields.longitude).toBe(-89.42597);
    expect(fields.description).toBe('All utilities included!');
  });

  it('reads photos from responsivePhotos[].url', () => {
    const fields = extractZillow(
      gdpCachePage({
        price: 1000,
        responsivePhotos: [
          { url: 'https://photos.zillowstatic.com/fp/a.jpg' },
          { url: 'https://photos.zillowstatic.com/fp/b.jpg' },
          { url: 'javascript:alert(1)' },
        ],
      }),
      URL,
    );
    expect(fields.photos).toEqual([
      'https://photos.zillowstatic.com/fp/a.jpg',
      'https://photos.zillowstatic.com/fp/b.jpg',
    ]);
  });

  it('skips cache entries without a property object', () => {
    const cache = JSON.stringify({
      'SomeOtherQuery{}': { viewer: {} },
      'FullRenderQuery{}': { property: { price: 2200, streetAddress: '1 Cache St' } },
    });
    const fields = extractZillow(
      htmlWithNextData({ props: { pageProps: { componentProps: { gdpClientCache: cache } } } }),
      URL,
    );
    expect(fields.price).toBe(2200);
    expect(fields.address).toBe('1 Cache St');
  });

  it('degrades to {} on a malformed gdpClientCache string', () => {
    const fields = extractZillow(
      htmlWithNextData({
        props: { pageProps: { componentProps: { gdpClientCache: '{not json' } } },
      }),
      URL,
    );
    expect(fields).toEqual({});
  });

  it('still reads the legacy componentProps.property path', () => {
    const fields = extractZillow(
      htmlWithNextData({
        props: {
          pageProps: {
            componentProps: { property: { price: 1950, streetAddress: '1 Legacy Ln' } },
          },
        },
      }),
      URL,
    );
    expect(fields.price).toBe(1950);
    expect(fields.address).toBe('1 Legacy Ln');
  });
});

describe('Zillow initialReduxState.gdp.building path (multi-unit /apartments/)', () => {
  const building = {
    buildingName: 'EO Madison Yards',
    fullAddress: '4702 Madison Yards Way, Madison, WI 53705',
    address: { streetAddress: '4702 Madison Yards Way', city: 'Madison', state: 'WI', zipcode: '53705' },
    city: 'Madison',
    state: 'WI',
    zipcode: '53705',
    latitude: 43.074676,
    longitude: -89.457967,
    description: 'Luxury and convenience.',
    floorPlans: [
      { minPrice: 1825, units: [{ price: 1825, beds: 0, baths: 1, sqft: 547 }] },
      { minPrice: 1819, units: [{ price: 1819, beds: 1, baths: 1, sqft: 690 }, { price: 2308 }] },
    ],
    galleryPhotos: [
      {
        mixedSources: {
          jpeg: [
            { url: 'https://photos.zillowstatic.com/fp/g1-d_d.jpg', width: 800 },
            { url: 'https://photos.zillowstatic.com/fp/g1-o_a.jpg', width: 1024 },
          ],
        },
      },
      {
        mixedSources: {
          webp: [{ url: 'https://photos.zillowstatic.com/fp/g2-d_d.webp', width: 800 }],
        },
      },
    ],
  };

  it('projects building-level title/address/geo/description', () => {
    const fields = extractZillow(buildingPage(building), URL);
    expect(fields.title).toBe('EO Madison Yards');
    expect(fields.address).toBe('4702 Madison Yards Way');
    expect(fields.city).toBe('Madison');
    expect(fields.state).toBe('WI');
    expect(fields.zip).toBe('53705');
    expect(fields.latitude).toBe(43.074676);
    expect(fields.longitude).toBe(-89.457967);
    expect(fields.description).toBe('Luxury and convenience.');
  });

  it('collapses the price to the minimum across all floorplan units (the "from" price)', () => {
    const fields = extractZillow(buildingPage(building), URL);
    expect(fields.price).toBe(1819);
  });

  it('does NOT project building-level bedrooms/bathrooms (ambiguous across floorplans)', () => {
    // 24 floorplans span 0-2 beds — a single number would mislabel the
    // building. Labeled-DOM / downstream layers may still fill these.
    const fields = extractZillow(buildingPage(building), URL);
    expect(fields.bedrooms).toBeUndefined();
    expect(fields.bathrooms).toBeUndefined();
  });

  it('reads one photo URL per galleryPhoto (first jpeg, webp fallback)', () => {
    const fields = extractZillow(buildingPage(building), URL);
    expect(fields.photos).toEqual([
      'https://photos.zillowstatic.com/fp/g1-d_d.jpg',
      'https://photos.zillowstatic.com/fp/g2-d_d.webp',
    ]);
  });

  it('omits price when no floorplan unit carries one', () => {
    const fields = extractZillow(
      buildingPage({ buildingName: 'Priceless Tower', floorPlans: [{ units: [{ beds: 1 }] }] }),
      URL,
    );
    expect(fields.title).toBe('Priceless Tower');
    expect(fields.price).toBeUndefined();
  });
});
