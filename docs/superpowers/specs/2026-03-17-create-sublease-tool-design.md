# Create Sublease Tool — Design Spec

## Problem

Students currently post subleases on WhatsApp/GroupMe with informal, unstructured messages. CampusNest has a PostWizard form at `/post`, but conversational posting through CribAI would reduce friction — users can describe their sublease naturally and have the AI extract, validate, and publish it.

## Scope

Add a `create_sublease` tool to CribAI that lets authenticated users list a sublease through conversation instead of the manual PostWizard form.

### In Scope

- New tool handler: `packages/ai/src/tools/handlers/create-sublease.ts`
- New geocoding helper: `packages/ai/src/tools/lib/geocode-address.ts`
- Extend `PlaceDetailsResult` in `google-places.ts` to include `location` field
- Update `listingSubmissionSchema` in `packages/types` to allow nullable `rent_monthly`
- Tool schema declaration in `schemas.ts`
- Tool registration in `executor.ts`, `types.ts`, `cribai.ts`
- Two-phase HITL flow (preview → confirm → publish)
- Geocoding via Google Places `textSearchPlace()` + `getPlaceDetails()`
- Analytics events via existing `trackEvent()` pattern
- Feature branch: `feat/create-sublease-tool`

### Out of Scope (follow-ups)

- Floor plan scraping post-publish (async `after()` job)
- Broader agent observability system (all CribAI tool calls)
- Photo upload support (would require multimodal input or URL collection)
- Per-tool rate limiting on sublease creation (follow-up hardening)

## Architecture

### Two-Phase HITL Pattern

Single tool with a `confirmed` boolean parameter:

```
Phase 1: confirmed = false (or omitted)
  → Validate fields, geocode address, return formatted summary
  → Model presents summary to user, asks "Does this look right?"

Phase 2: confirmed = true
  → All fields must be re-sent (Gemini retains them from Phase 1 in context)
  → Direct Supabase insert (Option A — no HTTP call)
  → Return success with listing link
```

This keeps the tool count at 1 and leverages Gemini's natural conversation flow to manage the confirmation step.

**Note on Phase 2 state**: Both phases must include the full parameter set. The system prompt must instruct Gemini to re-send all fields in the confirmation call, not just `confirmed: true`. This avoids state loss if the conversation grows long.

### Tool Parameters

```typescript
{
  // Required
  address: string,            // "Randall Station, 1-2 W Dayton St"
  bedrooms_total: number,     // total bedrooms in the unit (0 for studio)
  bedrooms_available: number, // how many bedrooms being subleased

  // Optional (contact_email defaults to user's auth email if omitted)
  contact_email: string,
  rent_monthly: number,       // null/omitted = "negotiable"
  bathrooms: number,
  available_from: string,     // YYYY-MM-DD
  available_to: string,       // YYYY-MM-DD (lease end)
  description: string,        // rich text from conversation
  amenities: string[],        // extracted from conversation
  unit_number: string,        // if user comfortable sharing
  furnished: boolean,
  parking: boolean,
  property_type: string,      // apartment | house | room
  gender_restriction: string, // "girls only", "any", etc.
  roommate_info: string,      // "living with two senior girls"

  // Control
  confirmed: boolean,         // false = preview, true = publish
}
```

### DB Field Mapping

Tool parameters map to DB columns and `raw_data` as follows:

| Tool Parameter | DB Column / raw_data key |
|---------------|--------------------------|
| `address` | `address` (column) |
| `rent_monthly` | `rent_monthly` (column, nullable) |
| `bedrooms_total` | `bedrooms` (column) |
| `bathrooms` | `bathrooms` (column) |
| `available_from` | `available_date` (column) |
| `amenities` | `amenities` (column) |
| `description` | `description` (column) |
| `contact_email` | `contact_email` (column) |
| `lat/lng` (geocoded) | `location` geography(POINT) (column) |
| `bedrooms_available` | `raw_data.bedrooms_available` |
| `available_to` | `raw_data.lease_end` |
| `furnished` | `raw_data.furnished` |
| `parking` | `raw_data.parking` |
| `property_type` | `raw_data.property_type` |
| `unit_number` | `raw_data.unit_number` |
| `gender_restriction` | `raw_data.gender_restriction` |
| `roommate_info` | `raw_data.roommate_info` |
| `context.userId` | `raw_data.submitted_by` |
| `"sublease"` (hardcoded) | `source` (column) |
| `sublease-{userId}-{ts}` | `external_id` (column) — uniqueness key |
| `context.campusId` | `campus_id` (column) |

`campus_id` uses `context.campusId` (set from the campus slug in the chat route). This is appropriate since users sublease where they live, which should match the campus context.

### Field Extraction Strategy

Gemini handles extraction from casual conversation. The system prompt instructs it to:

1. Extract all recognizable fields from the user's message
2. Ask follow-up questions for missing **required** fields:
   - address (required)
   - bedrooms_total + bedrooms_available (required)
3. For optional fields, prompt naturally:
   - Rent: "Would you like to put a price, or list it as negotiable?"
   - Dates: "When is your lease from and until?"
   - Unit: "If you're comfortable sharing, what unit are you in?"
   - Email: defaults to user's auth email; Gemini may ask if they want a different contact
4. Call `create_sublease` with `confirmed: false` once required fields are collected
5. Present the summary and ask for confirmation
6. On user approval, call again with `confirmed: true` — **include all fields, not just the flag**

### Data Flow

```
User message ("I want to sublease my place at Randall Station...")
  ↓
Gemini extracts fields, asks follow-ups for required fields
  ↓
create_sublease(confirmed: false, address, bedrooms_total, ...)
  ├─ Auth guard: throw if !context.userId
  ├─ Validate with Zod schema
  ├─ Geocode via geocodeAddress(address) → { lat, lng } (or null on failure)
  ├─ Format summary card
  └─ Return { modelContext: "summary + confirm instructions", clientBlock: preview }
  ↓
Gemini presents summary: "Here's what I've got — does this look right?"
  ↓
User: "looks good" / "change the rent to $800"
  ↓
create_sublease(confirmed: true, address, bedrooms_total, ...) [all fields re-sent]
  ├─ Auth guard: throw if !context.userId
  ├─ Re-validate
  ├─ Re-geocode (or reuse from Phase 1 if Gemini caches result — acceptable to re-call)
  ├─ Fetch user email from Supabase auth if contact_email not provided
  ├─ Direct Supabase insert via service-role client
  │   ├─ source: 'sublease'
  │   ├─ external_id: `sublease-${context.userId}-${Date.now()}`
  │   ├─ campus_id: context.campusId
  │   ├─ location: ST_MakePoint(lng, lat) (if geocoded)
  │   └─ raw_data: { sublease-specific fields per mapping table above }
  ├─ Fire analytics event: sublease_published
  └─ Return { modelContext: "published", clientBlock: success + listing link }
```

### Geocoding Helper

New file `packages/ai/src/tools/lib/geocode-address.ts`:

```typescript
interface GeocodeResult {
  readonly latitude: number;
  readonly longitude: number;
}

export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<GeocodeResult | null>
```

Internally:
1. `textSearchPlace(address, apiKey)` → `placeId | null`
2. `getPlaceDetails(placeId, apiKey, 'location')` → response with `location.latitude/longitude`
3. Returns `{ latitude, longitude }` or `null` on any failure

**Required change to `google-places.ts`**: Extend `PlaceDetailsResult` to include the optional `location` field returned when the `location` field mask is requested:

```typescript
export interface PlaceDetailsResult {
  // ... existing fields ...
  readonly location?: {
    readonly latitude: number;
    readonly longitude: number;
  };
}
```

### Schema Change: Nullable Rent

Update `listingSubmissionSchema` in `packages/types/src/listing.ts`:

```typescript
// Before
rent_monthly: z.number().positive('Rent must be positive').max(10000),

// After
rent_monthly: z.number().positive('Rent must be positive').max(10000).nullable().optional(),
```

The PostWizard form currently requires rent — the form validation is separate from the schema and is unaffected. The API route and DB column must both support null rent for "negotiable" listings.

### Auth Guard

The handler must check `context.userId` at entry — **before any other logic**:

```typescript
if (!context.userId) {
  throw new Error('This action requires signing in.');
}
```

This is necessary because for authenticated users the executor's `allowedToolNames` check is skipped (it's only enforced for guests). The handler-level check is the authoritative auth guard for this tool, following the same pattern as `schedule-tour.ts`.

### Registration

**`types.ts`**: Add `'create_sublease'` to `ToolName` union. This will cause a compile error in `cribai.ts` until `TOOL_SUMMARIES` is updated — fix both in the same commit.

**`schemas.ts`**: Add `FunctionDeclaration` with the parameter schema above and a description instructing Gemini on the two-phase flow and required-field collection.

**`executor.ts`**: Import and register the handler.

**`cribai.ts`**: Add to `TOOL_SUMMARIES`. The tool is NOT in `GUEST_ALLOWED_TOOLS` in the chat route.

**System prompt update**: The existing line `"Students can post subleases at /post using the PostWizard form — ALWAYS direct users there when they ask about posting or subletting their place"` must be replaced. It directly contradicts the new tool. Replace with: `"Students can post subleases through this chat (use the create_sublease tool) or via the PostWizard form at /post. Prefer the conversational flow — collect fields naturally, confirm with the user, then publish."` Add further guidance: extract sublease fields from conversation, ask for required fields before calling the tool, use two-phase confirmation, always re-send all fields in Phase 2.

### Analytics Events

Using existing `trackEvent()` infrastructure:

| Event | Trigger | Key Payload |
|-------|---------|-------------|
| `sublease_draft_created` | Phase 1 completes | `{ fields_extracted, fields_missing, geocode_success, user_id }` |
| `sublease_published` | Phase 2 completes | `{ listing_id, time_since_draft_ms, user_id }` |

`sublease_abandoned` and `sublease_draft_rejected` are deferred to the broader observability effort (they require tracking when the tool is NOT called).

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing required fields | Zod validation fails → error to model → Gemini asks user |
| Geocoding fails | Listing created without coordinates; warning in model context |
| `!context.userId` | Throw "This action requires signing in." |
| Supabase insert fails | Error to model → Gemini reports failure |
| `external_id` duplicate | Uniqueness constraint error → Gemini reports |
| `contact_email` fetch fails | Fall back to null; Gemini informs user to add manually |

### Security

- Auth required: handler-level `context.userId` guard (primary) + executor allowlist (guest guard)
- Input validation: Zod schema at tool entry on both phases
- No prompt injection risk: description/roommate_info stored as data, never executed
- Service-role client used only for insert
- Contact email validated as email format
- Description capped at 2000 chars

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/ai/src/tools/handlers/create-sublease.ts` | Create | Two-phase tool handler |
| `packages/ai/src/tools/lib/geocode-address.ts` | Create | Geocoding helper |
| `packages/ai/src/tools/lib/google-places.ts` | Modify | Add `location` field to `PlaceDetailsResult` |
| `packages/types/src/listing.ts` | Modify | Make `rent_monthly` nullable in `listingSubmissionSchema` |
| `packages/ai/src/tools/schemas.ts` | Modify | Add `create_sublease` FunctionDeclaration |
| `packages/ai/src/tools/types.ts` | Modify | Add `'create_sublease'` to `ToolName` union |
| `packages/ai/src/tools/executor.ts` | Modify | Import + register handler |
| `packages/ai/src/cribai.ts` | Modify | Add to `TOOL_SUMMARIES`, update system prompt |
| `apps/web/app/api/ai/cribai/route.ts` | Modify | Exclude `create_sublease` from `GUEST_ALLOWED_TOOLS` |
| `packages/ai/src/tools/__tests__/create-sublease.test.ts` | Create | Unit tests |
| `packages/ai/src/tools/lib/__tests__/geocode-address.test.ts` | Create | Geocoding tests |

## Testing Strategy

- **Unit tests**: Tool handler with mocked Supabase + Google Places
  - Phase 1: validates field extraction, geocoding, summary formatting
  - Phase 2: validates insert payload, `external_id` generation, `raw_data` mapping
  - Error cases: missing auth, invalid fields, geocoding failure, insert failure, duplicate
- **Manual QA**: Conversational flow in CribAI chat — formal input, WhatsApp-style, minimal input requiring follow-up questions
