import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the apify-client module
const mockCall = vi.fn();
const mockListItems = vi.fn();

vi.mock('apify-client', () => ({
  ApifyClient: vi.fn().mockImplementation(() => ({
    actor: vi.fn().mockReturnValue({ call: mockCall }),
    dataset: vi.fn().mockReturnValue({ listItems: mockListItems }),
  })),
}));

import { runSearchScraper, runDetailScraper } from '../clients/apify';
import { ApifyClient } from 'apify-client';

describe('Apify Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.mockResolvedValue({ defaultDatasetId: 'test-dataset-id' });
    mockListItems.mockResolvedValue({ items: [] });
  });

  describe('runSearchScraper', () => {
    it('calls the correct actor ID with searchUrls input', async () => {
      const mockItems = [
        { address: '123 Main St', detailUrl: 'https://zillow.com/detail/1' },
      ];
      mockListItems.mockResolvedValueOnce({ items: mockItems });

      const results = await runSearchScraper(
        'test-token',
        'https://www.zillow.com/madison-wi/rentals/',
        10,
      );

      expect(ApifyClient).toHaveBeenCalledWith({ token: 'test-token' });
      expect(mockCall).toHaveBeenCalledWith({
        searchUrls: [{ url: 'https://www.zillow.com/madison-wi/rentals/' }],
        maxItems: 10,
      });
      expect(results).toEqual(mockItems);
    });

    it('returns parsed items from dataset', async () => {
      const mockItems = [
        { address: 'A', detailUrl: '/a' },
        { address: 'B', detailUrl: '/b' },
      ];
      mockListItems.mockResolvedValueOnce({ items: mockItems });

      const results = await runSearchScraper('tok', 'https://example.com');
      expect(results).toHaveLength(2);
    });
  });

  describe('runDetailScraper', () => {
    it('calls correct actor ID with startUrls and rental options', async () => {
      const urls = ['https://zillow.com/detail/1', 'https://zillow.com/detail/2'];
      const mockItems = [{ zpid: '123' }, { zpid: '456' }];
      mockListItems.mockResolvedValueOnce({ items: mockItems });

      const results = await runDetailScraper('test-token', urls);

      expect(mockCall).toHaveBeenCalledWith({
        startUrls: [
          { url: 'https://zillow.com/detail/1' },
          { url: 'https://zillow.com/detail/2' },
        ],
        extractBuildingUnits: 'for_rent',
        propertyStatus: 'FOR_RENT',
      });
      expect(results).toEqual(mockItems);
    });
  });
});
