import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authHeader?.includes(serviceKey ?? '')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceKey!,
    );

    // Phase 5: Full PageIndex rebuild with Haiku summaries
    // For now: build a simple statistical summary tree

    const { data: campuses } = await supabase
      .from('campus_configs')
      .select('id, slug, name')
      .eq('is_public', true);

    for (const campus of campuses ?? []) {
      const { data: listings } = await supabase
        .from('listings')
        .select('rent_monthly, bedrooms, address')
        .eq('campus_id', campus.id)
        .eq('is_active', true);

      if (!listings || listings.length === 0) continue;

      const rents = listings.map((l) => l.rent_monthly as number);
      const avgRent = Math.round(rents.reduce((s, r) => s + r, 0) / rents.length);

      const tree = {
        label: campus.name,
        summary: `${listings.length} active listings, avg rent $${avgRent}/mo`,
        contentRef: null,
        children: [],
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
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
