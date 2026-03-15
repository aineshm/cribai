import { getCurrentUser } from '../../../lib/get-current-user';
import { ChatPageClient } from './chat-page-client';

export const metadata = {
  title: 'Chat — CampusNest',
  description: 'Ask CampusNest AI about listings, neighborhoods, prices, and more.',
};

/**
 * /chat — Full-page AI chat with conversation sidebar.
 * Accessible from main nav. Replaces the campus-scoped /[campusSlug]/cribai route
 * as the canonical chat destination.
 */
export default async function ChatPage() {
  const { user, supabase } = await getCurrentUser();
  const isAuthenticated = !!user;

  // Default to uw-madison for now (single-campus); multi-campus will derive from profile
  const campusSlug = 'uw-madison';

  let campusId: string | undefined;
  if (isAuthenticated) {
    // Try user's profile campus first, fall back to uw-madison
    const { data: profile } = await supabase
      .from('profiles')
      .select('campus_id')
      .eq('id', user.id)
      .single();

    if (profile?.campus_id) {
      campusId = profile.campus_id as string;
    } else {
      const { data: campus } = await supabase
        .from('campus_configs')
        .select('id')
        .eq('slug', campusSlug)
        .single();
      campusId = campus?.id;
    }
  }

  return (
    <ChatPageClient
      campusSlug={campusSlug}
      campusId={campusId}
      isAuthenticated={isAuthenticated}
    />
  );
}
