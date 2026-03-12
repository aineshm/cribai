---
phase: 17-real-tool-integrations
verified: 2026-03-11T22:30:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
human_verification:
  - test: "Invoke get_reviews tool via CribAI chat with a real listing address"
    expected: "Returns Google Places rating, Gemini-generated 2-3 sentence summary, and notable review quotes with author attribution"
    why_human: "Requires live GOOGLE_PLACES_API_KEY and GEMINI_API_KEY provisioned in environment; cannot execute real API calls in automated verification"
  - test: "Invoke get_neighborhood_info tool with a listing that has lat/lng in DB"
    expected: "Returns numeric Walk Score, Transit Score, Bike Score with descriptions, and categorized nearby amenities (Grocery, Dining, Fitness, Health, Services)"
    why_human: "Requires live WALKSCORE_API_KEY and GOOGLE_PLACES_API_KEY; DB listing must have lat/lng columns populated from migration"
  - test: "Invoke contact_pm tool with a listing that has landlord_id set in DB"
    expected: "Returns landlord name, company, phone, email contact card and a casual Gemini-drafted student inquiry message"
    why_human: "Requires migration 014 applied and landlord record linked to listing; requires live GEMINI_API_KEY"
---

# Phase 17: Real Tool Integrations Verification Report

**Phase Goal:** The three placeholder tool stubs are replaced with real implementations that return live data — Google Places reviews, Walk Score + neighborhood amenities, and PM contact info with draft inquiry messages — cached appropriately and testable independently of the mission executor.

**Verified:** 2026-03-11T22:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | api_cache table exists with key (PK), response (JSONB), expires_at columns and RLS enabled | VERIFIED | `014_api_cache_landlord_contacts.sql` lines 5-14: CREATE TABLE api_cache with all required columns, index, and RLS ENABLE |
| 2 | landlords table has phone and email text columns | VERIFIED | Migration line 17-18: `ALTER TABLE landlords ADD COLUMN IF NOT EXISTS phone text` and `email text` |
| 3 | listings table has landlord_id FK referencing landlords(id) | VERIFIED | Migration line 21: `ALTER TABLE listings ADD COLUMN IF NOT EXISTS landlord_id uuid REFERENCES landlords(id)` |
| 4 | Google Places client can Text Search, get Place Details, and Nearby Search with category filtering | VERIFIED | `google-places.ts` exports `textSearchPlace`, `getPlaceDetails`, `nearbySearch`; all call `places.googleapis.com/v1`; 8 tests passing |
| 5 | Walk Score client returns walk/transit/bike scores for an address+coords | VERIFIED | `walkscore.ts` exports `getWalkScore`; calls `api.walkscore.com`; returns WalkScoreResult with walkscore, transit, bike; 3 tests passing |
| 6 | Cache module reads non-expired entries and returns null for expired/missing | VERIFIED | `api-cache.ts` getCached: checks expiry with `expiresAt < Date.now()`, returns null on error or expiry; 3 getCached tests passing |
| 7 | Cache module upserts entries with computed expires_at timestamp | VERIFIED | `api-cache.ts` setCache: `upsert({ key, response, expires_at }, { onConflict: 'key' })`; setCache test verifies exact upsert payload |
| 8 | Reviews tool returns real Google Places ratings and Gemini-generated summary with review quotes | VERIFIED | `get-reviews.ts` 173 lines: calls textSearchPlace + getPlaceDetails, generates Gemini summary for 3+ reviews, formats quote block with attribution; 10 tests passing |
| 9 | Reviews tool caches results for 24 hours via api_cache | VERIFIED | `get-reviews.ts` line 13: `CACHE_TTL_MS = 86_400_000`; setCache called with this TTL after building result |
| 10 | Neighborhood tool returns Walk Score (walk/transit/bike) and categorized nearby amenities | VERIFIED | `get-neighborhood-info.ts` 192 lines: calls getWalkScore + nearbySearch, categorizePlaces groups by TYPE_CATEGORY_MAP; 7 tests passing |
| 11 | Neighborhood tool resolves address from listing_id via DB lookup | VERIFIED | `get-neighborhood-info.ts` resolveListingLocation queries `listings` for address, lat, lng by UUID |
| 12 | Neighborhood tool caches results for 7 days via api_cache | VERIFIED | `get-neighborhood-info.ts` line 15: `CACHE_TTL_MS = 604_800_000`; setCache called with 7-day TTL |
| 13 | PM contact tool returns landlord contact data (name, company, phone, email) from DB | VERIFIED | `contact-pm.ts` fetchLandlord queries `landlords` table for name, company, phone, email; formatContactCard renders them |
| 14 | PM contact tool generates a casual draft inquiry message via Gemini | VERIFIED | `contact-pm.ts` generateDraft calls Gemini with student-tone prompt including address, beds, baths, rent; appends user message if provided |
| 15 | PM contact tool gracefully handles missing landlord_id (returns fallback with listing contact_email) | VERIFIED | `contact-pm.ts` line 121-123: if landlord_id is null, skips fetchLandlord; formatContactCard returns limited contact with contact_email |
| 16 | All three tools return ToolResult with modelContext string and properly typed clientBlock | VERIFIED | All three handlers return `{ modelContext: string, clientBlock: { type: 'text', content: string } }`; executor.ts imports and registers all three |

**Score:** 16/16 truths verified

---

### Required Artifacts

| Artifact | Provided | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/014_api_cache_landlord_contacts.sql` | api_cache table, landlord phone/email, listings landlord_id FK | VERIFIED | 24 lines, substantive SQL — all required DDL present |
| `packages/ai/src/tools/lib/api-cache.ts` | getCached and setCache functions | VERIFIED | 50 lines, exports confirmed, supabase.from('api_cache') wired |
| `packages/ai/src/tools/lib/google-places.ts` | textSearchPlace, getPlaceDetails, nearbySearch | VERIFIED | 126 lines, all 3 exports confirmed, calls places.googleapis.com |
| `packages/ai/src/tools/lib/walkscore.ts` | getWalkScore with graceful degradation | VERIFIED | 86 lines, export confirmed, calls api.walkscore.com, try/catch returns NULL_RESULT |
| `packages/ai/src/tools/handlers/get-reviews.ts` | Google Places reviews with Gemini summary | VERIFIED | 173 lines (min 60), exports getReviews, full implementation |
| `packages/ai/src/tools/handlers/get-neighborhood-info.ts` | Walk Score + categorized amenities | VERIFIED | 192 lines (min 60), exports getNeighborhoodInfo, full implementation |
| `packages/ai/src/tools/handlers/contact-pm.ts` | Landlord contact + Gemini draft | VERIFIED | 152 lines (min 50), exports contactPm, full implementation |
| `packages/ai/src/tools/__tests__/api-cache.test.ts` | 4 cache tests | VERIFIED | All passing |
| `packages/ai/src/tools/__tests__/google-places.test.ts` | 8 Places endpoint tests | VERIFIED | All passing |
| `packages/ai/src/tools/__tests__/walkscore.test.ts` | 3 Walk Score tests | VERIFIED | All passing |
| `packages/ai/src/tools/__tests__/get-reviews.test.ts` | 10 reviews handler tests | VERIFIED | All passing |
| `packages/ai/src/tools/__tests__/get-neighborhood-info.test.ts` | 7 neighborhood handler tests | VERIFIED | All passing |
| `packages/ai/src/tools/__tests__/contact-pm.test.ts` | 8 contact-pm handler tests | VERIFIED | All passing |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `api-cache.ts` | supabase api_cache table | `supabase.from('api_cache')` | WIRED | Pattern confirmed at lines 12 and 41 |
| `google-places.ts` | Google Places API (New) | fetch to places.googleapis.com/v1 | WIRED | BASE_URL = 'https://places.googleapis.com/v1' used in all 3 functions |
| `walkscore.ts` | Walk Score API | fetch to api.walkscore.com | WIRED | fetch(`https://api.walkscore.com/score?...`) at line 47 |
| `get-reviews.ts` | `lib/google-places.ts` | import textSearchPlace, getPlaceDetails | WIRED | Lines 4-5: `import { textSearchPlace, getPlaceDetails } from '../lib/google-places'` |
| `get-reviews.ts` | `lib/api-cache.ts` | import getCached, setCache | WIRED | Line 3: `import { getCached, setCache } from '../lib/api-cache'` |
| `get-reviews.ts` | `gemini-client.ts` | createGeminiClient for summary | WIRED | Line 6: `import { createGeminiClient } from '../../gemini-client'`; called in generateSummary |
| `get-neighborhood-info.ts` | `lib/walkscore.ts` | import getWalkScore | WIRED | Line 4: `import { getWalkScore } from '../lib/walkscore'` |
| `get-neighborhood-info.ts` | `lib/google-places.ts` | import nearbySearch | WIRED | Line 5: `import { nearbySearch } from '../lib/google-places'` |
| `contact-pm.ts` | supabase listings + landlords tables | supabase.from('listings'), supabase.from('landlords') | WIRED | fetchListing queries listings (line 28), fetchLandlord queries landlords (line 46) |
| `executor.ts` | all three handlers | import + dispatch map | WIRED | Lines 10-12 import; lines 23-25 register get_reviews, contact_pm, get_neighborhood_info |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TOOLS-01 | 17-01, 17-02 | Real review integration (Reddit, Google Maps, Yelp) | SATISFIED | get-reviews.ts implements Google Places reviews + Gemini summary; Google Maps is the primary source per implementation |
| TOOLS-02 | 17-01, 17-02 | Real PM contact integration | SATISFIED | contact-pm.ts queries landlords table for real contact data + generates Gemini draft |
| TOOLS-03 | 17-01, 17-02 | Real neighborhood info (Walk Score API, crime data) | PARTIALLY SATISFIED | Walk Score API integrated (walk/transit/bike). Crime data not implemented — REQUIREMENTS.md mentions crime data but PLAN/RESEARCH scoped it to Walk Score + Google Places amenities only. No gap in plan intent; crime data was explicitly deferred per 17-CONTEXT.md/RESEARCH.md scope. |

**Note on REQUIREMENTS.md traceability:** TOOLS-01/02/03 are classified as "Real Tool Integrations (v1.2+)" in REQUIREMENTS.md. The traceability table in REQUIREMENTS.md only maps v1.1 phases (10-15) and does not list Phase 17 — this is consistent with Phase 17 being v1.2 work implemented ahead of schedule. No orphaned requirements detected for Phase 17 in the traceability table.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| contact-pm.ts | 51 | `return null` | Info | Expected — fetchLandlord returning null on error is intentional graceful degradation, not a stub |
| contact-pm.ts | 88 | `return null` | Info | Expected — generateDraft returning null on Gemini failure is intentional graceful degradation |
| api-cache.ts | 18, 23 | `return null` | Info | Expected — getCached returns null for missing/expired entries per design contract |

No actual stubs detected. No "coming soon", "PLACEHOLDER", "TODO", "FIXME" patterns found in any Phase 17 implementation files. All `return null` usages are legitimate graceful degradation patterns matching the plan's specified behavior.

---

### Human Verification Required

#### 1. Live Google Places Reviews via CribAI Chat

**Test:** In the CribAI chat interface, ask "What are the reviews for [real Madison WI apartment address]?"
**Expected:** Tool returns Google Places rating, a 2-3 sentence Gemini summary covering noise/maintenance/management/value, and up to 3 review quotes with author name and relative time attribution.
**Why human:** Requires GOOGLE_PLACES_API_KEY and GEMINI_API_KEY provisioned; real API calls not possible in automated verification.

#### 2. Live Walk Score + Neighborhood Amenities

**Test:** In the CribAI chat interface, ask "What's the neighborhood like near [listing with lat/lng in DB]?"
**Expected:** Walk Score section shows numeric scores for walk/transit/bike with descriptions. Nearby Places section shows categorized amenities (Grocery, Dining, Fitness, Health, Services) within 1km.
**Why human:** Requires WALKSCORE_API_KEY and GOOGLE_PLACES_API_KEY; listing must have lat/lng columns populated; migration 014 must be applied.

#### 3. PM Contact Draft via CribAI Chat

**Test:** In the CribAI chat interface, ask "How do I contact the PM for listing [UUID with landlord_id set]?"
**Expected:** Returns landlord name, company, phone, email contact card. Shows a Gemini-generated casual draft message starting with "Hey!" in student tone mentioning address, beds, baths, and rent.
**Why human:** Requires migration 014 applied, a landlord record linked to listing via landlord_id, and live GEMINI_API_KEY.

#### 4. Cache Behavior Under Real Load

**Test:** Invoke the same reviews or neighborhood tool twice within 24h/7d window for the same address.
**Expected:** Second invocation returns immediately with cached result without making external API calls (verifiable via API provider usage dashboards).
**Why human:** Requires observing external API call counts, which cannot be verified programmatically without request interceptors in production.

---

### Test Suite Results

```
Test Files  6 passed (6)
     Tests  40 passed (40)
  Duration  425ms
```

Breakdown:
- `api-cache.test.ts`: 4 tests — getCached hit, getCached expired, getCached missing, setCache upsert
- `google-places.test.ts`: 8 tests — textSearch returns ID, textSearch null on no results, textSearch throws on error, getPlaceDetails returns details, getPlaceDetails throws, nearbySearch returns places, nearbySearch returns empty array, nearbySearch throws
- `walkscore.test.ts`: 3 tests — success case, status != 1, network failure
- `get-reviews.test.ts`: 10 tests — address from listing_id, address direct, cache hit, missing API key, no place found, no reviews (with rating), reviews < 3 (no Gemini), reviews >= 3 (Gemini summary), full result caching, missing both params throws
- `get-neighborhood-info.test.ts`: 7 tests — full result from listing_id, cache hit, Walk Score unavailable (partial result), missing API keys (empty sections), categorization, throws on missing params, address-only path
- `contact-pm.test.ts`: 8 tests — landlord exists + draft, fallback to contact_email, user message appended, draft generation fails (no key), listing not found throws, all fields rendered in clientBlock, modelContext contains contact info, draft-unavailable note

---

### Gaps Summary

No gaps. All 16 must-have truths verified. All artifacts exist, are substantive (not stubs), and are wired. All 40 unit tests pass. The three handlers are registered in executor.ts and callable by CribAI.

The one partial note on TOOLS-03 (crime data not implemented) is not a gap relative to the phase PLAN — the PLAN explicitly scoped neighborhood info to Walk Score + Google Places amenities. Crime data appears in REQUIREMENTS.md as aspirational scope for TOOLS-03 but was not planned or expected in Phase 17.

---

_Verified: 2026-03-11T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
