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
  readonly address: string;
  readonly rent_monthly: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly sqft: number | null;
  readonly amenities: readonly string[] | string[];
  readonly photo_urls: readonly string[] | string[];
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
    .select('id, address, rent_monthly, bedrooms, bathrooms, sqft, amenities, photo_urls, last_embedded_at, updated_at')
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

  // Process sequentially to respect rate limits
  for (const listing of listings as ListingRow[]) {
    try {
      const amenities = Array.isArray(listing.amenities)
        ? listing.amenities as string[]
        : [];
      const photoUrls = Array.isArray(listing.photo_urls)
        ? listing.photo_urls as string[]
        : [];

      const text = synthesizeListingText({
        address: listing.address,
        rentMonthly: listing.rent_monthly,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sqft: listing.sqft,
        amenities,
        photoCount: photoUrls.length,
      });

      const embedding = await generateEmbedding(text);

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
        console.log(`Embedded listing ${listing.id} (${listing.address})`);
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
