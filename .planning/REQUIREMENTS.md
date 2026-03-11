# Requirements: CampusNest v1.2

**Defined:** 2026-03-10
**Core Value:** Students can find off-campus housing through conversational AI search that understands what they actually want

## v1.2 Requirements

### Mission Executor

- [ ] **EXEC-01**: User can create a mission from the Concierge page that triggers real async execution (202 Accepted, fire-and-forget)
- [ ] **EXEC-02**: Mission executor runs a multi-step agentic loop (search -> filter -> shortlist) using existing CribAI tools
- [x] **EXEC-03**: Missions DB schema stores status, raw execution logs, draft payloads, idempotency keys, and expiration
- [ ] **EXEC-04**: Mission status updates are pushed to the UI in real-time via Supabase Realtime (no polling)

### HITL Approval

- [ ] **HITL-01**: Mission executor pauses at irreversible actions (tour scheduling) and writes a draft for user approval
- [ ] **HITL-02**: User can approve, edit, or reject a draft action from the Concierge mission detail view

### Steering

- [ ] **STEER-01**: User can type a correction in the steering bar to modify a running/paused mission
- [ ] **STEER-02**: Gemini parses steering input into structured intent (modify constraint vs. change goal vs. cancel)

### Real Tool Integrations

- [ ] **TOOLS-01**: Reviews tool returns real Google Places ratings and recent reviews for a property (replaces stub)
- [ ] **TOOLS-02**: PM contact tool returns real contact data from the landlords table and generates a draft inquiry message (replaces stub)
- [ ] **TOOLS-03**: Neighborhood info tool returns real Walk Score + nearby amenities from Google Places (replaces stub)

### Agent Memory

- [ ] **MEM-01**: Evaluate and integrate a memory layer (supermemory.ai or Gemini + pgvector) so CribAI recalls user preferences across sessions
- [ ] **MEM-02**: Agent uses stored preferences to personalize search results and recommendations without the user repeating themselves

### UI Wiring

- [ ] **WIRE-01**: Concierge UI reads mission data from Supabase instead of mock constants
- [ ] **WIRE-02**: Mission status badges, log timeline, and draft approval cards are driven by real backend data
- [ ] **WIRE-03**: Steering bar form submission calls the real steering API endpoint

### Production Readiness

- [ ] **PROD-01**: Scraper produces fresh UW-Madison listings and embeddings are current
- [ ] **PROD-02**: v1.1 UI pages work end-to-end with real data (no broken flows, missing images, or dead links)
- [ ] **PROD-03**: Error states are handled gracefully (failed missions, API timeouts, empty results) -- no raw errors shown to users
- [ ] **PROD-04**: App is deployed to Vercel with all required environment variables and API keys configured

## v1.1 Requirements (Shipped)

<details>
<summary>v1.1 UI/UX Upgrade -- 34 requirements, all complete</summary>

### Design System

- [x] **DESIGN-01**: User sees Space Grotesk display font and DM Sans body font across all pages
- [x] **DESIGN-02**: All pages use shadcn/ui component primitives (Button, Card, Sheet, Dialog, Input, etc.)
- [x] **DESIGN-03**: All pages use Lucide icons instead of inline Heroicon SVGs
- [x] **DESIGN-04**: Page transitions and interactive elements use Framer Motion spring animations
- [x] **DESIGN-05**: Design tokens bridge existing CSS variables with shadcn/ui token system without breaking build

### Landing Page

- [x] **LAND-01**: User sees a marketing landing page with hero section, AI value prop, and "Get Started" CTA
- [x] **LAND-02**: Landing page shows social proof bar with university logos and feature cards
- [x] **LAND-03**: Landing page has "How It Works" section and footer CTA banner
- [x] **LAND-04**: Mobile users see sticky "Get Started" CTA at bottom of landing page

### Auth Redesign

- [x] **AUTH-05**: Auth page uses split layout with branded left panel (desktop) and animated multi-step form
- [x] **AUTH-06**: Auth form transitions between email, OTP, and profile steps with slide animations

### Explore Page

- [x] **EXPL-01**: User sees a split view with listing grid (60%) and interactive map (40%) on desktop
- [x] **EXPL-02**: Mobile users can toggle between List and Map views via segmented control
- [x] **EXPL-03**: Filter chips (Price, Beds, Distance, Move-in Date, Pet Friendly, Furnished) appear above results
- [x] **EXPL-04**: Floating AI button opens CribAI as a slide-over chat panel (not a separate page)
- [x] **EXPL-05**: Listing cards show photo, price, beds/baths, distance badge, rating, save button, and AI Verified badge

### Listing Detail

- [x] **DETAIL-01**: User sees photo gallery grid (2/3 hero + 1/3 side grid) with lightbox expansion
- [x] **DETAIL-02**: Two-column layout with content (left) and sticky CTA card with Book Tour and Ask AI (right)
- [x] **DETAIL-03**: Listing detail shows landlord info card, amenities grid, and AI lease summary section
- [x] **DETAIL-04**: Commute section shows map with distance/time to campus buildings
- [x] **DETAIL-05**: Mobile users see sticky bottom bar with price, Book Tour, and Chat with AI buttons

### Post Sublease

- [x] **POST-01**: User completes sublease posting via multi-step wizard (Basics, Details, Amenities, Photos, Description, Review)
- [x] **POST-02**: Desktop shows sidebar progress tracker with step indicators
- [x] **POST-03**: Mobile shows progress bar with step count and percentage

### Profile and Saved

- [x] **PROF-01**: User sees profile header card with avatar, name, university, verification badge
- [x] **PROF-02**: Tabbed navigation between Saved Listings and Account Settings
- [x] **PROF-03**: Settings section has navigation items for Personal Info, Notifications, and Log Out

### AI Concierge UI

- [x] **AGENT-01**: User sees AI Concierge sidebar with task-based mission cards showing status indicators
- [x] **AGENT-02**: Mission detail view shows status-specific action cards (scheduled tour, draft approval, negotiation)
- [x] **AGENT-03**: Mission detail includes agent summary and expandable raw execution logs
- [x] **AGENT-04**: Persistent steering bar at bottom allows user to course-correct the agent
- [x] **AGENT-05**: Empty state shows proactive mission suggestions based on user activity
- [x] **AGENT-06**: Active/Past tabs filter missions by completion status

### Compatibility

- [x] **COMPAT-01**: Git tag `v1.0-mvp` marks revert point; v1.0 features are integrated into v1.1 where applicable

</details>

## Future Requirements

### Agentic Search (v2.0)

- **SEARCH-01**: NL query extraction via LLM into structured filters
- **SEARCH-02**: Auto-populate filter chips from AI interpretation
- **SEARCH-03**: Failed search creates persistent mission alert

### Advanced Agent (v2.0)

- **ADV-01**: Full LangGraph/Inngest state machine for complex multi-step missions
- **ADV-02**: Generative UI (AI returns component JSON for mission cards)
- **ADV-03**: Live streaming execution logs (SSE for real-time tool call visibility)
- **ADV-04**: Outbound email on user behalf (with landlord partnerships and consent)

### Platform Expansion (v2.0+)

- **PLAT-01**: Expand to 2-3 additional campuses
- **PLAT-02**: Basic roommate matching (profile + preferences)
- **PLAT-03**: On-demand embedding trigger for manual listing submissions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full state machine backend (LangGraph/Step Functions) | Simple missions table + status column sufficient at current scale; revisit at 1K+ missions/day |
| Generative UI (AI returns component JSON) | No rendering safety pattern established; hardcoded mission card types for v1.2 |
| Live streaming execution logs | High complexity, low comprehension value -- tool calls complete in 300-800ms |
| Outbound email/SMS to PMs on user behalf | Legal liability (CAN-SPAM), trust issues; draft-only in v1.2, user sends manually |
| Yelp review integration | ToS prohibits off-platform display; Google Places only |
| Payment processing / Stripe | No monetization model decided for v1.2 |
| Dark mode | Deferred from v1.1; not blocking for production launch |
| Mobile native app | Web-first, responsive covers mobile |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXEC-01 | Phase 18 | Pending |
| EXEC-02 | Phase 18 | Pending |
| EXEC-03 | Phase 16 | Complete |
| EXEC-04 | Phase 18 | Pending |
| HITL-01 | Phase 18 | Pending |
| HITL-02 | Phase 18 | Pending |
| STEER-01 | Phase 19 | Pending |
| STEER-02 | Phase 19 | Pending |
| TOOLS-01 | Phase 17 | Pending |
| TOOLS-02 | Phase 17 | Pending |
| TOOLS-03 | Phase 17 | Pending |
| MEM-01 | Phase 19 | Pending |
| MEM-02 | Phase 19 | Pending |
| WIRE-01 | Phase 20 | Pending |
| WIRE-02 | Phase 20 | Pending |
| WIRE-03 | Phase 20 | Pending |
| PROD-01 | Phase 20 | Pending |
| PROD-02 | Phase 20 | Pending |
| PROD-03 | Phase 20 | Pending |
| PROD-04 | Phase 20 | Pending |

**Coverage:**
- v1.2 requirements: 20 total
- Mapped to phases: 20/20
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
