import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { textSearchPlace, getPlaceDetails, nearbySearch } from '../lib/google-places';

describe('google-places', () => {
  const mockFetch = vi.fn();
  const API_KEY = 'test-api-key';

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('textSearchPlace', () => {
    it('returns place_id when results exist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          places: [{ id: 'ChIJ_abc123', displayName: { text: 'Test Place' } }],
        }),
      });

      const result = await textSearchPlace('123 Main St, Madison, WI', API_KEY);

      expect(result).toBe('ChIJ_abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchText',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('returns null when no results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ places: [] }),
      });

      const result = await textSearchPlace('Nonexistent Address', API_KEY);

      expect(result).toBeNull();
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(
        textSearchPlace('123 Main St', API_KEY),
      ).rejects.toThrow('403');
    });
  });

  describe('getPlaceDetails', () => {
    it('returns PlaceDetailsResult with reviews', async () => {
      const mockDetails = {
        id: 'ChIJ_abc123',
        displayName: { text: 'Test Apartments' },
        rating: 4.2,
        userRatingCount: 85,
        reviews: [
          {
            rating: 5,
            text: { text: 'Great place!' },
            authorAttribution: { displayName: 'John' },
            relativePublishTimeDescription: '2 months ago',
            publishTime: '2026-01-15T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDetails,
      });

      const fieldMask = 'id,displayName,rating,userRatingCount,reviews';
      const result = await getPlaceDetails('ChIJ_abc123', API_KEY, fieldMask);

      expect(result).toEqual(mockDetails);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places/ChIJ_abc123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': fieldMask,
          }),
        }),
      );
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        getPlaceDetails('invalid-id', API_KEY, 'id'),
      ).rejects.toThrow('404');
    });
  });

  describe('nearbySearch', () => {
    it('returns array of NearbyPlace objects', async () => {
      const mockPlaces = {
        places: [
          {
            displayName: { text: 'Grocery Store' },
            formattedAddress: '456 State St',
            types: ['grocery_store'],
            location: { latitude: 43.07, longitude: -89.4 },
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockPlaces,
      });

      const result = await nearbySearch(43.07, -89.4, 1000, ['grocery_store'], API_KEY);

      expect(result).toEqual(mockPlaces.places);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchNearby',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"includedTypes":["grocery_store"]'),
        }),
      );
    });

    it('returns empty array when no results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await nearbySearch(43.07, -89.4, 500, ['library'], API_KEY);

      expect(result).toEqual([]);
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        nearbySearch(43.07, -89.4, 1000, ['restaurant'], API_KEY),
      ).rejects.toThrow('500');
    });
  });
});
