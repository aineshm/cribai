import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Capture console output
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

const MOCK_CONFIG = {
  campusId: 'campus-1',
  campusSlug: 'uw-madison',
  latitude: 43.0731,
  longitude: -89.4012,
  radiusKm: 5,
} as const;

const MOCK_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:dc="http://purl.org/dc/elements/1.1/"
         xmlns:enc="http://purl.oclc.org/net/rss_2.0/enc#"
         xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#">
  <item>
    <title><![CDATA[$1200 / 2br - 800ft2 - Nice apartment near campus]]></title>
    <link>https://madison.craigslist.org/apa/d/madison-nice-apartment/7839123456.html</link>
    <description>Great place</description>
    <dc:date>2026-03-01T10:00:00-06:00</dc:date>
    <geo:lat>43.074</geo:lat>
    <geo:long>-89.395</geo:long>
  </item>
  <item>
    <title><![CDATA[$950 / 1br - Studio near lake]]></title>
    <link>https://madison.craigslist.org/apa/d/madison-studio/7839123457.html</link>
    <description>Cozy studio</description>
    <dc:date>2026-03-02T10:00:00-06:00</dc:date>
    <geo:lat>43.071</geo:lat>
    <geo:long>-89.410</geo:long>
  </item>
  <item>
    <title><![CDATA[$1500 / 3br - Large 3 bedroom]]></title>
    <link>https://madison.craigslist.org/apa/d/madison-large/7839123458.html</link>
    <description>Spacious</description>
    <dc:date>2026-03-03T10:00:00-06:00</dc:date>
    <geo:lat>43.070</geo:lat>
    <geo:long>-89.400</geo:long>
  </item>
</rdf:RDF>`;

describe('CraigslistScraper', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    warnSpy.mockClear();
    logSpy.mockClear();
  });

  it('logs detailed failure reason on 403', async () => {
    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html>Blocked</html>',
    });

    const results = await scraper.scrape();

    expect(results).toEqual([]);
    // Should log with status code and URL details
    const warnCalls = warnSpy.mock.calls.map((c) => c.join(' '));
    const hasDetailedLog = warnCalls.some(
      (msg) => msg.includes('403') && msg.includes('craigslist'),
    );
    expect(hasDetailedLog).toBe(true);
  });

  it('parses all RSS items without cap', async () => {
    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => MOCK_RSS_XML,
    });

    const results = await scraper.scrape();

    // All 3 items parsed, no cap
    expect(results.length).toBe(3);
  });

  it('logs when RSS returns OK but 0 items', async () => {
    const { CraigslistScraper } = await import('../scrapers/craigslist');
    const scraper = new CraigslistScraper(MOCK_CONFIG);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<?xml version="1.0"?><rdf:RDF></rdf:RDF>',
    });

    const results = await scraper.scrape();

    expect(results).toEqual([]);
    const allLogs = logSpy.mock.calls.map((c) => c.join(' '));
    const warnLogs = warnSpy.mock.calls.map((c) => c.join(' '));
    const allOutput = [...allLogs, ...warnLogs];
    const hasEmptyWarning = allOutput.some(
      (msg) => msg.includes('0 items') || msg.includes('empty'),
    );
    expect(hasEmptyWarning).toBe(true);
  });
});
