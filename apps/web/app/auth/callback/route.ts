import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  // Handle expired/used magic links — Supabase sends error_code param
  const errorCode = searchParams.get('error_code');
  if (errorCode) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'magiclink' | 'email' | null;

  // Determine redirect destination
  const lastCampus = request.cookies.get('last_campus')?.value;
  const next = searchParams.get('next')
    ?? (lastCampus ? `/${lastCampus}/cribai` : '/uw-madison/cribai');

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const redirectTo = new URL(next, origin);
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>
      ) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let error: Error | null = null;

  if (code) {
    // PKCE flow — primary path for magic links
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else if (tokenHash) {
    // Token hash flow — fallback for email templates using {{ .TokenHash }}
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type ?? 'magiclink',
    });
    error = result.error;
  }

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  return response;
}
