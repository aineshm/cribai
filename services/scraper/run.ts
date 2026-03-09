import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../../apps/web/.env.local') });
dotenvConfig({ path: resolve(__dirname, '../../.env') });

import { createClient } from '@supabase/supabase-js';
import { CraigslistScraper } from './scrapers/craigslist';
import { ZillowScraper } from './scrapers/zillow';
import { ApartmentsComScraper } from './scrapers/apartments-com';
// GooglePlacesScraper reserved for Phase 6 get_neighborhood_info enrichment
// import { GooglePlacesScraper } from './scrapers/google-places';
import { normalizeListing } from './normalizer';
import type { ScraperConfig } from './scrapers/base-scraper';
import type { BaseScraper } from './scrapers/base-scraper';
import { outputMetrics } from './metrics';
import type { ScrapeMetrics } from './metrics';
import { archiveStaleListings } from './lifecycle';
import { detectPriceChanges, createPriceChangeNotifications } from './price-change-detector';
import { createDiagnostic, formatDiagnosticReport, type SourceDiagnostic } from './diagnostics';
import { parseWkbPoint } from '@campusnest/utils';

const VALID_SOURCES = ['zillow', 'craigslist', 'all'] as const;
type Source = (typeof VALID_SOURCES)[number];

function parseArgs(): { source: Source; limit: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let source: Source = 'all';
  let limit = 500;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      const val = args[i + 1]!;
      if (!(VALID_SOURCES as readonly string[]).includes(val)) {
        throw new Error(`Invalid --source "${val}". Must be one of: ${VALID_SOURCES.join(', ')}`);
      }
      source = val as Source;
      i++;
    }
    if (args[i] === '--limit' && args[i + 1]) {
      const parsed = parseInt(args[i + 1]!, 10);
      if (isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit "${args[i + 1]}". Must be a positive integer.`);
      }
      limit = parsed;
      i++;
    }
    if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  return { source, limit, dryRun };
}

function buildScrapers(
  config: ScraperConfig,
  source: Source,
  limit: number,
): readonly BaseScraper[] {
  const scrapers: BaseScraper[] = [];

  if (source === 'craigslist' || source === 'all') {
    scrapers.push(new CraigslistScraper(config));
  }

  if (source === 'zillow' || source === 'all') {
    scrapers.push(new ZillowScraper(config, limit));
  }

  // Apartments.com as fallback -- frequently blocked, kept for when it works
  if (source === 'all' && process.env.ENABLE_APARTMENTS_COM === 'true') {
    scrapers.push(new ApartmentsComScraper(config));
  }

  return scrapers;
}

async function main() {
  const { source, limit, dryRun } = parseArgs();

  console.log(`[orchestrator] source=${source}, limit=${limit}, dryRun=${dryRun}`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!dryRun && (!supabaseUrl || !serviceRoleKey)) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  }

  const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

  // Fetch active campus configs (or use default for dry run)
  let campuses: Array<{
    id: string;
    slug: string;
    name: string;
    scrape_radius_km: number;
    location: string;
  }>;

  if (supabase) {
    const { data, error } = await supabase
      .from('campus_configs')
      .select('id, slug, name, scrape_radius_km, is_public, location')
      .eq('is_public', true);

    if (error) {
      throw new Error(`Failed to fetch campuses: ${error.message}`);
    }
    campuses = (data ?? []) as typeof campuses;
  } else {
    // Dry run without DB -- use default UW-Madison config
    campuses = [
      {
        id: 'dry-run',
        slug: 'uw-madison',
        name: 'UW-Madison',
        scrape_radius_km: 5,
        location: '',
      },
    ];
  }

  const metrics: { -readonly [K in keyof ScrapeMetrics]: ScrapeMetrics[K] extends Record<string, unknown> ? Record<string, { found: number; upserted: number; errors: number }> : number } = {
    upserted: 0, staleMarked: 0, archived: 0, deleted: 0, errors: 0, notifications: 0, perSource: {},
  };
  const allDiagnostics: SourceDiagnostic[] = [];

  for (const campus of campuses) {
    let coords: { latitude: number; longitude: number } | null;

    if (campus.location) {
      coords = parseWkbPoint(campus.location);
      if (!coords) {
        console.warn(`[${campus.slug}] Could not parse location -- skipping campus`);
        continue;
      }
    } else {
      // Default coords for dry run
      coords = { latitude: 43.0731, longitude: -89.4012 };
    }

    const config: ScraperConfig = {
      campusId: campus.id,
      campusSlug: campus.slug,
      latitude: coords.latitude,
      longitude: coords.longitude,
      radiusKm: campus.scrape_radius_km,
    };

    console.log(`\n=== Scraping ${campus.name} (${campus.slug}) ===`);

    const scrapers = buildScrapers(config, source, limit);
    let campusHadFailure = false;

    for (const scraper of scrapers) {
      const scraperStart = Date.now();
      let scraperFound = 0;
      let scraperUpserted = 0;
      let scraperError: string | undefined;

      try {
        const rawListings = await scraper.scrape();
        const allNormalized = rawListings.map(normalizeListing);
        // Filter out listings missing required fields (e.g. null rent violates NOT NULL constraint)
        const normalized = allNormalized.filter((l) => l.rentMonthly !== null);
        if (normalized.length < allNormalized.length) {
          console.log(`[${scraper.source}] Filtered ${allNormalized.length - normalized.length} listings with missing rent`);
        }
        scraperFound = normalized.length;

        if (normalized.length === 0) {
          console.log(`[${scraper.source}] No listings found`);
        } else if (dryRun) {
          console.log(`[dry-run] Would upsert ${normalized.length} listings from ${scraper.source}`);
          scraperUpserted = normalized.length;
          metrics.upserted += normalized.length;
        } else if (supabase) {
          // Detect price changes BEFORE upsert (old prices still in DB)
          const priceChanges = await detectPriceChanges(
            supabase,
            config.campusId,
            config.campusSlug,
            normalized,
          );

          const rows = normalized.map((listing) => ({
            campus_id: config.campusId,
            external_id: listing.externalId,
            source: listing.source,
            raw_data: listing.rawData,
            address: listing.address,
            location: listing.latitude != null && listing.longitude != null
              ? `POINT(${listing.longitude} ${listing.latitude})`
              : null,
            rent_monthly: listing.rentMonthly,
            bedrooms: listing.bedrooms,
            bathrooms: listing.bathrooms,
            sqft: listing.sqft,
            amenities: listing.amenities,
            available_date: listing.availableDate,
            photo_urls: listing.photoUrls,
            source_url: listing.sourceUrl,
            is_active: true,
            last_seen_at: new Date().toISOString(),
          }));

          // Upsert in chunks to prevent one bad row from killing the entire batch
          const CHUNK_SIZE = 200;
          let chunkErrors = 0;
          for (let c = 0; c < rows.length; c += CHUNK_SIZE) {
            const chunk = rows.slice(c, c + CHUNK_SIZE);
            const { error: upsertError } = await supabase
              .from('listings')
              .upsert(chunk, { onConflict: 'external_id,source' });

            if (upsertError) {
              console.error(`[${scraper.source}] Upsert error (chunk ${Math.floor(c / CHUNK_SIZE) + 1}): ${upsertError.message}`);
              chunkErrors++;
            } else {
              scraperUpserted += chunk.length;
            }
          }

          if (chunkErrors > 0) {
            metrics.errors += chunkErrors;
            scraperError = `Upsert failed: ${chunkErrors} chunk(s) errored`;
            campusHadFailure = true;
          }

          if (scraperUpserted > 0) {
            console.log(`[${scraper.source}] Upserted ${scraperUpserted} listings`);
            metrics.upserted += scraperUpserted;

            // Only notify when all chunks succeeded. Price changes reference
            // existing DB rows (which rarely fail on update), but we can't
            // reliably map PriceChange.listingId (UUID) back to chunk membership
            // without an extra DB round-trip. Skip notifications on partial failure
            // to avoid notifying for rows that weren't actually persisted.
            if (chunkErrors === 0 && priceChanges.length > 0) {
              const notifCount = await createPriceChangeNotifications(supabase, priceChanges);
              metrics.notifications += notifCount;
              console.log(`[${scraper.source}] Created ${notifCount} price change notifications`);
            }
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[${scraper.source}] Scraper failed:`, err);
        metrics.errors += 1;
        scraperError = errMsg;
        campusHadFailure = true;
      }

      // Record diagnostic for this scraper
      const diag = createDiagnostic(scraper.source, scraperStart, {
        found: scraperFound,
        upserted: scraperUpserted,
        error: scraperError,
      });
      allDiagnostics.push(diag);

      // Update per-source metrics
      const prev = metrics.perSource[scraper.source] ?? { found: 0, upserted: 0, errors: 0 };
      metrics.perSource[scraper.source] = {
        found: prev.found + scraperFound,
        upserted: prev.upserted + scraperUpserted,
        errors: prev.errors + (scraperError ? 1 : 0),
      };
    }

    // Mark stale listings as inactive (not seen in 7 days)
    // Only run lifecycle cleanup when all sources ran successfully
    if (!dryRun && supabase && source === 'all' && !campusHadFailure) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: staleData } = await supabase
        .from('listings')
        .update({ is_active: false })
        .eq('campus_id', config.campusId)
        .eq('is_active', true)
        .lt('last_seen_at', sevenDaysAgo)
        .select('id');

      metrics.staleMarked += staleData?.length ?? 0;

      // Archive and delete listings inactive for 30+ days
      const archiveResult = await archiveStaleListings(supabase, config.campusId);
      metrics.archived += archiveResult.archived;
      metrics.deleted += archiveResult.deleted;
    }
  }

  // Output per-source diagnostic report
  if (allDiagnostics.length > 0) {
    const diagnosticReport = formatDiagnosticReport(allDiagnostics);
    console.log('\n' + diagnosticReport);
    // Emit for GH Actions job summary parsing
    console.log(`::diagnostic::${diagnosticReport}`);
  }

  console.log('\nScraping complete.');
  outputMetrics(metrics as ScrapeMetrics);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
