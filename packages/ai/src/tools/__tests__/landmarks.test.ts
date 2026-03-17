import { describe, it, expect, vi } from 'vitest';
import { extractLocationPhrase, findBestLandmarkMatch, resolveLandmarkFromQuery } from '../landmarks';

// Sample landmark data matching the UW-Madison seed
const SAMPLE_LANDMARKS = [
  { name: 'Engineering Hall', aliases: ['EH', 'College of Engineering', 'engineering'], latitude: 43.0715, longitude: -89.4115, category: 'academic' },
  { name: 'Bascom Hall', aliases: ['Bascom', 'bascom hill'], latitude: 43.0753, longitude: -89.4050, category: 'academic' },
  { name: 'Memorial Union', aliases: ['The Union', 'Terrace', 'Union Terrace', 'Memorial Union Terrace'], latitude: 43.0766, longitude: -89.3999, category: 'recreation' },
  { name: 'Camp Randall Stadium', aliases: ['Camp Randall', 'The Camp'], latitude: 43.0700, longitude: -89.4128, category: 'sports' },
  { name: 'Computer Sciences', aliases: ['CS Building', 'CS', 'Computer Science', 'computer sciences building'], latitude: 43.0716, longitude: -89.4089, category: 'academic' },
  { name: 'State Street', aliases: ['State St'], latitude: 43.0745, longitude: -89.3965, category: 'landmark' },
  { name: 'Grainger Hall', aliases: ['Grainger', 'Business School', 'School of Business', 'Wisconsin School of Business'], latitude: 43.0729, longitude: -89.3986, category: 'academic' },
] as const;

describe('extractLocationPhrase', () => {
  it('extracts "near" patterns', () => {
    expect(extractLocationPhrase('apartments near Engineering Hall')).toBe('Engineering Hall');
    expect(extractLocationPhrase('find apartments near the Union')).toBe('Union');
  });

  it('extracts "close to" patterns', () => {
    expect(extractLocationPhrase('places close to Bascom Hall')).toBe('Bascom Hall');
  });

  it('extracts "by" patterns', () => {
    expect(extractLocationPhrase('studios by Camp Randall')).toBe('Camp Randall');
  });

  it('extracts "walking distance" patterns', () => {
    expect(extractLocationPhrase('apartment walking distance to Engineering Hall')).toBe('Engineering Hall');
  });

  it('strips trailing filter words from location phrase', () => {
    expect(extractLocationPhrase('near Engineering Hall with parking')).toBe('Engineering Hall');
    expect(extractLocationPhrase('near Bascom Hall under $1200')).toBe('Bascom Hall');
    expect(extractLocationPhrase('near the Union for 2 people')).toBe('Union');
  });

  it('strips trailing bedroom/size filters', () => {
    expect(extractLocationPhrase('near Engineering Hall 2 bed')).toBe('Engineering Hall');
    expect(extractLocationPhrase('near Camp Randall 3 br')).toBe('Camp Randall');
  });

  it('returns null for queries without proximity keywords', () => {
    expect(extractLocationPhrase('cheap apartments with parking')).toBeNull();
    expect(extractLocationPhrase('2 bedroom studio downtown')).toBeNull();
  });
});

describe('findBestLandmarkMatch', () => {
  it('matches exact landmark name', () => {
    const match = findBestLandmarkMatch('Engineering Hall', SAMPLE_LANDMARKS);
    expect(match).toEqual({
      name: 'Engineering Hall',
      latitude: 43.0715,
      longitude: -89.4115,
      category: 'academic',
    });
  });

  it('matches alias', () => {
    const match = findBestLandmarkMatch('Camp Randall', SAMPLE_LANDMARKS);
    expect(match).toEqual({
      name: 'Camp Randall Stadium',
      latitude: 43.0700,
      longitude: -89.4128,
      category: 'sports',
    });
  });

  it('matches case-insensitively', () => {
    const match = findBestLandmarkMatch('engineering hall', SAMPLE_LANDMARKS);
    expect(match?.name).toBe('Engineering Hall');
  });

  it('matches partial phrases', () => {
    const match = findBestLandmarkMatch('Business School', SAMPLE_LANDMARKS);
    expect(match?.name).toBe('Grainger Hall');
  });

  it('prefers exact match over partial', () => {
    // "CS" is an alias for Computer Sciences, but "Computer Sciences" should win for full name
    const match = findBestLandmarkMatch('Computer Sciences', SAMPLE_LANDMARKS);
    expect(match?.name).toBe('Computer Sciences');
  });

  it('returns null when no match found', () => {
    const match = findBestLandmarkMatch('Nonexistent Building', SAMPLE_LANDMARKS);
    expect(match).toBeNull();
  });

  it('matches "the Union" to Memorial Union', () => {
    const match = findBestLandmarkMatch('Union', SAMPLE_LANDMARKS);
    expect(match?.name).toBe('Memorial Union');
  });
});

describe('resolveLandmarkFromQuery', () => {
  it('returns landmark match for a proximity query', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: SAMPLE_LANDMARKS,
            error: null,
          }),
        }),
      }),
    } as unknown as Parameters<typeof resolveLandmarkFromQuery>[2];

    const result = await resolveLandmarkFromQuery(
      'find apartments near Engineering Hall',
      'test-campus-id',
      supabase,
    );

    expect(result).toEqual({
      name: 'Engineering Hall',
      latitude: 43.0715,
      longitude: -89.4115,
      category: 'academic',
    });
  });

  it('returns null for non-proximity queries', async () => {
    const supabase = {
      from: vi.fn(),
    } as unknown as Parameters<typeof resolveLandmarkFromQuery>[2];

    const result = await resolveLandmarkFromQuery(
      'cheap 2 bedroom apartments',
      'test-campus-id',
      supabase,
    );

    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns null when no landmarks in DB', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    } as unknown as Parameters<typeof resolveLandmarkFromQuery>[2];

    const result = await resolveLandmarkFromQuery(
      'apartments near Unknown Building',
      'test-campus-id',
      supabase,
    );

    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'DB error' },
          }),
        }),
      }),
    } as unknown as Parameters<typeof resolveLandmarkFromQuery>[2];

    const result = await resolveLandmarkFromQuery(
      'apartments near Engineering Hall',
      'test-campus-id',
      supabase,
    );

    expect(result).toBeNull();
  });
});
