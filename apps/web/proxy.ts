import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  isDevAuthEnabled,
  getDevUserById,
  DEFAULT_DEV_USER,
  DEV_USER_COOKIE,
  toSupabaseUser,
} from './lib/dev-auth';

// ---------------------------------------------------------------------------
// Dev auth helper — resolves mock user from cookie
// ---------------------------------------------------------------------------
function resolveDevUser(request: NextRequest) {
  const selectedId = request.cookies.get(DEV_USER_COOKIE)?.value;
  const devUser = selectedId ? getDevUserById(selectedId) : undefined;
  return devUser ?? DEFAULT_DEV_USER;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const { pathname } = request.nextUrl;

  // ------------------------------------------------------------------
  // Dev auth bypass — skip all Supabase auth when BYPASS_AUTH=true
  // ------------------------------------------------------------------
  if (isDevAuthEnabled()) {
    const devUser = resolveDevUser(request);

    // Remember last visited campus (same logic as production)
    const campusMatch = pathname.match(/^\/([^/]+)\/cribai/);
    if (campusMatch?.[1]) {
      response.cookies.set('last_campus', campusMatch[1], {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }

    // Redirect /login to CribAI in dev mode — auth is bypassed
    if (pathname === '/login') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/explore';
      return NextResponse.redirect(redirectUrl);
    }

    // Inject dev user info as headers for downstream server components
    response.headers.set('x-dev-user-id', devUser.id);
    response.headers.set('x-dev-user-email', devUser.email);
    response.headers.set(
      'x-dev-user-json',
      JSON.stringify(toSupabaseUser(devUser)),
    );

    // No redirects, no rate limiting — dev mode is fully open
    return response;
  }

  // ------------------------------------------------------------------
  // Production auth flow (unchanged)
  // ------------------------------------------------------------------
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Remember last visited campus when user hits /{campusSlug}/cribai
  const campusMatch = pathname.match(/^\/([^/]+)\/cribai/);
  if (campusMatch?.[1]) {
    response.cookies.set('last_campus', campusMatch[1], {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  // Protect flat v1.1 routes
  const protectedFlatRoutes = ['/post', '/profile'];
  if (protectedFlatRoutes.some((route) => pathname.startsWith(route)) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protected campus routes — redirect to login if not authenticated
  const protectedRouteMatch = pathname.match(
    /^\/([^/]+)\/(cribai|dashboard|saved|notifications|submit-listing)/
  );
  if (protectedRouteMatch && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Rate limit /api/ai/* routes
  if (pathname.startsWith('/api/ai/') && user) {
    const rateLimitRes = await fetch(
      `${supabaseUrl}/functions/v1/rate-limiter`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ userId: user.id }),
      }
    ).catch(() => null);

    if (rateLimitRes?.ok) {
      const data = await rateLimitRes.json().catch(() => null);
      if (data && !data.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }
  }

  // Block unauthenticated users from /api/ai/*
  if (pathname.startsWith('/api/ai/') && !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
