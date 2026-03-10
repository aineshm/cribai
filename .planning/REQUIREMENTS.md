# Requirements: CampusNest v1.1

**Defined:** 2026-03-10
**Core Value:** Students can find off-campus housing through conversational AI search that understands what they actually want

## v1.1 Requirements

### Design System

- [ ] **DESIGN-01**: User sees Cabinet Grotesk display font and Satoshi body font across all pages
- [ ] **DESIGN-02**: All pages use shadcn/ui component primitives (Button, Card, Sheet, Dialog, Input, etc.)
- [ ] **DESIGN-03**: All pages use Lucide icons instead of inline Heroicon SVGs
- [ ] **DESIGN-04**: Page transitions and interactive elements use Framer Motion spring animations
- [ ] **DESIGN-05**: Design tokens bridge existing CSS variables with shadcn/ui token system without breaking build

### Landing Page

- [ ] **LAND-01**: User sees a marketing landing page with hero section, AI value prop, and "Get Started" CTA
- [ ] **LAND-02**: Landing page shows social proof bar with university logos and feature cards
- [ ] **LAND-03**: Landing page has "How It Works" section and footer CTA banner
- [ ] **LAND-04**: Mobile users see sticky "Get Started" CTA at bottom of landing page

### Auth Redesign

- [ ] **AUTH-05**: Auth page uses split layout with branded left panel (desktop) and animated multi-step form
- [ ] **AUTH-06**: Auth form transitions between email, OTP, and profile steps with slide animations

### Explore Page

- [ ] **EXPL-01**: User sees a split view with listing grid (60%) and interactive map (40%) on desktop
- [ ] **EXPL-02**: Mobile users can toggle between List and Map views via segmented control
- [ ] **EXPL-03**: Filter chips (Price, Beds, Distance, Move-in Date, Pet Friendly, Furnished) appear above results
- [ ] **EXPL-04**: Floating AI button opens CribAI as a slide-over chat panel (not a separate page)
- [ ] **EXPL-05**: Listing cards show photo, price, beds/baths, distance badge, rating, save button, and AI Verified badge

### Listing Detail

- [ ] **DETAIL-01**: User sees photo gallery grid (2/3 hero + 1/3 side grid) with lightbox expansion
- [ ] **DETAIL-02**: Two-column layout with content (left) and sticky CTA card with Book Tour and Ask AI (right)
- [ ] **DETAIL-03**: Listing detail shows landlord info card, amenities grid, and AI lease summary section
- [ ] **DETAIL-04**: Commute section shows map with distance/time to campus buildings
- [ ] **DETAIL-05**: Mobile users see sticky bottom bar with price, Book Tour, and Chat with AI buttons

### Post Sublease

- [ ] **POST-01**: User completes sublease posting via multi-step wizard (Basics, Details, Amenities, Photos, Description, Review)
- [ ] **POST-02**: Desktop shows sidebar progress tracker with step indicators
- [ ] **POST-03**: Mobile shows progress bar with step count and percentage

### Profile and Saved

- [ ] **PROF-01**: User sees profile header card with avatar, name, university, verification badge
- [ ] **PROF-02**: Tabbed navigation between Saved Listings and Account Settings
- [ ] **PROF-03**: Settings section has navigation items for Personal Info, Notifications, and Log Out

### AI Concierge UI

- [ ] **AGENT-01**: User sees AI Concierge sidebar with task-based mission cards showing status indicators
- [ ] **AGENT-02**: Mission detail view shows status-specific action cards (scheduled tour, draft approval, negotiation)
- [ ] **AGENT-03**: Mission detail includes agent summary and expandable raw execution logs
- [ ] **AGENT-04**: Persistent steering bar at bottom allows user to course-correct the agent
- [ ] **AGENT-05**: Empty state shows proactive mission suggestions based on user activity
- [ ] **AGENT-06**: Active/Past tabs filter missions by completion status

### Compatibility

- [ ] **COMPAT-01**: Git tag `v1.0-mvp` marks revert point; v1.0 features are integrated into v1.1 where applicable

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

| Requirement | Phase | Status |
|-------------|-------|--------|
| DESIGN-01 | — | Pending |
| DESIGN-02 | — | Pending |
| DESIGN-03 | — | Pending |
| DESIGN-04 | — | Pending |
| DESIGN-05 | — | Pending |
| LAND-01 | — | Pending |
| LAND-02 | — | Pending |
| LAND-03 | — | Pending |
| LAND-04 | — | Pending |
| AUTH-05 | — | Pending |
| AUTH-06 | — | Pending |
| EXPL-01 | — | Pending |
| EXPL-02 | — | Pending |
| EXPL-03 | — | Pending |
| EXPL-04 | — | Pending |
| EXPL-05 | — | Pending |
| DETAIL-01 | — | Pending |
| DETAIL-02 | — | Pending |
| DETAIL-03 | — | Pending |
| DETAIL-04 | — | Pending |
| DETAIL-05 | — | Pending |
| POST-01 | — | Pending |
| POST-02 | — | Pending |
| POST-03 | — | Pending |
| PROF-01 | — | Pending |
| PROF-02 | — | Pending |
| PROF-03 | — | Pending |
| AGENT-01 | — | Pending |
| AGENT-02 | — | Pending |
| AGENT-03 | — | Pending |
| AGENT-04 | — | Pending |
| AGENT-05 | — | Pending |
| AGENT-06 | — | Pending |
| COMPAT-01 | — | Pending |

**Coverage:**
- v1.1 requirements: 34 total
- Mapped to phases: 0
- Unmapped: 34

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after initial definition*
