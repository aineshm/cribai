import { ChatPageClient } from './chat-page-client';

export const metadata = {
  title: 'Chat — CribAI',
  description: 'Ask CribAI about listings, neighborhoods, prices, and more.',
};

/**
 * /chat — Inbox-style AI chat with conversation history.
 * Shows conversation list by default, focused chat view when a conversation is selected.
 */
export default async function ChatPage() {
  return <ChatPageClient />;
}
