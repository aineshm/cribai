import { NextRequest, NextResponse } from 'next/server';
import { createSecretClient } from '@campusnest/supabase/server';
import { executeTool } from '@campusnest/ai';

interface RequestBody {
  readonly campusSlug?: string;
  readonly bounds?: {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLng: number;
    readonly maxLng: number;
  };
  readonly filters?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body?.campusSlug) {
    return NextResponse.json({ error: 'campusSlug is required' }, { status: 400 });
  }

  const supabase = createSecretClient();
  const { data: campus } = await supabase
    .from('campus_configs')
    .select('id')
    .eq('slug', body.campusSlug)
    .single();

  if (!campus) {
    return NextResponse.json({ error: 'Campus not found' }, { status: 404 });
  }

  const result = await executeTool(
    'search_listings',
    body.filters ?? {},
    {
      supabase,
      campusId: campus.id as string,
      campusSlug: body.campusSlug,
      mapBounds: body.bounds,
    },
  );

  const listings = result.clientBlock.type === 'listing_card'
    ? result.clientBlock.listings
    : [];
  const mapListings = result.mapBlock?.type === 'map'
    ? result.mapBlock.listings
    : [];

  return NextResponse.json({
    machineData: result.machineData ?? {},
    listings,
    mapListings,
  });
}

