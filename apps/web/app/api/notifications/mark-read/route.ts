import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Dev auth fallback: check BYPASS_AUTH environment variable
  const isDevAuth =
    process.env.BYPASS_AUTH === 'true' || process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true';

  if (!user && !isDevAuth) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  // In dev mode without a real user, use a default dev user ID
  const userId = user?.id ?? (isDevAuth ? 'dev-user-1' : null);

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  // Use service-role client for dev mode, regular client otherwise
  const queryClient = isDevAuth && !user ? createSecretClient() : supabase;

  const { data, error } = await queryClient
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('id');

  if (error) {
    return NextResponse.json(
      { error: 'Failed to mark notifications as read' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, count: data?.length ?? 0 });
}
