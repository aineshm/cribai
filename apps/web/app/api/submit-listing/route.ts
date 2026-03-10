import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { listingSubmissionSchema } from '@campusnest/types';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  // Authenticate user
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  // Parse and validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = listingSubmissionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Look up campus_id from user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('campus_id')
    .eq('id', user.id)
    .single();

  const campusId = profile?.campus_id;

  if (!campusId) {
    return NextResponse.json(
      { error: 'No campus associated with your profile. Please complete your profile first.' },
      { status: 400 },
    );
  }

  const {
    address,
    rent_monthly,
    bedrooms,
    bathrooms,
    sqft,
    amenities,
    available_date,
    description,
    source_url,
  } = parsed.data;

  // Use service-role client for the insert (bypasses RLS)
  const serviceClient = createSecretClient();

  const { data: listing, error: insertError } = await serviceClient
    .from('listings')
    .insert({
      campus_id: campusId,
      address,
      rent_monthly,
      bedrooms,
      bathrooms: bathrooms ?? null,
      sqft: sqft ?? null,
      amenities,
      available_date: available_date ?? null,
      description: description ?? null,
      source: 'manual',
      source_url: source_url || null,
      is_active: true,
      last_embedded_at: null,
      external_id: `manual-${user.id}-${Date.now()}`,
      raw_data: { submitted_by: user.id },
    })
    .select('id, address')
    .single();

  if (insertError) {
    console.error('Failed to insert listing:', insertError);
    return NextResponse.json(
      { error: 'Failed to submit listing. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { listing: { id: listing.id, address: listing.address } },
    { status: 201 },
  );
}
