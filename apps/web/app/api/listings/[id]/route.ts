/**
 * PATCH /api/listings/[id] — Update listing fields.
 * Requires authentication. Only the listing creator or admin can edit.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// SECURITY: Only allow photo URLs from our Supabase storage domain
const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const safePhotoUrl = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && SUPABASE_HOST
      ? parsed.hostname === SUPABASE_HOST
      : false;
  } catch { return false; }
}, { message: 'Photo URLs must be from approved storage host' });

const updateSchema = z
  .object({
    address: z.string().min(5).max(200).optional(),
    rent_monthly: z.number().min(0).max(10000).optional(),
    bedrooms: z.number().min(0).max(10).optional(),
    bathrooms: z.number().min(0).max(10).optional(),
    sqft: z.number().positive().optional(),
    description: z.string().max(2000).optional(),
    amenities: z.array(z.string()).optional(),
    available_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    contact_email: z.string().email().optional(),
    photo_urls: z.array(safePhotoUrl).max(10).optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // SECURITY: Validate id is a UUID before any DB query
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid listing id' }, { status: 400 });
  }

  // Authenticate user via cookies
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createSecretClient();

  // Fetch listing to verify ownership
  const { data: listing } = await serviceClient
    .from('listings')
    .select('creator_id')
    .eq('id', id)
    .single();

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const isCreator = listing.creator_id === user.id;
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');

  if (!isCreator && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Update listing
  const { error: updateError } = await serviceClient
    .from('listings')
    .update(parsed.data)
    .eq('id', id);

  if (updateError) {
    console.error('[PATCH /api/listings] Update error:', updateError);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
