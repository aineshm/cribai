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
import { archiveStaleListings } from './lifecycle';
import { detectPriceChanges, createPriceChangeNotifications } from './price-change-detector';

/**
 * Parse PostGIS EWKB hex (SRID=4326 POINT) into lat/lng.
 * Format: byte-order(2) + type(8) + srid(8) + x(16) + y(16) = 50 hex chars
 */
function parseWkbPoint(hex: string): { latitude: number; longitude: number } | null {
  if (!hex || hex.length < 50) return null;
  try {
    const buf = Buffer.from(hex, 'hex');
    const le = buf[0] === 1;
    const readDouble = le
      ? (offset: number) => buf.readDoubleLE(offset)
      : (offset: number) => buf.readDoubleBE(offset);
    const x = readDouble(9);  // longitude
    const y = readDouble(17); // latitude
    if (isNaN(x) || isNaN(y)) return null;
    return { latitude: y, longitude: x };
  } catch {
    return null;
  }
}

function buildScrapers(config: ScraperConfig): readonly BaseScraper[] {
  const scrapers: BaseScraper[] = [
    new CraigslistScraper(config),
    new ZillowScraper(config),
  ];

  // Apartments.com as fallback — frequently blocked, kept for when it works
  if (process.env.ENABLE_APARTMENTS_COM === 'true') {
    scrapers.push(new ApartmentsComScraper(config));
  }

  return scrapers;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Fetch active campus configs
  const { data: campuses, error } = await supabase
    .from('campus_configs')
    .select('id, slug, name, scrape_radius_km, is_public, location')
    .eq('is_public', true);

  if (error) {
    throw new Error(`Failed to fetch campuses: ${error.message}`);
  }

  const metrics = { upserted: 0, staleMarked: 0, archived: 0, deleted: 0, errors: 0, notifications: 0 };

  for (const campus of campuses ?? []) {
    const coords = parseWkbPoint(campus.location as string);
    if (!coords) {
      console.warn(`[${campus.slug}] Could not parse location — skipping campus`);
      continue;
    }

    const config: ScraperConfig = {
      campusId: campus.id,
      campusSlug: campus.slug,
      latitude: coords.latitude,
      longitude: coords.longitude,
      radiusKm: campus.scrape_radius_km,
    };

    console.log(`\n=== Scraping ${campus.name} (${campus.slug}) ===`);

    const scrapers = buildScrapers(config);

    for (const scraper of scrapers) {
      try {
        const rawListings = await scraper.scrape();
        const normalized = rawListings.map(normalizeListing);

        if (normalized.length === 0) {
          console.log(`[${scraper.source}] No listings found`);
          continue;
        }

        // Detect price changes BEFORE upsert (old prices still in DB)
        const priceChanges = await detectPriceChanges(
          supabase,
          config.campusId,
          config.campusSlug,
          normalized,
        );

        // Upsert listings
        const rows = normalized.map((listing) => ({
          campus_id: config.campusId,
          external_id: listing.externalId,
          source: listing.source,
          raw_data: listing.rawData,
          address: listing.address,
          location: listing.latitude && listing.longitude
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

        const { error: upsertError } = await supabase
          .from('listings')
          .upsert(rows, { onConflict: 'external_id,source' });

        if (upsertError) {
          console.error(`[${scraper.source}] Upsert error: ${upsertError.message}`);
          metrics.errors += 1;
        } else {
          console.log(`[${scraper.source}] Upserted ${normalized.length} listings`);
          metrics.upserted += normalized.length;

          // Create notifications for price changes AFTER successful upsert
          if (priceChanges.length > 0) {
            const notifCount = await createPriceChangeNotifications(supabase, priceChanges);
            metrics.notifications += notifCount;
            console.log(`[${scraper.source}] Created ${notifCount} price change notifications`);
          }
        }
      } catch (err) {
        console.error(`[${scraper.source}] Scraper failed:`, err);
        metrics.errors += 1;
      }
    }

    // Mark stale listings as inactive (not seen in 7 days)
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

  console.log('\nScraping complete.');
  outputMetrics(metrics);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
