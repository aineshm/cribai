import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { ProfileForm } from '../../../components/profile-form';

export default async function ProfileSettingsPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, graduation_year, major, campus_id')
    .eq('id', user.id)
    .single();

  // Resolve university name from campus_id or use v1 default
  let universityName = 'University of Wisconsin-Madison';
  if (profile?.campus_id) {
    const { data: campus } = await supabase
      .from('campus_configs')
      .select('university_name')
      .eq('id', profile.campus_id)
      .single();
    if (campus?.university_name) {
      universityName = campus.university_name;
    }
  }

  const initialData = {
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    graduationYear: profile?.graduation_year ?? null,
    major: profile?.major ?? null,
  };

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold text-[var(--surface-900)]">
        Edit Profile
      </h2>
      <div className="rounded-xl border border-[var(--surface-200)] bg-white p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            University
          </label>
          <p className="rounded-lg border border-[var(--surface-200)] bg-[var(--surface-50)] px-3 py-2 text-sm text-[var(--surface-500)]">
            {universityName}
          </p>
        </div>
        <ProfileForm initialData={initialData} submitLabel="Save changes" />
      </div>
    </div>
  );
}
