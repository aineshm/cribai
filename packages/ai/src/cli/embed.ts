/**
 * CLI entry point for embedding generation.
 * Run via: npx tsx packages/ai/src/cli/embed.ts
 *
 * Required environment variables:
 * - GEMINI_API_KEY: Google Gemini API key for embedding generation
 * - NEXT_PUBLIC_SUPABASE_URL: Supabase project URL
 * - SUPABASE_SECRET_KEY: Supabase service role key
 */

import { createClient } from '@supabase/supabase-js';
import { embedChangedListings } from '../embeddings/embed-listings';

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_SECRET_KEY environment variable is required');
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Starting embedding generation...');
  const metrics = await embedChangedListings(supabase);

  console.log('Embedding generation complete:');
  console.log(`  Embedded: ${metrics.embedded}`);
  console.log(`  Skipped: ${metrics.skipped}`);
  console.log(`  Errors: ${metrics.errors}`);

  // Output metrics for GitHub Actions
  const metricsJson = JSON.stringify(metrics);
  console.log(`::embed-metrics::${metricsJson}`);

  const total = metrics.embedded + metrics.errors;
  if (total > 0 && metrics.errors / total > 0.5) {
    console.error(`Embedding failure rate too high: ${metrics.errors}/${total}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error('Embedding generation failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
