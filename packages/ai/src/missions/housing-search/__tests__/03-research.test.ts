import { describe, it, expect } from 'vitest';
import {
  extractReviewRating,
  extractReviewSnippet,
  extractWalkScore,
} from '../steps/03-research';

describe('extractReviewRating', () => {
  it('extracts the rating from a standard modelContext string', () => {
    const ctx = 'The Knoll - Google Rating: 4.2/5 (45 ratings)\nSummary: Nice place.';
    expect(extractReviewRating(ctx)).toBe(4.2);
  });

  it('returns null when no rating is present', () => {
    expect(extractReviewRating('Google Places API key not configured.')).toBeNull();
  });

  it('handles integer ratings', () => {
    expect(extractReviewRating('Google Rating: 5/5 (10 ratings)')).toBe(5);
  });
});

describe('extractReviewSnippet', () => {
  it('extracts the first review quote from modelContext', () => {
    const ctx =
      'Reviews:\n- [4/5] "Great location, very walkable" -- Alice (3 months ago)\n' +
      '- [3/5] "Maintenance is slow" -- Bob (1 year ago)';
    const snippet = extractReviewSnippet(ctx);
    expect(snippet).toBe('Great location, very walkable');
  });

  it('returns null when no review quotes are present', () => {
    expect(extractReviewSnippet('No reviews available.')).toBeNull();
  });
});

describe('extractWalkScore', () => {
  it('extracts the walk score from a standard modelContext string', () => {
    const ctx =
      'Neighborhood info for 123 Main St:\n\nWalk Score:\nWalk Score: 75/100 (Very Walkable)';
    expect(extractWalkScore(ctx)).toBe(75);
  });

  it('returns null when walk score is unavailable', () => {
    expect(extractWalkScore('Walk Score: unavailable')).toBeNull();
  });

  it('handles score of 0', () => {
    expect(extractWalkScore('Walk Score: 0/100 (Car-Dependent)')).toBe(0);
  });
});
