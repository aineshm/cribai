import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { listingSubmissionSchema } from '@campusnest/types';
import { cookies } from 'next/headers';
import { synthesizeListingText, generateEmbedding } from '@campusnest/ai';

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

  // PDR-003 Track B Day 2: sublease posting is the supply side and still
  // requires .edu verification to prevent non-students from polluting the
  // sublease marketplace. The sign-in `.edu` gate was relaxed (any email
  // can sign in / browse / save), but posting subleases stays gated.
  //
  // The source of truth is `profiles.is_edu_verified` (set by the
  // verify-edu edge function), NOT `auth.users.email`. A user can sign in
  // with a personal gmail address and later verify their .edu via
  // /verify-edu — that flow writes to the profile row, not auth.users.
  // The RLS policy `own_profile_select` lets a user read only their own
  // profile row, so this fetch is safe on the RLS-bound server client.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_edu_verified, campus_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      {
        error:
          'We could not find your profile. Please complete /verify-edu to publish a sublease.',
      },
      { status: 403 },
    );
  }

  if (!profile.is_edu_verified) {
    return NextResponse.json(
      {
        error:
          'Posting a sublease requires a verified .edu email address. Complete /verify-edu with your school email to continue.',
      },
      { status: 403 },
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

  const campusId = profile.campus_id;

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
    contact_email,
    photo_urls,
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
      photo_urls: photo_urls ?? [],
      available_date: available_date ?? null,
      description: description ?? null,
      source: 'sublease',
      source_url: source_url || null,
      contact_email: contact_email ?? null,
      creator_id: user.id,
      is_active: true,
      last_embedded_at: null,
      external_id: `sublease-${user.id}-${Date.now()}`,
      raw_data: {
        submitted_by: user.id,
        is_sublease: true,
        lease_end: (rawBody as Record<string, unknown>)?.lease_end ?? null,
        furnished: (rawBody as Record<string, unknown>)?.furnished ?? null,
        parking: (rawBody as Record<string, unknown>)?.parking ?? null,
        property_type: (rawBody as Record<string, unknown>)?.property_type ?? null,
        floor_level: (rawBody as Record<string, unknown>)?.floor_level ?? null,
      },
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

  // Generate embedding async so the sublease is searchable immediately
  after(async () => {
    try {
      const text = synthesizeListingText({
        address,
        rentMonthly: rent_monthly ?? null,
        bedrooms: bedrooms ?? null,
        bathrooms: bathrooms ?? null,
        sqft: sqft ?? null,
        amenities: amenities ?? [],
        photoCount: photo_urls?.length ?? 0,
      });
      const embedding = await generateEmbedding(text);
      if (embedding) {
        await serviceClient
          .from('listings')
          .update({
            embedding: `[${embedding.join(',')}]`,
            embedding_text: text,
            last_embedded_at: new Date().toISOString(),
          })
          .eq('id', listing.id);
      }
    } catch (err) {
      console.error(`Failed to embed sublease ${listing.id}:`, err);
    }
  });

  return NextResponse.json(
    { listing: { id: listing.id, address: listing.address } },
    { status: 201 },
  );
}
