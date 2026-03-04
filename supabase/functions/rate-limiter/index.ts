import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LIMITS: Record<string, { maxRequests: number; windowMinutes: number }> = {
  free: { maxRequests: 10, windowMinutes: 60 },
  pro: { maxRequests: 50, windowMinutes: 60 },
  premium: { maxRequests: 200, windowMinutes: 60 },
};

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const tier = profile?.subscription_tier ?? 'free';
    const limit = LIMITS[tier] ?? LIMITS['free']!;
    const windowStart = new Date(Date.now() - limit.windowMinutes * 60 * 1000).toISOString();

    const { count } = await supabase
      .from('ai_query_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart);

    const remaining = Math.max(0, limit.maxRequests - (count ?? 0));

    return new Response(JSON.stringify({
      allowed: remaining > 0,
      remaining,
      limit: limit.maxRequests,
      windowMinutes: limit.windowMinutes,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
