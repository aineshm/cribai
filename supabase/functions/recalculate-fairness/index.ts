import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    // Only allow service role calls
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY');
    if (!authHeader?.includes(serviceKey ?? '')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceKey!,
    );

    const { data: campuses } = await supabase
      .from('campus_configs')
      .select('id')
      .eq('is_public', true);

    let totalUpdated = 0;

    for (const campus of campuses ?? []) {
      const { data: listings } = await supabase
        .from('listings')
        .select('id, rent_monthly, bedrooms, sqft, amenities')
        .eq('campus_id', campus.id)
        .eq('is_active', true);

      if (!listings || listings.length < 3) continue;

      const rents = listings.map((l) => l.rent_monthly as number);
      const mean = rents.reduce((s, r) => s + r, 0) / rents.length;
      const sorted = [...rents].sort((a, b) => a - b);

      for (const listing of listings) {
        const rent = listing.rent_monthly as number;
        const cheaperCount = sorted.filter((r) => r > rent).length;
        const percentile = Math.round((cheaperCount / sorted.length) * 100);
        const score = Math.round((1 + (percentile / 100) * 9) * 10) / 10;

        await supabase
          .from('listings')
          .update({
            fairness_score: Math.min(10, Math.max(1, score)),
            fairness_data: {
              comparableCount: listings.length,
              percentile,
              predictedRent: Math.round(mean * 100) / 100,
              delta: Math.round(((rent - mean) / mean) * 10000) / 100,
              breakdown: {
                mean: Math.round(mean * 100) / 100,
                median: sorted[Math.floor(sorted.length / 2)],
                min: sorted[0],
                max: sorted[sorted.length - 1],
                score,
              },
            },
          })
          .eq('id', listing.id);

        totalUpdated++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      updatedCount: totalUpdated,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
