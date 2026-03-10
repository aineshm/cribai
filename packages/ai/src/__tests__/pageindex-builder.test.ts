import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock createGeminiClient before importing PageIndexBuilder
vi.mock('../gemini-client', () => ({
  createGeminiClient: vi.fn(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ text: 'Mock summary.' }),
    },
  })),
}));

import { PageIndexBuilder } from '../pageindex-builder';

function makeListing(overrides: Partial<{
  id: string;
  address: string;
  rent_monthly: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  amenities: string[];
  fairness_score: number | null;
}> = {}) {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    address: overrides.address ?? '123 Langdon St',
    rent_monthly: overrides.rent_monthly ?? 1200,
    bedrooms: 'bedrooms' in overrides ? overrides.bedrooms! : 2,
    bathrooms: overrides.bathrooms ?? 1,
    sqft: overrides.sqft ?? 800,
    amenities: overrides.amenities ?? ['parking'],
    fairness_score: overrides.fairness_score ?? 7.5,
  };
}

describe('PageIndexBuilder', () => {
  let builder: PageIndexBuilder;

  beforeEach(() => {
    builder = new PageIndexBuilder({});
  });

  describe('build', () => {
    it('returns empty root node when no listings provided', async () => {
      const result = await builder.build('campus-1', []);
      expect(result.label).toBe('root');
      expect(result.summary).toBe('No active listings available.');
      expect(result.children).toEqual([]);
    });

    it('groups listings by bedroom count', async () => {
      const listings = [
        makeListing({ id: '1', bedrooms: 1 }),
        makeListing({ id: '2', bedrooms: 2 }),
        makeListing({ id: '3', bedrooms: 2 }),
        makeListing({ id: '4', bedrooms: null }),
      ];

      const result = await builder.build('campus-1', listings);
      const labels = result.children.map(c => c.label);
      expect(labels).toContain('1-Bedroom');
      expect(labels).toContain('2-Bedroom');
      expect(labels).toContain('Unknown');
    });

    it('labels studio apartments as "Studios"', async () => {
      const listings = [makeListing({ id: '1', bedrooms: 0 })];
      const result = await builder.build('campus-1', listings);
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.label).toBe('Studios');
    });

    it('creates price tier leaf nodes within each bedroom group', async () => {
      const listings = [
        makeListing({ id: '1', bedrooms: 2, rent_monthly: 800 }),
        makeListing({ id: '2', bedrooms: 2, rent_monthly: 1000 }),
        makeListing({ id: '3', bedrooms: 2, rent_monthly: 1200 }),
        makeListing({ id: '4', bedrooms: 2, rent_monthly: 1400 }),
        makeListing({ id: '5', bedrooms: 2, rent_monthly: 1600 }),
        makeListing({ id: '6', bedrooms: 2, rent_monthly: 1800 }),
      ];

      const result = await builder.build('campus-1', listings);
      expect(result.children).toHaveLength(1);
      const bedroomNode = result.children[0]!;
      const leafLabels = bedroomNode.children.map(c => c.label);
      expect(leafLabels).toContain('Budget');
      expect(leafLabels).toContain('Mid-range');
      expect(leafLabels).toContain('Premium');
    });

    it('leaf nodes contain contentRef with listing IDs and price range', async () => {
      const listings = [
        makeListing({ id: 'aaa', bedrooms: 1, rent_monthly: 900 }),
        makeListing({ id: 'bbb', bedrooms: 1, rent_monthly: 1100 }),
        makeListing({ id: 'ccc', bedrooms: 1, rent_monthly: 1300 }),
      ];

      const result = await builder.build('campus-1', listings);
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.children.length).toBeGreaterThan(0);
      const leaf = result.children[0]!.children[0]!;
      expect(leaf.contentRef).not.toBeNull();
      const content = JSON.parse(leaf.contentRef!);
      expect(content.listingIds).toBeDefined();
      expect(content.priceRange).toBeDefined();
      expect(content.priceRange.min).toBeDefined();
      expect(content.priceRange.max).toBeDefined();
    });

    it('leaf summary includes count and price range', async () => {
      const listings = [
        makeListing({ id: '1', bedrooms: 1, rent_monthly: 900 }),
      ];

      const result = await builder.build('campus-1', listings);
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.children).toHaveLength(1);
      const leaf = result.children[0]!.children[0]!;
      expect(leaf.summary).toContain('1 listings');
      expect(leaf.summary).toContain('$900');
    });

    it('handles a single listing correctly', async () => {
      const listings = [makeListing({ id: '1', bedrooms: 2, rent_monthly: 1200 })];
      const result = await builder.build('campus-1', listings);
      expect(result.children).toHaveLength(1);
      expect(result.children[0]!.label).toBe('2-Bedroom');
      // Single listing -> one tier
      expect(result.children[0]!.children).toHaveLength(1);
    });

    it('limits sample addresses to 5 in contentRef', async () => {
      const listings = Array.from({ length: 8 }, (_, i) =>
        makeListing({ id: String(i), bedrooms: 1, rent_monthly: 1000 + i, address: `${100 + i} State St` })
      );

      const result = await builder.build('campus-1', listings);
      expect(result.children).toHaveLength(1);
      const leaves = result.children[0]!.children;
      expect(leaves.length).toBeGreaterThan(0);

      for (const leaf of leaves) {
        const content = JSON.parse(leaf.contentRef!);
        expect(content.sampleAddresses.length).toBeLessThanOrEqual(5);
      }
    });
  });
});
