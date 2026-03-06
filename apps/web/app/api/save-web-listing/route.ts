import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { persistWebListing } from '@campusnest/ai';
import { cookies } from 'next/headers';
import { z } from 'zod';

const bodySchema = z.object({
  address: z.string().min(1),
  sourceUrl: z.string().url(),
  rentMonthly: z.number().optional(),
  bedrooms: z.number().optional(),
  content: z.string(),
  campusId: z.string().uuid(),
});

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
  const rawBody: unknown = await request.json();
  const parsed = bodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { address, sourceUrl, rentMonthly, bedrooms, content, campusId } = parsed.data;

  // Use service-role client for the upsert (needs write access to listings)
  const serviceClient = createSecretClient();

  const listingId = await persistWebListing(
    { address, sourceUrl, rentMonthly, bedrooms, content },
    {
      supabase: serviceClient,
      campusId,
      campusSlug: '', // Not needed for persist operation
      userId: user.id,
    },
  );

  if (!listingId) {
    return NextResponse.json(
      { error: 'Failed to persist web listing' },
      { status: 500 },
    );
  }

  return NextResponse.json({ listingId }, { status: 201 });
}
