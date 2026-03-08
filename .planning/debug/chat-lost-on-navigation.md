---
status: diagnosed
trigger: "Chat content lost on navigation — user has conversation, clicks listing card, presses back, chat is empty"
created: 2026-03-08T00:00:00Z
updated: 2026-03-08T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — Chat state is held only in React useState with zero persistence
test: Searched entire codebase for persistence mechanisms
expecting: N/A — root cause confirmed
next_action: Return diagnosis

## Symptoms

expected: User navigates away from chat and back, conversation history is preserved
actual: Chat page is completely empty after back-button navigation
errors: None reported
reproduction: Open CribAI chat -> have conversation -> click listing card -> press back -> chat is empty
started: Always broken (persistence was never implemented)

## Eliminated

## Evidence

- timestamp: 2026-03-08T00:01:00Z
  checked: apps/web/components/cribai-chat.tsx — the main chat component
  found: Line 38 — `const [messages, setMessages] = useState<readonly Message[]>([])` — messages stored entirely in React component state. No persistence to localStorage, sessionStorage, IndexedDB, or database. Component is a 'use client' component that remounts fresh on every navigation.
  implication: Navigating away unmounts CribAIChat, destroying all messages in useState. Navigating back re-mounts it with empty initial state.

- timestamp: 2026-03-08T00:02:00Z
  checked: apps/web/components/chat/chat-listing-card.tsx
  found: Line 33-36 — Uses Next.js `<Link href={...}>` which triggers a full client-side navigation to listing detail page. This unmounts the entire CribAI page including the CribAIChat component.
  implication: Clicking a listing card in chat results navigates away, unmounting the chat component tree.

- timestamp: 2026-03-08T00:03:00Z
  checked: Searched for ChatContext, ChatProvider, useChatStore across apps/web/
  found: No results. No React Context, no Zustand/Jotai store, no state management for chat.
  implication: There is no state management layer that survives component unmount.

- timestamp: 2026-03-08T00:04:00Z
  checked: Searched for localStorage/sessionStorage usage related to chat across apps/web/
  found: No results. Only profile-modal.tsx uses localStorage (unrelated).
  implication: No browser-side persistence for chat messages.

- timestamp: 2026-03-08T00:05:00Z
  checked: Searched supabase/migrations/ for chat_messages, chat_sessions, conversations tables
  found: No results. No database tables for persisting chat history.
  implication: No server-side persistence for chat messages either.

- timestamp: 2026-03-08T00:06:00Z
  checked: apps/web/app/(campus)/[campusSlug]/cribai/page.tsx
  found: Server component that renders CribAIChat client component. No data fetching for previous chat history. No session/conversation ID concept.
  implication: Even the page-level component has no mechanism to restore previous conversations.

## Resolution

root_cause: Chat messages exist only in React useState (line 38 of cribai-chat.tsx). There is no persistence layer whatsoever — no localStorage, no sessionStorage, no React Context surviving navigation, no database table, no state management library. When the user clicks a listing card (Link component in chat-listing-card.tsx), Next.js navigates to the listing detail page, unmounting CribAIChat and destroying all in-memory state. Pressing back re-mounts CribAIChat with an empty useState([]) initial value.
fix:
verification:
files_changed: []
