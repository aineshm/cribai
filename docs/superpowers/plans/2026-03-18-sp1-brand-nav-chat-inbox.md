# Sub-project 1: Brand + Nav + Chat Inbox — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename CampusNest → CribAI everywhere, replace "Post Sublease" nav item with "Chat", build inbox-style conversation history page at `/chat`.

**Architecture:** Pure frontend restructure — no backend changes, no new API routes, no migrations. Reuses existing `/api/conversations` endpoint and ConversationSidebar data fetching pattern. Chat inbox replaces the current sidebar+chat layout with a full-width inbox list that opens focused chat views.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, Framer Motion, lucide-react icons, Supabase client auth.

**Spec:** `docs/superpowers/specs/2026-03-18-cribai-redesign-design.md` (Sub-project 1)

---

### Task 1: Brand Rename — CampusNest → CribAI (apps/web)

**Files:**
- Modify: `apps/web/app/layout.tsx:10` — root metadata title
- Modify: `apps/web/app/page.tsx` — landing page (lines 52, 90, 199, 233, 273)
- Modify: `apps/web/app/(main)/layout.tsx:76` — nav logo text
- Modify: `apps/web/app/(main)/post/page.tsx:5-6` — metadata
- Modify: `apps/web/app/(main)/messages/page.tsx:5` — metadata
- Modify: `apps/web/app/(main)/chat/page.tsx` — metadata
- Modify: `apps/web/app/sublease/page.tsx:6,10,17` — metadata
- Modify: `apps/web/app/sublease/SubleaseClient.tsx:20` — nav header
- Modify: `apps/web/app/terms/page.tsx` — legal text
- Modify: `apps/web/app/privacy/page.tsx` — legal text
- Modify: `apps/web/app/settings/layout.tsx` — settings header
- Modify: `apps/web/components/landing/Footer.tsx:39,84` — footer
- Modify: `apps/web/components/auth/AuthForm.tsx` — login UI
- Modify: `apps/web/components/explore/ListingCard.tsx` — any brand references
- Modify: `apps/web/app/globals.css:71,76` — CSS comments
- Modify: E2E tests with "CampusNest" in selectors/assertions

- [ ] **Step 1:** Run `grep -rn "CampusNest" apps/web/ --include="*.tsx" --include="*.ts" --include="*.css" -l | grep -v ".next/" | grep -v "node_modules/"` to get the complete file list.

- [ ] **Step 2:** For each file, replace all occurrences of "CampusNest" with "CribAI". Use find-and-replace, not manual editing. Be careful with:
  - `"CampusNest — Student Housing Intelligence"` → `"CribAI — Student Housing Intelligence"`
  - `"Sign in to CampusNest"` → `"Sign in to CribAI"`
  - `"How CampusNest works"` → `"How CribAI works"`
  - CSS comments: `/* CampusNest Radii */` → `/* CribAI Radii */`

- [ ] **Step 3:** Run `pnpm run build` to verify no broken imports or references.

- [ ] **Step 4:** Run `grep -rn "CampusNest" apps/web/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v ".next/" | grep -v "node_modules/"` — should return 0 results.

- [ ] **Step 5:** Commit: `git commit -m "chore: rename CampusNest → CribAI in apps/web"`

---

### Task 2: Brand Rename — CampusNest → CribAI (packages/)

**Files:**
- Modify: `packages/ai/src/cribai.ts` — system prompt references
- Modify: `packages/ai/src/intent-classifier.ts` — classifier context
- Modify: `packages/ai/src/tools/schemas.ts` — tool descriptions
- Modify: `packages/ai/src/tools/handlers/create-sublease.ts` — tool context
- Modify: `packages/ai/src/tools/handlers/web-search.ts` — tool context
- Modify: `packages/ai/src/missions/send-email.ts` — email templates
- Modify: `packages/ai/src/missions/__tests__/send-email.test.ts` — test fixtures

- [ ] **Step 1:** Run `grep -rn "CampusNest" packages/ --include="*.ts" -l | grep -v "node_modules/"` to get the complete file list.

- [ ] **Step 2:** Replace all occurrences. Pay special attention to:
  - System prompt in `cribai.ts`: "You are CampusNest AI" → "You are CribAI"
  - Email templates in `send-email.ts`: "Thanks for using CampusNest" → "Thanks for using CribAI"
  - Tool descriptions: "Search CampusNest listings" → "Search CribAI listings"

- [ ] **Step 3:** Run `pnpm run build` — all 7 packages must pass.

- [ ] **Step 4:** Run `pnpm test` — all tests must pass.

- [ ] **Step 5:** Run `grep -rn "CampusNest" packages/ --include="*.ts" | grep -v "node_modules/"` — should return 0 results.

- [ ] **Step 6:** Commit: `git commit -m "chore: rename CampusNest → CribAI in packages/"`

---

### Task 3: Navigation — Replace "Post Sublease" with "Chat"

**Files:**
- Modify: `apps/web/app/(main)/layout.tsx:110-115` — desktop nav
- Modify: `apps/web/components/layout/MobileBottomNav.tsx:24,58-73` — mobile nav

- [ ] **Step 1:** In `apps/web/app/(main)/layout.tsx`, find the "Post Sublease" link (around line 110-115). Replace:
  - `href="/post"` → `href="/chat"`
  - `<PlusCircle className="size-4" />` → `<MessageSquare className="size-4" />`
  - Text: `"Post Sublease"` → `"Chat"`
  - Add `MessageSquare` to the lucide-react import at the top of the file
  - Remove auth gate wrapper if present (Chat should be accessible to all, redirect to login happens at the chat page level)

- [ ] **Step 2:** In `apps/web/components/layout/MobileBottomNav.tsx`, update the nav items array (line 24):
  - Change: `{ href: isAuthenticated ? '/post' : '/login', icon: PlusCircle, label: 'Post', match: '/post', elevated: true }`
  - To: `{ href: isAuthenticated ? '/chat' : '/login', icon: MessageSquare, label: 'Chat', match: '/chat', elevated: true }`
  - Add `MessageSquare` to the lucide-react import
  - Remove `PlusCircle` if no longer used

- [ ] **Step 3:** Run `pnpm run build` to verify.

- [ ] **Step 4:** Commit: `git commit -m "feat: replace Post Sublease with Chat in nav"`

---

### Task 4: Chat Inbox — ConversationInbox Component

**Files:**
- Create: `apps/web/components/chat/ConversationInbox.tsx`

- [ ] **Step 1:** Create `apps/web/components/chat/ConversationInbox.tsx`. This component:

```typescript
'use client';

// Fetches conversations from /api/conversations
// Renders as full-width inbox rows
// Each row: first message preview, relative timestamp, optional mission badge
// "New Chat" button at top
// Click row → calls onSelectConversation(id)
// Empty state when no conversations

interface ConversationInboxProps {
  readonly onSelectConversation: (id: string) => void;
  readonly onNewChat: () => void;
}
```

Reuse the fetch pattern from `components/chat/conversation-sidebar.tsx` (lines 26-46):
- `fetch('/api/conversations')` with abort controller
- Same `Conversation` type: `{ id, title, lastMessagePreview, createdAt, updatedAt }`
- Error/loading states

Layout:
- Full-width container
- Header: "Your Conversations" + "New Chat" button (teal-800, rounded-full)
- Rows: `border-b border-gray-100 px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors`
- Each row: title (font-semibold text-sm), preview (text-xs text-gray-500 truncate), timestamp (text-xs text-gray-400)
- Empty state: centered icon + "No conversations yet" + "New Chat" CTA

- [ ] **Step 2:** Run `pnpm run build` to verify the component compiles.

- [ ] **Step 3:** Commit: `git commit -m "feat: add ConversationInbox component"`

---

### Task 5: Chat Inbox — Rewrite Chat Page

**Files:**
- Modify: `apps/web/app/(main)/chat/page.tsx` — update metadata
- Modify: `apps/web/app/(main)/chat/chat-page-client.tsx` — rewrite layout

- [ ] **Step 1:** Update `apps/web/app/(main)/chat/page.tsx`:
  - Change metadata title: `'Chat — CribAI'`
  - Change description to reference CribAI

- [ ] **Step 2:** Rewrite `apps/web/app/(main)/chat/chat-page-client.tsx`:

Replace the current sidebar+chat layout with:
- **No conversation selected (default):** Show `ConversationInbox` full-width
- **Conversation selected (`?conversation={id}`):** Show focused `CribAIChat` full-screen with back button

```typescript
// State: activeConversationId from URL param
// If no conversation: render <ConversationInbox />
// If conversation: render back button + <CribAIChat /> with conversationId
```

Key behaviors:
- `onSelectConversation` → `router.push('/chat?conversation={id}')`
- `onNewChat` → `router.push('/chat')` and clear conversation param (CribAIChat creates conversation lazily on first message)
- Back button → `router.push('/chat')` to return to inbox
- After a new conversation is created (from CribAIChat callback), update URL to include the new conversation ID

- [ ] **Step 3:** Run `pnpm run build` to verify.

- [ ] **Step 4:** Run `pnpm test` to check for regressions.

- [ ] **Step 5:** Commit: `git commit -m "feat: chat inbox page — conversation list + focused chat view"`

---

### Task 6: Redirect /post → /chat

**Files:**
- Modify: `apps/web/app/(main)/post/page.tsx` — add redirect

- [ ] **Step 1:** Replace the content of `apps/web/app/(main)/post/page.tsx` with a client-side redirect:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PostRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/chat');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Redirecting to chat...</p>
    </div>
  );
}
```

Note: This must be a client component (`'use client'`) because server-side `redirect()` can't show a loading state. The metadata export must be removed (can't have metadata in a client component) — move it to a separate `layout.tsx` if needed, or just remove it.

- [ ] **Step 2:** Update `apps/web/app/sublease/SubleaseClient.tsx` line 88-96: Change `href="/post"` to `href="/chat"`.

- [ ] **Step 3:** Run `pnpm run build` to verify.

- [ ] **Step 4:** Commit: `git commit -m "feat: redirect /post → /chat, update sublease CTA"`

---

### Task 7: Update E2E Tests

**Files:**
- Modify: `apps/web/tests/e2e/homepage.spec.ts` — update CampusNest → CribAI assertions
- Modify: `apps/web/tests/e2e/auth.spec.ts` — update brand assertions
- Modify: `apps/web/tests/e2e/navigation.spec.ts` — update nav item assertions
- Modify: `apps/web/tests/e2e/design-system.spec.ts` — update any brand checks
- Modify: `apps/web/tests/e2e/pages/HomePage.ts` — POM selectors
- Modify: `apps/web/tests/e2e/pages/LoginPage.ts` — POM selectors
- Modify: Other spec files that reference "CampusNest" or "Post Sublease"

- [ ] **Step 1:** Run `grep -rn "CampusNest\|Post Sublease\|Post.*href.*post" apps/web/tests/e2e/ -l` to find all affected test files.

- [ ] **Step 2:** Update all assertions:
  - "CampusNest" → "CribAI" in expected text
  - "Post Sublease" → "Chat" in nav assertions
  - `/post` route checks → `/chat` route checks
  - POM selectors that match brand text

- [ ] **Step 3:** Run `pnpm run build` to verify.

- [ ] **Step 4:** Run E2E tests: `cd apps/web && npx playwright test` (or the project's E2E command).

- [ ] **Step 5:** Commit: `git commit -m "test: update E2E tests for CribAI rebrand + chat nav"`

---

### Task 8: Final Verification + Push

**Files:** None (verification only)

- [ ] **Step 1:** Run `pnpm run build` — must pass with 0 errors.

- [ ] **Step 2:** Run `pnpm test` — all unit tests must pass.

- [ ] **Step 3:** Run `grep -rn "CampusNest" apps/web/ packages/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v ".next/" | grep -v "node_modules/" | grep -v "test-results/"` — should return 0 results in user-facing code. (Test fixtures referencing old brand are acceptable if the test itself is updated.)

- [ ] **Step 4:** Verify in browser:
  - Landing page shows "CribAI" in hero, nav, footer
  - Desktop nav: CribAI | Search | Discover | Agent | Chat
  - Mobile nav: Search | Agent | Chat (elevated) | Saved | Profile
  - `/chat` shows inbox with conversation list
  - Click conversation → focused chat view
  - "New Chat" → empty chat, conversation created on first message
  - `/post` redirects to `/chat`
  - `/sublease` "Post" CTA links to `/chat`
  - Login page says "Sign in to CribAI"

- [ ] **Step 5:** Push: `git push origin main` (Codex pre-push hook will review).
