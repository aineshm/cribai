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
  // All state (campusSlug, campusId, isAuthenticated) is provided by the
  // layout via ChatProvider context — no need to resolve here.
  return <ChatPageClient />;
}
