import { describe, it, expect, vi } from 'vitest';

// We test extractPhotos by importing a testable version from the scraper
// Since extractPhotos is a private method, we export a standalone function for testing
import { extractPhotos } from '../scrapers/photo-utils';

function mockLocator(options: {
  textContent?: string | null;
  getAttribute?: Record<string, string | null>;
  count?: number;
  nthResults?: Array<{ getAttribute: Record<string, string | null> }>;
} = {}) {
  const first = () => ({
    textContent: vi.fn().mockResolvedValue(options.textContent ?? null),
    getAttribute: vi.fn().mockImplementation((attr: string) =>
      Promise.resolve(options.getAttribute?.[attr] ?? null),
    ),
  });

  const nth = (i: number) => {
    const item = options.nthResults?.[i];
    return {
      getAttribute: vi.fn().mockImplementation((attr: string) =>
        Promise.resolve(item?.getAttribute[attr] ?? null),
      ),
    };
  };

  return {
    first,
    count: vi.fn().mockResolvedValue(options.count ?? 0),
    nth,
  };
}

function mockPage(locators: Record<string, ReturnType<typeof mockLocator>> = {}) {
  return {
    locator: vi.fn().mockImplementation((selector: string) => {
      return locators[selector] ?? mockLocator();
    }),
  } as unknown as import('playwright').Page;
}

function mockLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  } as unknown as import('crawlee').Log;
}

describe('extractPhotos', () => {
  it('returns up to 5 URLs from JSON-LD image array', async () => {
    const jsonLdData = JSON.stringify({
      image: [
        'https://img.example.com/1.jpg',
        'https://img.example.com/2.jpg',
        'https://img.example.com/3.jpg',
        'https://img.example.com/4.jpg',
        'https://img.example.com/5.jpg',
        'https://img.example.com/6.jpg',
      ],
    });

    const page = mockPage({
      'script[type="application/ld+json"]': mockLocator({ textContent: jsonLdData }),
    });

    const result = await extractPhotos(page, mockLog());
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('https://img.example.com/1.jpg');
  });

  it('extracts from JSON-LD photo[].contentUrl', async () => {
    const jsonLdData = JSON.stringify({
      photo: [
        { contentUrl: 'https://img.example.com/a.jpg' },
        { contentUrl: 'https://img.example.com/b.jpg' },
      ],
    });

    const page = mockPage({
      'script[type="application/ld+json"]': mockLocator({ textContent: jsonLdData }),
    });

    const result = await extractPhotos(page, mockLog());
    expect(result).toEqual([
      'https://img.example.com/a.jpg',
      'https://img.example.com/b.jpg',
    ]);
  });

  it('falls back to OG meta tag when JSON-LD has no images', async () => {
    const page = mockPage({
      'script[type="application/ld+json"]': mockLocator({ textContent: '{}' }),
      'meta[property="og:image"]': mockLocator({
        getAttribute: { content: 'https://img.example.com/og.jpg' },
      }),
    });

    const result = await extractPhotos(page, mockLog());
    expect(result).toEqual(['https://img.example.com/og.jpg']);
  });

  it('falls back to carousel DOM selectors', async () => {
    const page = mockPage({
      'script[type="application/ld+json"]': mockLocator({ textContent: null }),
      'meta[property="og:image"]': mockLocator({ getAttribute: { content: null } }),
      '.carouselInner img, [data-tag_section="hero"] img, .heroImageContainer img, picture source': mockLocator({
        count: 2,
        nthResults: [
          { getAttribute: { src: 'https://img.example.com/c1.jpg', 'data-src': null } },
          { getAttribute: { src: 'https://img.example.com/c2.jpg', 'data-src': null } },
        ],
      }),
    });

    const result = await extractPhotos(page, mockLog());
    expect(result).toEqual([
      'https://img.example.com/c1.jpg',
      'https://img.example.com/c2.jpg',
    ]);
  });

  it('returns empty array when no photos found', async () => {
    const page = mockPage({
      'script[type="application/ld+json"]': mockLocator({ textContent: null }),
      'meta[property="og:image"]': mockLocator({ getAttribute: { content: null } }),
    });

    const result = await extractPhotos(page, mockLog());
    expect(result).toEqual([]);
  });

  it('deduplicates URLs', async () => {
    const jsonLdData = JSON.stringify({
      image: [
        'https://img.example.com/1.jpg',
        'https://img.example.com/1.jpg',
        'https://img.example.com/2.jpg',
      ],
    });

    const page = mockPage({
      'script[type="application/ld+json"]': mockLocator({ textContent: jsonLdData }),
    });

    const result = await extractPhotos(page, mockLog());
    expect(result).toEqual([
      'https://img.example.com/1.jpg',
      'https://img.example.com/2.jpg',
    ]);
  });
});
