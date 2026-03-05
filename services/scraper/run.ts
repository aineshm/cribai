import { createClient } from '@supabase/supabase-js';
import { ApartmentsComScraper } from './scrapers/apartments-com';
import { normalizeListing } from './normalizer';
import type { ScraperConfig } from './scrapers/base-scraper';
import { outputMetrics } from './metrics';
import { archiveStaleListings } from './lifecycle';

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
    .select('*')
    .eq('is_public', true);

  if (error) {
    throw new Error(`Failed to fetch campuses: ${error.message}`);
  }

  const metrics: {
    upserted: number;
    staleMarked: number;
    archived: number;
    deleted: number;
    errors: number;
  } = { upserted: 0, staleMarked: 0, archived: 0, deleted: 0, errors: 0 };

  for (const campus of campuses ?? []) {
    const location = campus.location as { coordinates: [number, number] } | null;
    const config: ScraperConfig = {
      campusId: campus.id,
      campusSlug: campus.slug,
      latitude: location?.coordinates[1] ?? 0,
      longitude: location?.coordinates[0] ?? 0,
      radiusKm: campus.scrape_radius_km,
    };

    console.log(`\n=== Scraping ${campus.name} (${campus.slug}) ===`);

    const scrapers = [
      new ApartmentsComScraper(config),
      // Add more scrapers here: ZillowScraper, ZumperScraper, etc.
    ];

    for (const scraper of scrapers) {
      try {
        const rawListings = await scraper.scrape();
        const normalized = rawListings.map(normalizeListing);

        if (normalized.length === 0) {
          console.log(`[${scraper.source}] No listings found`);
          continue;
        }

        // Upsert listings (including photo_urls and source_url)
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
