# Requirements: CampusNest v1.1

**Defined:** 2026-03-10
**Core Value:** Students can find off-campus housing through conversational AI search that understands what they actually want

## v1.1 Requirements

### Design System

- [x] **DESIGN-01**: User sees Space Grotesk display font and DM Sans body font across all pages
- [x] **DESIGN-02**: All pages use shadcn/ui component primitives (Button, Card, Sheet, Dialog, Input, etc.)
- [x] **DESIGN-03**: All pages use Lucide icons instead of inline Heroicon SVGs
- [x] **DESIGN-04**: Page transitions and interactive elements use framer-motion spring animations
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

## Future Requirements

### AI Concierge Backend (v1.2)

- **AGENT-BE-01**: Mission executor runs async with fire-and-forget pattern (202 Accepted)
- **AGENT-BE-02**: Missions DB schema with HITL draft versioning, idempotency keys, and expires_at
- **AGENT-BE-03**: Supabase Realtime subscription for live mission status updates
- **AGENT-BE-04**: Steering bar intent parsing via Gemini function calling
- **AGENT-BE-05**: Real landlord contact and tour scheduling via mission executor

### Real Tool Integrations (v1.2+)

- **TOOLS-01**: Real review integration (Reddit, Google Maps, Yelp)
- **TOOLS-02**: Real PM contact integration
- **TOOLS-03**: Real neighborhood info (Walk Score API, crime data)

### Agentic Search (v2.0)

- **SEARCH-01**: NL query extraction via LLM into structured filters
- **SEARCH-02**: Auto-populate filter chips from AI interpretation
- **SEARCH-03**: Failed search creates persistent mission alert

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full state machine backend (LangGraph/Step Functions) | v1.1 uses mock data for concierge; real backend in v1.2 |
| Generative UI (AI returns component JSON) | Too early; hardcoded mission cards sufficient for v1.1 |
| Dark mode | Design exists in Figma spec but deferred to reduce scope |
| Real mission execution | v1.1 is UI-only with mock data; backend executor in v1.2 |
| Supabase Storage for sublease photos | Existing photo handling sufficient; Storage bucket deferred |
| TanStack Query adoption | Evaluate after v1.1; current data fetching patterns work |

## Traceability

| Requirement | Phase | Gap Closure | Status |
|-------------|-------|-------------|--------|
| DESIGN-01 | Phase 10 | Phase 24 | Satisfied |
| DESIGN-02 | Phase 10 | Phase 24 | Satisfied |
| DESIGN-03 | Phase 10 | Phase 20 | Satisfied |
| DESIGN-04 | Phase 10 | Phase 24 | Satisfied |
| DESIGN-05 | Phase 10 | Phase 22 | Satisfied |
| COMPAT-01 | Phase 10 | Phase 24 | Satisfied |
| LAND-01 | Phase 11 | Phase 21 | Satisfied |
| LAND-02 | Phase 11 | Phase 24 | Satisfied |
| LAND-03 | Phase 11 | Phase 24 | Satisfied |
| LAND-04 | Phase 11 | Phase 21 | Satisfied |
| AUTH-05 | Phase 11 | Phase 24 | Satisfied |
| AUTH-06 | Phase 11 | Phase 19 | Satisfied |
| EXPL-01 | Phase 12 | Phase 24 | Satisfied |
| EXPL-02 | Phase 12 | Phase 24 | Satisfied |
| EXPL-03 | Phase 12 | Phase 24 | Satisfied |
| EXPL-04 | Phase 12 | Phase 23 | Satisfied |
| EXPL-05 | Phase 12 | Phase 24 | Satisfied |
| DETAIL-01 | Phase 13 | Phase 24 | Satisfied |
| DETAIL-02 | Phase 13 | Phase 24 | Satisfied |
| DETAIL-03 | Phase 13 | Phase 24 | Satisfied |
| DETAIL-04 | Phase 13 | Phase 24 | Satisfied |
| DETAIL-05 | Phase 13 | Phase 23 | Satisfied |
| POST-01 | Phase 14 | Phase 21 | Satisfied |
| POST-02 | Phase 14 | Phase 24 | Satisfied |
| POST-03 | Phase 14 | Phase 24 | Satisfied |
| PROF-01 | Phase 14 | Phase 21 | Satisfied |
| PROF-02 | Phase 14 | Phase 19 | Satisfied |
| PROF-03 | Phase 14 | Phase 24 | Satisfied |
| AGENT-01 | Phase 15 | Phase 20 | Satisfied |
| AGENT-02 | Phase 15 | Phase 24 | Satisfied |
| AGENT-03 | Phase 15 | Phase 24 | Satisfied |
| AGENT-04 | Phase 15 | Phase 24 | Satisfied |
| AGENT-05 | Phase 15 | Phase 24 | Satisfied |
| AGENT-06 | Phase 15 | Phase 24 | Satisfied |

**Coverage:**
- v1.1 requirements: 34 total
- Satisfied (verified): 34
- Pending (gap closure Phase 23-24): 0
- Unverified: 0
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-12 — Phase 24 verification sweep complete*
