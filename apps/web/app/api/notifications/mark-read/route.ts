import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';
import { isDevAuthEnabled, DEV_USER_COOKIE, DEFAULT_DEV_USER } from '../../../../lib/dev-auth';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isDevAuth = isDevAuthEnabled();

  if (!user && !isDevAuth) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  // In dev mode without a real user, resolve from the dev_user_id cookie (falls back to default dev user)
  const devUserId = isDevAuth ? (cookieStore.get(DEV_USER_COOKIE)?.value ?? DEFAULT_DEV_USER.id) : null;
  const userId = user?.id ?? devUserId;

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
