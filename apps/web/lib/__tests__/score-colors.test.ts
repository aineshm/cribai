import { describe, it, expect } from 'vitest';
import { getScoreColorVariants } from '../score-colors';

describe('getScoreColorVariants', () => {
  it('returns good colors for score >= 7', () => {
    const result = getScoreColorVariants(7);
    expect(result.bg).toContain('fair-good-bg');
    expect(result.text).toContain('fair-good');
    expect(result.border).toContain('fair-good');
    expect(result.bgOnly).toContain('fair-good');
  });

  it('returns good colors for score of 10', () => {
    const result = getScoreColorVariants(10);
    expect(result.bg).toContain('fair-good-bg');
  });

  it('returns ok colors for score >= 4 and < 7', () => {
    const result = getScoreColorVariants(4);
    expect(result.bg).toContain('fair-ok-bg');
    expect(result.text).toContain('fair-ok');
    expect(result.border).toContain('fair-ok');
    expect(result.bgOnly).toContain('fair-ok');
  });

  it('returns ok colors for score of 6.9', () => {
    const result = getScoreColorVariants(6.9);
    expect(result.bg).toContain('fair-ok-bg');
  });

  it('returns bad colors for score < 4', () => {
    const result = getScoreColorVariants(3.9);
    expect(result.bg).toContain('fair-bad-bg');
    expect(result.text).toContain('fair-bad');
    expect(result.border).toContain('fair-bad');
    expect(result.bgOnly).toContain('fair-bad');
  });

  it('returns bad colors for score of 0', () => {
    const result = getScoreColorVariants(0);
    expect(result.bg).toContain('fair-bad-bg');
  });

  it('returns bad colors for negative score', () => {
    const result = getScoreColorVariants(-1);
    expect(result.bg).toContain('fair-bad-bg');
  });

  it('returns an object with all four color keys', () => {
    const result = getScoreColorVariants(5);
    expect(result).toHaveProperty('bg');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('border');
    expect(result).toHaveProperty('bgOnly');
  });

  it('transitions at the exact boundary of 7', () => {
    const below = getScoreColorVariants(6.999);
    const at = getScoreColorVariants(7);
    expect(below.bg).toContain('fair-ok-bg');
    expect(at.bg).toContain('fair-good-bg');
  });

  it('transitions at the exact boundary of 4', () => {
    const below = getScoreColorVariants(3.999);
    const at = getScoreColorVariants(4);
    expect(below.bg).toContain('fair-bad-bg');
    expect(at.bg).toContain('fair-ok-bg');
  });
});
