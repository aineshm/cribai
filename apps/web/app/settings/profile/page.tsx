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
    .select('display_name, avatar_url, graduation_year, major')
    .eq('id', user.id)
    .single();

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
      <div className="rounded-xl border border-[var(--surface-200)] bg-white p-6">
        <ProfileForm initialData={initialData} submitLabel="Save changes" />
      </div>
    </div>
  );
}
