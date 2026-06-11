import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    // SUPABASE_SERVICE_ROLE_KEY is auto-injected by Supabase into all edge functions
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceKey || !authHeader?.includes(serviceKey)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceKey,
    );

    const { data: campuses } = await supabase
      .from('campus_configs')
      .select('id, slug, name')
      .eq('is_public', true);

    const results: Array<{ campus: string; listings: number; sections: number }> = [];

    for (const campus of campuses ?? []) {
      const { data: listings } = await supabase
        .from('listings')
        .select('id, address, rent_monthly, bedrooms, bathrooms, sqft, amenities, fairness_score')
        .eq('campus_id', campus.id)
        .eq('source', 'sublease') // AIN-63: CribAI context tree covers discoverable (sublease) inventory only
        .eq('is_active', true);

      if (!listings || listings.length === 0) continue;

      // Group by bedrooms
      const groups: Record<string, typeof listings> = {};
      for (const l of listings) {
        const key = l.bedrooms === null ? 'Unknown'
          : l.bedrooms === 0 ? 'Studios'
          : `${l.bedrooms}-Bedroom`;
        (groups[key] ??= []).push(l);
      }

      // Build tree with statistical summaries (no AI calls in edge function)
      const children = Object.entries(groups).map(([label, group]) => {
        const rents = group.map((l) => l.rent_monthly as number);
        const avg = Math.round(rents.reduce((s, r) => s + r, 0) / rents.length);
        const min = Math.min(...rents);
        const max = Math.max(...rents);

        // Build price tier leaves
        const sorted = [...group].sort((a, b) => (a.rent_monthly as number) - (b.rent_monthly as number));
        const third = Math.ceil(sorted.length / 3);
        const tiers = [
          { label: 'Budget', items: sorted.slice(0, third) },
          { label: 'Mid-range', items: sorted.slice(third, third * 2) },
          { label: 'Premium', items: sorted.slice(third * 2) },
        ].filter(t => t.items.length > 0);

        const leafChildren = tiers.map(tier => {
          const tierRents = tier.items.map(l => l.rent_monthly as number);
          const tierMin = Math.min(...tierRents);
          const tierMax = Math.max(...tierRents);
          const tierAvg = Math.round(tierRents.reduce((s, r) => s + r, 0) / tierRents.length);

          return {
            label: tier.label,
            summary: `${tier.items.length} listings, $${tierMin}-$${tierMax}/mo (avg $${tierAvg})`,
            contentRef: JSON.stringify({
              listingIds: tier.items.map(l => l.id),
              priceRange: { min: tierMin, max: tierMax },
              sampleAddresses: tier.items.slice(0, 5).map(l => l.address),
            }),
            children: [],
          };
        });

        return {
          label,
          summary: `${group.length} listings, $${min}-$${max}/mo (avg $${avg})`,
          contentRef: null,
          children: leafChildren,
        };
      });

      const allRents = listings.map((l) => l.rent_monthly as number);
      const overallAvg = Math.round(allRents.reduce((s, r) => s + r, 0) / allRents.length);

      const tree = {
        label: campus.name,
        summary: `${listings.length} active student subleases near ${campus.name}, avg rent $${overallAvg}/mo across ${Object.keys(groups).length} categories`,
        contentRef: null,
        children,
      };

      await supabase
        .from('pageindex_trees')
        .upsert({
          campus_id: campus.id,
          entity_type: 'listings_overview',
          tree,
          leaf_count: listings.length,
          built_at: new Date().toISOString(),
        }, { onConflict: 'campus_id,entity_type' });

      results.push({ campus: campus.slug, listings: listings.length, sections: children.length });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
