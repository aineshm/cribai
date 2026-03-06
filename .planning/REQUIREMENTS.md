# Requirements: CampusNest

**Defined:** 2026-03-05
**Core Value:** Students can find off-campus housing through conversational AI search that understands what they actually want

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can sign in via magic link email and land on authenticated experience without redirect errors
- [x] **AUTH-02**: User session persists across browser refresh and tab close/reopen
- [x] **AUTH-03**: System validates that user email is a .edu address at signup (client-side check, not full verification)
- [x] **AUTH-04**: User can optionally create a profile (display name, avatar) with skip button at signup
- [x] **AUTH-05**: User can edit profile from a settings/profile page at any time

### Search

- [x] **SRCH-01**: Listings are embedded with Gemini gemini-embedding-001 and stored as pgvector columns for semantic search
- [x] **SRCH-02**: CribAI performs hybrid search combining vector similarity (qualitative) with SQL filters (price, beds, campus)
- [x] **SRCH-03**: CribAI can display listings on an interactive map as a chat block (agent-triggered map tool)
- [x] **SRCH-04**: Search results are ranked by semantic relevance to the user's natural language query

### Listings

- [x] **LIST-01**: User can save/favorite listings and view them from a saved listings page
- [ ] **LIST-02**: User receives alerts when a saved listing's price changes
- [ ] **LIST-03**: Listing detail pages display photos scraped from source
- [ ] **LIST-04**: Listings show freshness indicators (when last verified/updated, days since posted)
- [ ] **LIST-05**: Listings display scraped reviews from Reddit and other sources (recent, relevant)

### Data Pipeline

- [x] **DATA-01**: Apartments.com scraper runs reliably against UW Madison area listings
- [x] **DATA-02**: Scraper collects listing photos and stores/references them
- [ ] **DATA-03**: Manual listing submission form allows landlords or students to add listings directly
- [ ] **DATA-04**: Multi-source scraping covers Madison-specific PM sites (Steve Brown, Madison Property Mgmt, JD McCormick, etc.)
- [x] **DATA-05**: Nightly scrape automation runs via GitHub Actions with monitoring/alerting on failures
- [x] **DATA-06**: Stale listings are detected and marked inactive with freshness tracking
- [ ] **DATA-07**: Reddit/review scraping pipeline collects recent reviews for Madison-area properties

### AI Chat

- [ ] **CHAT-01**: Conversation history persists across sessions (user can resume previous chats)
- [ ] **CHAT-02**: Tour scheduling works end-to-end via chat (mocked backend for v1 -- no real PM integration)
- [ ] **CHAT-03**: CribAI has a map tool that renders an interactive map block in the chat UI

### Platform

- [x] **PLAT-01**: Platform launches with UW Madison as the primary campus
- [x] **PLAT-02**: Platform architecture supports 3-5 campuses (existing multi-tenancy works)
- [x] **PLAT-03**: Responsive design works on mobile browsers

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Roommate Matching

- **ROOM-01**: User can create a roommate profile with preferences (cleanliness, sleep, noise, budget, guests)
- **ROOM-02**: AI suggests compatible roommate matches based on weighted scoring
- **ROOM-03**: Users can message potential roommates through the platform

### Enhanced Features

- **ENHN-01**: True Cost surfacing -- total cost breakdown (rent + utilities + fees) prominently displayed
- **ENHN-02**: OAuth login via Instagram or Snapchat (if APIs available)
- **ENHN-03**: Full .edu email verification flow (not just client-side check)
- **ENHN-04**: Traditional filter UI (price range, bedrooms, move-in date sliders) alongside AI chat
- **ENHN-05**: Application tracking for students across multiple listings

### Sublease Marketplace

- **SUBL-01**: Scrape Facebook Marketplace for subleases
- **SUBL-02**: Sublet listing and matching system

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Property management platform | v2+ milestone, build tenant side first |
| PM-side automation (maintenance, tours) | Requires PM platform foundation |
| Predictive pricing | Needs PM platform + sufficient historical data |
| Group search / shared accounts | Design decision needed on multi-tenant leases, defer |
| Payment processing | No v1 monetization decided |
| Mobile native app | Web-first, responsive covers mobile |
| Nationwide coverage | Launch tight in Madison, expand later |
| Real-time chat between users | High complexity, not core to search value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| SRCH-01 | Phase 3 | Complete |
| SRCH-02 | Phase 3 | Complete |
| SRCH-03 | Phase 3 | Complete |
| SRCH-04 | Phase 3 | Complete |
| LIST-01 | Phase 4 | Complete |
| LIST-02 | Phase 4 | Pending |
| LIST-03 | Phase 4 | Pending |
| LIST-04 | Phase 4 | Pending |
| LIST-05 | Phase 5 | Pending |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 5 | Pending |
| DATA-04 | Phase 5 | Pending |
| DATA-05 | Phase 2 | Complete |
| DATA-06 | Phase 2 | Complete |
| DATA-07 | Phase 5 | Pending |
| CHAT-01 | Phase 6 | Pending |
| CHAT-02 | Phase 6 | Pending |
| CHAT-03 | Phase 6 | Pending |
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after roadmap creation*
