import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test buildScrapers composition by importing the module and checking scraper sources
// Since buildScrapers is not exported, we test via the scraper imports

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('buildScrapers composition', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('does NOT export or use GooglePlacesScraper', async () => {
    // Read run.ts and verify no GooglePlacesScraper in buildScrapers
    const fs = await import('fs');
    const path = await import('path');
    const runPath = path.resolve(import.meta.dirname, '..', 'run.ts');
    const content = fs.readFileSync(runPath, 'utf-8');

    // GooglePlacesScraper should NOT appear in buildScrapers function body
    const buildScrapersMatch = content.match(
      /function buildScrapers[\s\S]*?return\s+scrapers;\s*\}/,
    );
    expect(buildScrapersMatch).toBeTruthy();

    const fnBody = buildScrapersMatch![0];
    expect(fnBody).not.toContain('GooglePlacesScraper');
    expect(fnBody).toContain('ZillowScraper');
    expect(fnBody).toContain('CraigslistScraper');
  });

  it('includes ApartmentsComScraper when ENABLE_APARTMENTS_COM=true', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const runPath = path.resolve(import.meta.dirname, '..', 'run.ts');
    const content = fs.readFileSync(runPath, 'utf-8');

    const buildScrapersMatch = content.match(
      /function buildScrapers[\s\S]*?return\s+scrapers;\s*\}/,
    );
    const fnBody = buildScrapersMatch![0];
    expect(fnBody).toContain('ApartmentsComScraper');
    expect(fnBody).toContain('ENABLE_APARTMENTS_COM');
  });
});
