# Feature Landscape

**Domain:** AI-native student housing search platform
**Researched:** 2026-03-05
**Overall confidence:** MEDIUM-HIGH

## What Already Exists (Phase 6 Complete)

Before categorizing new features, here is what CampusNest already ships:

| Existing Feature | Status |
|------------------|--------|
| AI chat search with natural language (CribAI) | Built |
| 6 function-calling tools (search, detail, compare, tour, lease terms, landlord info) | Built |
| Block-based chat UI (listing cards, comparison tables, tour confirmations, legal disclaimers) | Built |
| Listing scraper (Apartments.com via Crawlee) | Built |
| Cost calculator, fairness scorer, price model | Built |
| Tour request system with dedup | Built |
| Lease term knowledge base (28 terms) | Built |
| Campus-scoped multi-tenancy | Built |
| Rate limiting (free/pro/premium tiers) | Built |
| Landlord reviews schema + RLS | Built |
| Sublets table (schema only) | Schema only |
| Roommate profiles table (schema only) | Schema only |

---

## Table Stakes

Features users expect. Missing = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Working auth flow (magic link end-to-end)** | Cannot use the product without it. Literally a blocker. | Med | Currently broken per PROJECT.md. Fix redirect issue, session exchange, and authenticated routes. |
| **Saved/favorited listings** | Every housing platform (Zillow, Apartments.com, Redfin) has this. Students compare over days/weeks. Without it, users must re-search every session. | Low | Needs a `saved_listings` table (user_id, listing_id, saved_at) + UI heart/bookmark icon. Supabase RLS straightforward. |
| **Listing photo gallery** | Listings without photos are invisible to renters. 3D tours and floor plans are bonus, but photos are baseline. | Med | Scraper likely captures photo URLs from Apartments.com already (check `raw_data` jsonb). Need a gallery component on listing detail page. |
| **Map view with listing pins** | Spatial context is critical for students -- proximity to campus, bus routes, neighborhoods. Zillow/Apartments.com both center on maps. | Med-High | PostGIS is already set up. Use Mapbox GL JS or Google Maps with campus marker + listing pins. Ties into the `location` geography column. |
| **Filters alongside AI chat** | Not everyone wants to chat. Some students know exactly what they want (2BR, < $800, pet-friendly). Traditional filters must coexist with conversational search. | Med | Filter bar on listings page: price range, beds, baths, pet-friendly, available date, distance from campus. AI chat remains the differentiator but filters are the safety net. |
| **Price change alerts** | Students hunt over weeks/months. Price drops on saved listings are high-value notifications. Zillow does this; students expect it. | Med | Requires tracking `rent_monthly` history (price_history table or append to listing snapshots). Email or push notification on change. |
| **Listing freshness indicators** | Students need to know if a listing is current or stale. "Posted 2 days ago" vs "Last updated 3 months ago" builds trust. Stale data kills credibility instantly (per PROJECT.md constraints). | Low | Already have `first_seen_at` and `last_seen_at`. Display relative timestamps and badge stale listings (> 30 days). |
| **Mobile-responsive design** | Students browse on phones between classes. Not a native app (out of scope), but responsive web is non-negotiable. | Med | Next.js + Tailwind v4 makes this straightforward but needs intentional mobile-first design pass, especially for chat UI and map. |
| **Search history / conversation persistence** | If the AI forgets the conversation when the page refreshes, it feels broken. Users expect continuity. | Med | Store chat sessions in Supabase. Resume where left off. This is standard for any chat-based product (ChatGPT, Redfin conversational search). |

## Differentiators

Features that set CampusNest apart. Not expected by default, but create competitive advantage and retention.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Semantic "show me more like this" refinement** | Redfin's conversational search shows 2x listing views and 47% more tour requests when users can say "like this but with a bigger kitchen." CampusNest's AI can do this with PageIndex RAG. No student housing competitor offers this. | Med | Likely works already via CribAI's natural language understanding. May need explicit UI affordance -- a "More like this" button on listing cards that sends a pre-filled prompt. |
| **True Cost transparency** | Students get burned by hidden fees (parking, utilities, amenities fees). CampusNest's `true_cost` calculation is a genuine differentiator. Surface it prominently, not buried in detail views. | Low | Already calculated. Need prominent UI treatment: "Advertised: $800/mo | True Cost: $1,050/mo" with breakdown tooltip. |
| **Fairness Score with explanation** | No competitor scores whether rent is fair for the area. Students are price-sensitive and often first-time renters who cannot judge fairness. This builds trust. | Low | Already calculated (`fairness_score` 1-10 + `fairness_data`). Need a visual gauge/badge and AI-generated plain-English explanation of why the score is what it is. |
| **Landlord reputation system** | Students universally complain about bad landlords. Schema exists (`landlords`, `landlord_reviews`). Build the review UI + aggregate scorecard. Lease-verified reviews are uniquely trustworthy. | Med-High | Schema ready. Need: review submission form (edu-verified users only), scorecard display on listing detail, AI tool to surface landlord reputation in chat. The `get_landlord_info` tool already exists. |
| **Roommate matching (AI-powered)** | RoomSync charges universities thousands. Students use informal Facebook groups and Reddit. AI-powered matching based on lifestyle preferences (sleep schedule, cleanliness, noise tolerance, budget) through conversational interface is a genuine differentiator. | High | Schema exists (`roommate_profiles`). Need: profile questionnaire, matching algorithm (cosine similarity on preference vectors or Gemini-powered matching), match display UI, in-app messaging between matches. |
| **Sublet marketplace** | Summer sublets are a massive pain point at every college campus. No major platform handles student sublets well. Schema exists (`sublets`). | Med-High | Need: posting flow (photos, dates, price), browse/search, campus-scoped feed. Moderate because it requires moderation and photo upload infrastructure. |
| **Lease document analysis** | Students sign leases they do not understand. An AI tool that reads a lease PDF and flags unusual clauses, hidden fees, or missing protections would be transformative. No competitor does this. | High | New Gemini tool: upload PDF, extract text, analyze against the 28-term knowledge base. Flag concerning clauses. Add legal disclaimer. High value but high complexity (PDF parsing, legal accuracy). |
| **Campus-specific neighborhood guides** | "Where should I live near [University]?" is the first question every student asks. AI-generated neighborhood profiles (safety, walkability, nightlife, distance to campus, avg rent) anchored to real listing data. | Med | Can be generated from listing aggregates + campus config. Static content with dynamic pricing data. Good SEO play too. |
| **Application tracking dashboard** | Students apply to multiple apartments simultaneously and lose track. A simple kanban: Applied > Heard Back > Approved > Signed. | Med | New table: `applications` (user_id, listing_id, status, applied_at, notes). Simple CRUD + status board UI. |

## Anti-Features

Features to explicitly NOT build. Each has a reason.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **In-app payments / rent collection** | Massive liability, regulatory burden, Stripe integration complexity. Not the core value prop. Students pay landlords directly. | Link to landlord payment portals. Focus on search and discovery. |
| **Property management dashboard** | Completely different user persona. Building PM tools dilutes focus on the student experience. Marked out of scope in PROJECT.md. | V2 milestone. Build tenant side first, prove value, then attract PMs. |
| **Real-time messaging with landlords** | Requires moderation, abuse handling, real-time infrastructure (websockets). Most landlords prefer email/phone. Building a messaging system is a product in itself. | Surface landlord contact info (email, phone) from listings. Let students use existing channels. |
| **OAuth login (Google, GitHub)** | Magic link with .edu verification is more valuable than OAuth. OAuth adds complexity and removes the .edu verification forcing function. | Stick with magic link. The .edu domain IS the verification. |
| **Nationwide coverage at launch** | Data quality drops with scale. Better to have perfect data for 5 campuses than thin data for 500. Stale/incomplete data destroys trust. | Launch with 3-5 campuses. Nail data freshness and coverage. Expand methodically. |
| **Native mobile app** | Web-first with responsive design covers the use case. App store approval, two codebases, push notification infrastructure -- all overhead for a startup. | Responsive web + PWA for home screen install if needed. |
| **Group/shared account search** | Complex UX and data model questions (shared favorites? group chat? split preferences?). Design decision explicitly deferred in PROJECT.md. | Individual accounts. Students can share listing links. Revisit if user research demands it. |
| **Predictive rent pricing for landlords** | Requires extensive historical data CampusNest does not have yet. PM-side feature. | Focus on fairness scoring for students (already built). Pricing models for PMs come after data accumulation. |
| **Automated lease signing** | Legal complexity, e-signature compliance (ESIGN Act, state laws), liability. DocuSign exists. | Link to landlord's application process. Track application status, not the signing itself. |

## Feature Dependencies

```
Auth (working) ─────────────────────────────────────────────────────────┐
  ├── Saved Listings                                                    │
  │     └── Price Change Alerts                                         │
  ├── Chat Session Persistence                                          │
  ├── Landlord Reviews (requires edu verification)                      │
  ├── Roommate Matching (requires profile)                              │
  │     └── Roommate Profile Questionnaire                              │
  ├── Sublet Posting (requires auth + campus assignment)                │
  ├── Application Tracking                                              │
  └── Lease Document Analysis                                           │
                                                                        │
Scraper Pipeline (validated + scheduled) ───────────────────────────────┤
  ├── Listing Photos (extracted from scrape data)                       │
  ├── Map View (requires location data from scraper)                    │
  ├── Listing Freshness (requires regular scrape cadence)               │
  ├── Price History (requires multiple scrape snapshots over time)      │
  └── Neighborhood Guides (requires aggregate listing data)             │
                                                                        │
Filters + Traditional Search ──── independent of AI, parallel path      │
                                                                        │
True Cost + Fairness Score ──── already built, needs UI surfacing only  │
```

## MVP Recommendation

The next milestone should prioritize making what exists shippable before adding new capabilities. Order by: unblock users first, then build retention, then differentiate.

**Priority 1 -- Unblock (must ship):**
1. **Working auth flow** -- nothing works without this
2. **Scraper pipeline validation** -- no real data = no product
3. **Listing photos** -- listings without photos are dead
4. **Mobile-responsive pass** -- students are on phones

**Priority 2 -- Retain (keep users coming back):**
5. **Saved listings** -- low complexity, high retention signal
6. **Chat session persistence** -- conversations must survive page refresh
7. **Listing freshness indicators** -- trust signal, nearly free to build
8. **Filters alongside AI chat** -- safety net for users who do not want to chat

**Priority 3 -- Differentiate (competitive moat):**
9. **True Cost + Fairness Score UI treatment** -- already calculated, just needs prominent display
10. **Map view** -- spatial context, PostGIS already set up
11. **"More like this" refinement** -- leverages existing AI, small UI addition
12. **Landlord reputation system** -- schema exists, high student value

**Defer to subsequent milestones:**
- Roommate matching: High complexity, needs its own milestone with matching algorithm design
- Sublet marketplace: Needs moderation infrastructure, photo uploads, separate search flow
- Lease document analysis: High complexity, legal sensitivity, needs careful accuracy testing
- Price change alerts: Requires price history accumulation over multiple scrape cycles
- Application tracking: Useful but not core to search/discovery value prop
- Neighborhood guides: Good SEO content play, can be added independently later

## Sources

- [Student Housing Trends 2026 - Research.com](https://research.com/education/student-housing-trends)
- [Student Housing Trends 2025 - Multi-Housing News](https://www.multihousingnews.com/student-housing-trends/)
- [Redfin Conversational Search Launch](https://www.redfin.com/news/redfin-debuts-conversational-search/)
- [Redfin Conversational Search Blog](https://www.redfin.com/blog/redfin-conversational-search/)
- [CoStar AI Experience on Homes.com](https://www.businesswire.com/news/home/20260217810823/en/CoStar-Group-Launches-Transformative-AI-Experience-on-Homes.com-Redefining-the-Future-of-Home-Shopping)
- [Zillow AI-powered Natural Language Search](https://investors.zillowgroup.com/investors/news-and-events/news/news-details/2024/Zillows-AI-powered-home-search-gets-smarter-with-new-natural-language-features/default.aspx)
- [RoomSync Roommate Matching](https://www.roomsync.com/)
- [Off Campus Partners / Apartments.com](https://offcampuspartners.com/)
- [Rent College Pads](https://www.rentcollegepads.com/)
- [Student Housing Trends - StarRez](https://www.starrez.com/post/looking-back-to-move-forward-what-2025-taught-us-about-student-housing-and-how-to-prepare-for-2026)
- [Student Apartment Hunting Anxiety - Daily Illini](https://dailyillini.com/life_and_culture-stories/2022/11/08/students-experience-anxiety-during-apartment-hunting-season/)
- [Student-run Housing App - Daily Nexus](https://dailynexus.com/2025-04-28/student-run-tinder-for-housing-app-targets-isla-vista-housing-challenges/)
- [Conversational AI for Real Estate - Crescendo](https://www.crescendo.ai/blog/conversational-ai-for-real-estate)
- [Uniroomz Student Housing Trends](https://uniroomz.com/student-housing-trends-2024/)
