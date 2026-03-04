import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { eduEmail } = await req.json() as { eduEmail: string };
    if (!eduEmail || typeof eduEmail !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing eduEmail' }), { status: 400 });
    }

    const domain = eduEmail.split('@')[1]?.toLowerCase();
    if (!domain) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
    }

    // Check if domain matches any campus
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SECRET_KEY')!,
    );

    const { data: campuses } = await adminClient
      .from('campus_configs')
      .select('id, edu_domains')
      .eq('is_public', true);

    const matchingCampus = campuses?.find((c) =>
      (c.edu_domains as string[]).includes(domain)
    );

    if (!matchingCampus) {
      return new Response(JSON.stringify({
        error: 'Email domain not recognized as a supported university',
        verified: false,
      }), { status: 400 });
    }

    // Update profile with edu verification
    // In production: send verification email, set status to 'pending'
    // For MVP: auto-verify if domain matches
    await adminClient
      .from('profiles')
      .update({
        edu_email: eduEmail,
        campus_id: matchingCampus.id,
        is_edu_verified: true,
        verification_status: 'verified',
      })
      .eq('id', user.id);

    return new Response(JSON.stringify({
      verified: true,
      campusId: matchingCampus.id,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
