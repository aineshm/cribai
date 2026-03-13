/**
 * Batch embedding orchestrator.
 * Fetches listings that need (re-)embedding, synthesizes text,
 * generates vectors via Gemini, and updates the database.
 * Processes sequentially to respect Gemini rate limits.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { synthesizeListingText } from './synthesize-text';
import { generateEmbedding } from './generate-embedding';

export interface EmbedMetrics {
  readonly embedded: number;
  readonly skipped: number;
  readonly errors: number;
}

interface ListingRow {
  readonly id: string;
  readonly source: string;
  readonly address: string;
  readonly rent_monthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[] | string[];
  readonly photo_urls: readonly string[] | string[];
  readonly raw_data: Record<string, unknown> | null;
  readonly last_embedded_at: string | null;
  readonly updated_at: string | null;
}

/**
 * Embed all listings that have changed since last embedding.
 * Change detection: last_embedded_at IS NULL OR updated_at > last_embedded_at
 */
export async function embedChangedListings(
  supabase: SupabaseClient,
): Promise<EmbedMetrics> {
  // Fetch listings needing embedding
  // PostgREST can't do cross-column comparisons, so we fetch all active and filter in JS
  const { data: allListings, error: fetchError } = await supabase
    .from('listings')
    .select('id, source, address, rent_monthly, bedrooms, bathrooms, sqft, amenities, photo_urls, raw_data, last_embedded_at, updated_at')
    .eq('is_active', true);

  const listings = (allListings ?? []).filter((l: ListingRow) =>
    l.last_embedded_at === null ||
    (l.updated_at !== null && l.updated_at > l.last_embedded_at)
  );

  if (fetchError) {
    throw new Error(`Failed to fetch listings: ${fetchError.message}`);
  }

  if (listings.length === 0) {
    return { embedded: 0, skipped: 0, errors: 0 };
  }

  let embedded = 0;
  let skipped = 0;
  let errors = 0;

  // Vertex AI pay-as-you-go: 1,500 RPM for embedding models.
  // Keep conservative spacing to avoid burst throttling.
  // 429 handling still present for safety.
  const REQUEST_DELAY_MS = 200;
  const MAX_RPM_RETRIES = 1; // retry once for transient RPM 429s
  let dailyQuotaExhausted = false;
  let consecutive429s = 0;

  console.log(`Embedding ${(listings as ListingRow[]).length} listings (RPD budget: ~1000/day)`);

  // Process sequentially with per-request throttling
  for (let i = 0; i < (listings as ListingRow[]).length; i++) {
    if (dailyQuotaExhausted) {
      skipped += (listings as ListingRow[]).length - i;
      console.log(`Daily quota exhausted — skipping remaining ${(listings as ListingRow[]).length - i} listings (will retry tomorrow)`);
      break;
    }
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
    if (i > 0 && i % 50 === 0) {
      console.log(`Embedding progress: ${embedded} embedded, ${errors} errors, ${skipped} skipped out of ${i} processed`);
    }
    const listing = (listings as ListingRow[])[i]!;
    try {
      const amenities = Array.isArray(listing.amenities)
        ? listing.amenities as string[]
        : [];
      const photoUrls = Array.isArray(listing.photo_urls)
        ? listing.photo_urls as string[]
        : [];

      // For sources with sparse structured fields (e.g. Craigslist), include
      // the raw listing title which often contains the key details.
      const rawTitle = typeof listing.raw_data?.['title'] === 'string'
        ? listing.raw_data['title']
        : undefined;

      const text = synthesizeListingText({
        address: listing.address,
        rentMonthly: listing.rent_monthly,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.sqft,
        amenities,
        photoCount: photoUrls.length,
        rawTitle,
      });

      let embedding: readonly number[] | null = null;
      for (let attempt = 0; attempt <= MAX_RPM_RETRIES; attempt++) {
        try {
          embedding = await generateEmbedding(text);
          break;
        } catch (retryErr) {
          const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
          if (!is429) throw retryErr;

          // Distinguish daily quota (RPD) from per-minute (RPM)
          const isDailyQuota = msg.includes('per day') || msg.includes('PerDay')
            || msg.includes('daily') || msg.includes('RPD');
          if (isDailyQuota) {
            console.log(`Daily quota (RPD) exhausted after ${embedded} embeddings`);
            dailyQuotaExhausted = true;
            skipped++; // count this listing as skipped, not error
            break;
          }

          // RPM transient — back off and retry once
          if (attempt < MAX_RPM_RETRIES) {
            const backoff = 30_000;
            console.log(`RPM rate limited on listing ${listing.id}, backing off ${backoff / 1000}s`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }

          // If retry also failed with 429, likely RPD (3 consecutive = give up)
          consecutive429s++;
          if (consecutive429s >= 3) {
            console.log(`3 consecutive 429s after retries — treating as daily quota exhaustion (${embedded} embedded so far)`);
            dailyQuotaExhausted = true;
            skipped++;
            break;
          }
          throw retryErr;
        }
      }

      if (dailyQuotaExhausted) continue;

      if (!embedding) {
        errors++;
        continue;
      }

      const { error: updateError } = await supabase
        .from('listings')
        .update({
          embedding: `[${embedding.join(',')}]`,
          embedding_text: text,
          last_embedded_at: new Date().toISOString(),
        })
        .eq('id', listing.id);

      if (updateError) {
        console.error(`Failed to update listing ${listing.id}: ${updateError.message}`);
        errors++;
      } else {
        embedded++;
        consecutive429s = 0; // reset on success
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error embedding listing ${listing.id}: ${msg}`);
      errors++;
    }
  }

  console.log(`Embedding complete: ${embedded} embedded, ${skipped} skipped, ${errors} errors`);
  return { embedded, skipped, errors };
}
