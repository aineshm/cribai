import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import {
  DEFAULT_DEV_USER,
  DEV_USER_COOKIE,
  getDevUserById,
  isDevAuthEnabled,
} from '@/lib/dev-auth';

const createTourBodySchema = z.object({
  listingId: z.string().uuid(),
  preferredDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1)
    .max(10),
  notes: z.string().max(500).optional(),
  selectedTime: z.string().trim().min(1).max(100).optional(),
});

function fallbackName(email: string): string {
  const localPart = email.split('@')[0] ?? 'Student';
  return localPart
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  let userId: string | null = null;
  let userEmail: string | null = null;
  let studentName: string | null = null;
  let useSecretClient = false;

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
    userId = devUser?.id ?? DEFAULT_DEV_USER.id;
    userEmail = devUser?.email ?? DEFAULT_DEV_USER.email;
    studentName = devUser?.displayName ?? DEFAULT_DEV_USER.displayName;
    useSecretClient = true;
  } else {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    userId = user.id;
    userEmail = user.email ?? null;
    studentName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.display_name as string | undefined) ??
      null;
  }

  if (!userId || !userEmail) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createTourBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const queryClient = useSecretClient ? createSecretClient() : supabase;

  if (!studentName) {
    const { data: profile } = await queryClient
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();

    studentName = (profile?.display_name as string | null) ?? fallbackName(userEmail);
  }

  const { data: listing, error: listingError } = await queryClient
    .from('listings')
    .select('id, address, campus_id, is_active')
    .eq('id', parsed.data.listingId)
    .single();

  if (listingError || !listing || !listing.is_active) {
    return NextResponse.json(
      { error: 'Listing not found or no longer available.' },
      { status: 404 },
    );
  }

  const combinedNotes = [parsed.data.selectedTime ? `Preferred time: ${parsed.data.selectedTime}` : null, parsed.data.notes ?? null]
    .filter(Boolean)
    .join('\n\n') || null;

  const { data: tour, error: insertError } = await queryClient
    .from('tour_requests')
    .insert({
      listing_id: parsed.data.listingId,
      campus_id: listing.campus_id,
      user_id: userId,
      student_name: studentName,
      student_email: userEmail,
      preferred_dates: parsed.data.preferredDates,
      notes: combinedNotes,
    })
    .select('id, status')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'You already have a pending tour request for this listing.' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: 'Failed to request tour. Please try again later.' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      tourRequestId: tour.id,
      status: tour.status,
      listingAddress: listing.address,
    },
    { status: 201 },
  );
}
