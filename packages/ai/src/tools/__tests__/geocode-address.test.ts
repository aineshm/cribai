import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/google-places', () => ({
  textSearchPlace: vi.fn(),
  getPlaceDetails: vi.fn(),
}));

import { geocodeAddress } from '../lib/geocode-address';
import { textSearchPlace, getPlaceDetails } from '../lib/google-places';

const mockTextSearch = vi.mocked(textSearchPlace);
const mockGetDetails = vi.mocked(getPlaceDetails);

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns lat/lng for a valid address', async () => {
    mockTextSearch.mockResolvedValue('place-id-123');
    mockGetDetails.mockResolvedValue({
      id: 'place-id-123',
      displayName: { text: 'Randall Station' },
      rating: 4.0,
      userRatingCount: 50,
      reviews: [],
      location: { latitude: 43.0731, longitude: -89.4012 },
    });

    const result = await geocodeAddress('Randall Station, Madison WI', 'test-key');

    expect(result).toEqual({ latitude: 43.0731, longitude: -89.4012 });
    expect(mockTextSearch).toHaveBeenCalledWith('Randall Station, Madison WI', 'test-key');
    expect(mockGetDetails).toHaveBeenCalledWith('place-id-123', 'test-key', 'location');
  });

  it('returns null when textSearchPlace finds no match', async () => {
    mockTextSearch.mockResolvedValue(null);

    const result = await geocodeAddress('Nonexistent Place', 'test-key');

    expect(result).toBeNull();
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it('returns null when getPlaceDetails has no location', async () => {
    mockTextSearch.mockResolvedValue('place-id-456');
    mockGetDetails.mockResolvedValue({
      id: 'place-id-456',
      displayName: { text: 'Test' },
      rating: 0,
      userRatingCount: 0,
      reviews: [],
    });

    const result = await geocodeAddress('Vague Address', 'test-key');

    expect(result).toBeNull();
  });

  it('returns null on textSearchPlace API error', async () => {
    mockTextSearch.mockRejectedValue(new Error('API error'));

    const result = await geocodeAddress('Some Address', 'test-key');

    expect(result).toBeNull();
  });

  it('returns null on getPlaceDetails API error', async () => {
    mockTextSearch.mockResolvedValue('place-id-789');
    mockGetDetails.mockRejectedValue(new Error('Details API error'));

    const result = await geocodeAddress('Another Address', 'test-key');

    expect(result).toBeNull();
  });
});
