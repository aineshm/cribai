# Phase 6: Agent Tool Expansion + Polish - Research

**Researched:** 2026-03-08
**Domain:** CribAI tool expansion, Supabase chat persistence, placeholder agent tools, ship readiness
**Confidence:** HIGH

## Summary

Phase 6 is the final phase before ship. It has three distinct workstreams: (1) database-backed chat persistence replacing the current sessionStorage approach, (2) adding 3 new placeholder tools (get_reviews, contact_pm, get_neighborhood_info) plus enhancing the existing schedule_tour tool, and (3) ship preparation. The phase also includes DATA-03 (manual listing submission form) and DATA-07 (Reddit/review scraping pipeline), plus CHAT-03 (map tool in chat, which already exists from Phase 3).

The codebase has a well-established pattern for adding tools: define FunctionDeclaration in `schemas.ts`, implement handler in `handlers/`, register in `executor.ts`, add ChatBlock type if needed, and write tests using the mock helpers. All new placeholder tools follow the same pattern but return informative stub responses rather than real data.

Chat persistence requires a Supabase migration for conversations/messages tables, replacing the current sessionStorage approach (Phase 5 gap closure) with database-backed persistence that survives browser close. The existing `ai_query_logs` table already logs queries per user but does not store conversation threads.

**Primary recommendation:** Split into 3 plans: (1) Chat persistence migration + API, (2) New agent tools (3 placeholders + enhanced schedule_tour), (3) Manual listing form (DATA-03) + final polish.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | Conversation history persists across sessions (user can resume previous chats) | Supabase conversations + messages tables with RLS; conversation list UI; load/resume API |
| CHAT-02 | Tour scheduling works end-to-end via chat (mocked backend for v1 -- no real PM integration) | Enhanced schedule_tour handler with calendar awareness; existing tour_requests table supports this |
| CHAT-03 | CribAI has a map tool that renders an interactive map block in the chat UI | ALREADY COMPLETE from Phase 3 (map block exists, MapBox GL JS integrated). Verify only. |
| AGENT-03 | CribAI can discuss reviews for a property (placeholder with "coming soon" UX) | get_reviews placeholder tool returning stub data with clear messaging |
| AGENT-04 | CribAI can provide neighborhood info (walkability, commute, safety, vibe) | get_neighborhood_info placeholder tool returning stub data |
| DATA-03 | Manual listing submission form allows landlords or students to add listings directly | Form UI + Supabase insert with validation; new "submit listing" page |
| DATA-07 | Reddit/review scraping pipeline collects recent reviews for Madison-area properties | Placeholder pipeline or stub; can be "coming soon" per success criteria #5 |
| LIST-05 | Listings display scraped reviews from Reddit and other sources | Depends on DATA-07; placeholder with "coming soon" UX acceptable |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @google/genai | ^1.43.0 | Gemini function calling for tools | Already integrated, all tools use this |
| @supabase/supabase-js | ^2.47.0 | Database, auth, RLS | Existing data layer |
| zod | ^3.24.0 | Input validation for tool handlers | Every handler uses Zod schemas |
| Next.js 15 | ^15.1.0 | App Router, Server Components, API routes | Existing frontend |
| vitest | ^2.1.0 | Testing | All packages use vitest |

### Supporting (no new dependencies needed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | ^2.0.0 | Toast notifications | Form submission feedback |
| mapbox-gl | ^3.19.1 | Map rendering (CHAT-03 already done) | Already integrated |

### No New Dependencies Required

This phase adds no new npm packages. All work uses existing libraries. The placeholder tools are pure TypeScript returning static responses. Chat persistence uses Supabase (already integrated). The manual listing form uses existing Next.js form patterns + Supabase insert.

## Architecture Patterns

### Recommended Project Structure (new files only)
```
supabase/migrations/
  010_chat_conversations.sql         # conversations + messages tables

packages/ai/src/tools/
  handlers/
    get-reviews.ts                    # Placeholder handler
    contact-pm.ts                     # Placeholder handler
    get-neighborhood-info.ts          # Placeholder handler
  __tests__/
    get-reviews.test.ts
    contact-pm.test.ts
    get-neighborhood-info.test.ts

apps/web/
  app/(campus)/[campusSlug]/
    cribai/
      page.tsx                        # Updated to load conversations
    submit-listing/
      page.tsx                        # Manual listing form (DATA-03)
  app/api/
    conversations/
      route.ts                        # CRUD for conversations
      [id]/
        route.ts                      # Load specific conversation
  components/
    chat/
      conversation-sidebar.tsx        # Conversation list + new chat
      chat-review-placeholder.tsx     # Review placeholder block
      chat-neighborhood-info.tsx      # Neighborhood info block
    submit-listing-form.tsx           # Manual listing form component
```

### Pattern 1: Placeholder Tool Handler
**What:** Tool that returns informative stub data with clear "coming soon" messaging
**When to use:** AGENT-03, AGENT-04, contact_pm
**Example:**
```typescript
// Source: Existing pattern from get-landlord-info.ts (returns informative message when data not linked)
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';

const inputSchema = z.object({
  listing_id: z.string().uuid().optional(),
  address: z.string().optional(),
});

export async function getReviews(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const parsed = inputSchema.parse(args);

  const modelContext = `Review aggregation is coming soon. Currently, CribAI cannot pull reviews from Reddit, Yelp, or Google Maps automatically. Suggest the student check these sources directly for now: Reddit r/UWMadison, Google Maps reviews, and Yelp.`;

  return {
    modelContext,
    clientBlock: {
      type: 'text',
      content: 'Review aggregation is coming soon! In the meantime, check Reddit r/UWMadison, Google Maps, and Yelp for community feedback on this property.',
    },
  };
}
```

### Pattern 2: Database Chat Persistence
**What:** Conversations table with messages stored as JSONB blocks
**When to use:** CHAT-01 implementation
**Example:**
```sql
-- Source: Follows existing patterns from 001_initial_schema.sql and 007_saved_listings_notifications.sql
CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campus_id   uuid REFERENCES campus_configs(id) NOT NULL,
  title       text NOT NULL DEFAULT 'New Conversation',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  blocks          jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_conversations_user ON conversations (user_id, updated_at DESC);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, created_at ASC);
```

### Pattern 3: Enhanced Schedule Tour (Calendar Awareness)
**What:** Upgrade existing schedule_tour to show user's existing tour conflicts and PM contact info
**When to use:** CHAT-02 enhancement
**Example:**
```typescript
// Check for existing tours on requested dates before inserting
const { data: existingTours } = await context.supabase
  .from('tour_requests')
  .select('preferred_dates, listing_id')
  .eq('user_id', context.userId!)
  .eq('status', 'pending');

// Warn about conflicts in modelContext
const conflicts = existingTours?.filter(t =>
  (t.preferred_dates as string[]).some(d => parsed.preferred_dates.includes(d))
);
```

### Anti-Patterns to Avoid
- **Over-engineering placeholders:** Placeholder tools should return text blocks, not custom block types. Keep them simple -- a text response saying "coming soon" with helpful alternatives is enough.
- **Client-side conversation storage:** sessionStorage is already in place as a bridge. Database persistence should replace it (not layer on top). Remove sessionStorage logic when DB persistence works.
- **Blocking on DATA-07:** The Reddit scraping pipeline is listed as a requirement but success criteria explicitly allow placeholders. Do not build a full scraping pipeline -- return stub data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chat message storage format | Custom serialization | JSONB column storing ChatBlock arrays | Supabase handles JSONB natively, existing block types serialize cleanly |
| Form validation (listing submission) | Manual field validation | Zod schema + server-side validation | Consistent with every other form in the app |
| Conversation title generation | Complex summarization | First user message truncated to 50 chars | Simple, predictable, no AI cost per conversation |
| Date conflict detection | Custom calendar logic | SQL overlap query on preferred_dates array | Database handles array intersection efficiently |

## Common Pitfalls

### Pitfall 1: sessionStorage vs Database Race Condition
**What goes wrong:** If both sessionStorage and database persistence exist simultaneously, messages can get out of sync or duplicate.
**Why it happens:** sessionStorage writes on every message update; database writes could be async with different timing.
**How to avoid:** When database persistence is active (user authenticated), disable sessionStorage persistence entirely. Use sessionStorage only as fallback for unauthenticated users.
**Warning signs:** Duplicate messages appearing on page reload.

### Pitfall 2: ChatBlock Serialization in JSONB
**What goes wrong:** ChatBlock discriminated union types may not round-trip cleanly through JSON serialization and Zod parsing.
**Why it happens:** JSONB in Postgres strips type information; Zod discriminated unions need the `type` field to be present.
**How to avoid:** Store blocks as raw JSON arrays in JSONB. When loading, validate with `chatBlockSchema.array().safeParse()` and filter out any blocks that fail validation (graceful degradation).
**Warning signs:** Type errors on conversation load, blocks rendering incorrectly.

### Pitfall 3: Conversation List Performance
**What goes wrong:** Loading all messages for all conversations to generate previews is expensive.
**Why it happens:** No preview/summary field on conversations table.
**How to avoid:** Store `last_message_preview` (first 100 chars of last message) on the conversations table. Update it on each message insert. This avoids joining messages table for the conversation list.
**Warning signs:** Slow conversation list load times.

### Pitfall 4: RLS on Conversations Table
**What goes wrong:** Users can see other users' conversations if RLS is not properly configured.
**Why it happens:** Missing or incorrect RLS policies.
**How to avoid:** Follow the exact pattern from `saved_listings` and `tour_requests`: `auth.uid() = user_id` for all operations. Use service-role client only for the API route handler.
**Warning signs:** Data leaking between users.

### Pitfall 5: Placeholder Tools Not Registered in Gemini
**What goes wrong:** Gemini does not know about new tools because they are only added to the executor but not to the FunctionDeclaration array.
**Why it happens:** Forgetting to add the schema to `CRIBAI_TOOLS` in `schemas.ts`.
**How to avoid:** Checklist for each new tool: (1) schema in schemas.ts, (2) handler in handlers/, (3) registration in executor.ts, (4) test file, (5) update CRIBAI_TOOLS export.
**Warning signs:** Gemini never calls the tool even when prompted.

## Code Examples

### New Tool Registration Pattern (verified from existing codebase)
```typescript
// 1. schemas.ts - Add FunctionDeclaration
const getReviews: FunctionDeclaration = {
  name: 'get_reviews',
  description: 'Get reviews and community feedback for a property or landlord. Use when the user asks about reviews, ratings, or reputation of a property.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      listing_id: { type: Type.STRING, description: 'UUID of the listing' },
      address: { type: Type.STRING, description: 'Address to search reviews for' },
    },
  },
};

// 2. Add to CRIBAI_TOOLS array
export const CRIBAI_TOOLS: readonly FunctionDeclaration[] = [
  searchListings, getListingDetail, compareListings, scheduleTour,
  explainLeaseTerm, getLandlordInfo, getSavedListings, webSearch,
  getReviews, contactPm, getNeighborhoodInfo,  // NEW
];

// 3. executor.ts - Register handler
import { getReviews } from './handlers/get-reviews';
const HANDLERS: Record<string, ...> = {
  ...existing,
  get_reviews: getReviews,
  contact_pm: contactPm,
  get_neighborhood_info: getNeighborhoodInfo,
};
```

### Conversation API Route Pattern
```typescript
// app/api/conversations/route.ts
import { createClient } from '@campusnest/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 401);

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title, updated_at, last_message_preview')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20);

  return Response.json({ conversations });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError('Unauthorized', 401);

  const body = await request.json();
  const { data: conversation } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      campus_id: body.campusId,
      title: body.title ?? 'New Conversation',
    })
    .select('id')
    .single();

  return Response.json({ conversation });
}
```

### Manual Listing Submission Pattern (DATA-03)
```typescript
// Zod schema for listing submission
const listingSubmissionSchema = z.object({
  address: z.string().min(5).max(200),
  rent_monthly: z.number().positive().max(10000),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0).max(10).optional(),
  sqft: z.number().positive().optional(),
  amenities: z.array(z.string()).default([]),
  available_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).optional(),
  contact_email: z.string().email(),
  source_url: z.string().url().optional(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| sessionStorage chat persistence | Database-backed conversations (Phase 6) | This phase | Conversations survive browser close, accessible from any device |
| schedule_tour basic insert | Enhanced with conflict detection + PM info | This phase | Better UX, prevents double-booking |
| 8 tools total | 11 tools (3 placeholders added) | This phase | Agent demonstrates broader capability |

**CHAT-03 status:** The map tool (CHAT-03) was completed in Phase 3 (03-03-PLAN.md). MapBox GL JS integration with price pins, popups, and block renderer integration is fully working. This requirement only needs verification, not implementation.

## Open Questions

1. **AGENT-03/AGENT-04 not in REQUIREMENTS.md**
   - What we know: These requirement IDs appear in the ROADMAP.md Phase 6 entry but are NOT defined in REQUIREMENTS.md (same issue as AGENT-01/AGENT-02 in Phase 5, noted in 05-VERIFICATION.md)
   - What's unclear: Their exact definitions (inferred from roadmap success criteria)
   - Recommendation: Treat as defined by roadmap success criteria. AGENT-03 = reviews discussion capability, AGENT-04 = neighborhood info capability. Not a blocker.

2. **DATA-07 scope**
   - What we know: Reddit/review scraping is listed as a requirement but success criteria #5 allows placeholders
   - What's unclear: Whether any real scraping is expected or purely placeholder
   - Recommendation: Implement as placeholder with clear "coming soon" UX. A real Reddit scraping pipeline is complex (rate limiting, Reddit API changes, relevance filtering) and not worth building for v1 when the success criteria explicitly allow stubs.

3. **Conversation history sent to Gemini**
   - What we know: Currently last 10 messages are sent as conversation history to the API
   - What's unclear: How to handle loading a full old conversation -- send entire history or just recent context?
   - Recommendation: On resume, load full conversation for display but only send last 10 messages to Gemini (consistent with current behavior). This avoids context window bloat.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.1.0 |
| Config file | `packages/ai/vitest.config.ts`, `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/ai test -- --run` |
| Full suite command | `pnpm -r test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | Conversations persist in DB and are resumable | integration | `pnpm --filter @campusnest/web build` | No -- Wave 0 |
| CHAT-02 | Schedule tour with conflict detection | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/schedule-tour.test.ts` | Yes (needs update) |
| CHAT-03 | Map tool renders in chat | unit | Already tested in Phase 3 | Yes |
| AGENT-03 | get_reviews returns placeholder with helpful info | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/get-reviews.test.ts` | No -- Wave 0 |
| AGENT-04 | get_neighborhood_info returns placeholder | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/get-neighborhood-info.test.ts` | No -- Wave 0 |
| DATA-03 | Manual listing form validates and inserts | unit | `pnpm --filter @campusnest/web test -- --run` | No -- Wave 0 |
| DATA-07 | Review data available (placeholder OK) | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/get-reviews.test.ts` | No -- Wave 0 |
| LIST-05 | Listing displays reviews (placeholder OK) | manual-only | Visual verification of placeholder UI | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/ai test -- --run && pnpm --filter @campusnest/web build`
- **Per wave merge:** `pnpm -r test -- --run && pnpm -r build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/ai/src/tools/__tests__/get-reviews.test.ts` -- covers AGENT-03, DATA-07
- [ ] `packages/ai/src/tools/__tests__/contact-pm.test.ts` -- covers contact_pm placeholder
- [ ] `packages/ai/src/tools/__tests__/get-neighborhood-info.test.ts` -- covers AGENT-04

## Sources

### Primary (HIGH confidence)
- Project codebase: Direct analysis of schemas.ts, executor.ts, types.ts, cribai.ts, chat.ts, all handler files, migrations, and chat components
- Phase 5 summaries: 05-05-SUMMARY.md confirming sessionStorage bridge and database persistence deferred to Phase 6
- ROADMAP.md: Phase 6 definition with tool inventory and success criteria

### Secondary (MEDIUM confidence)
- REQUIREMENTS.md: CHAT-01, CHAT-02, CHAT-03, DATA-03, DATA-07, LIST-05 definitions (AGENT-03/AGENT-04 inferred from roadmap)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies needed, all patterns established in prior phases
- Architecture: HIGH - Tool registration, handler pattern, Supabase migration pattern all well-established with 8 existing tools as reference
- Pitfalls: HIGH - Based on direct analysis of existing codebase patterns and Phase 5 sessionStorage implementation
- Chat persistence: MEDIUM - Database schema is straightforward but conversation resume UX (sidebar, load, send to Gemini) has design decisions

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable domain, no external API changes expected)
