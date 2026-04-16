import { NextRequest, NextResponse } from 'next/server';
import { createSecretClient } from '@campusnest/supabase/server';
import { fetchViewportExploreListings } from '@/lib/listings-data';

function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const campusSlug = url.searchParams.get('campusSlug');
  const minLat = parseNumber(url.searchParams.get('minLat'));
  const maxLat = parseNumber(url.searchParams.get('maxLat'));
  const minLng = parseNumber(url.searchParams.get('minLng'));
  const maxLng = parseNumber(url.searchParams.get('maxLng'));
  const limit = parseNumber(url.searchParams.get('limit'));

  if (
    minLat === null ||
    maxLat === null ||
    minLng === null ||
    maxLng === null
  ) {
    return NextResponse.json({ error: 'Missing viewport bounds' }, { status: 400 });
  }

  let campusId: string | null = null;
  if (campusSlug) {
    const supabase = createSecretClient();
    const { data: campus } = await supabase
      .from('campus_configs')
      .select('id')
      .eq('slug', campusSlug)
      .single();
    campusId = (campus?.id as string | undefined) ?? null;
  }

  const listings = await fetchViewportExploreListings({
    bounds: { minLat, maxLat, minLng, maxLng },
    campusId,
    limit: limit ?? undefined,
  });

  return NextResponse.json({ listings });
}

