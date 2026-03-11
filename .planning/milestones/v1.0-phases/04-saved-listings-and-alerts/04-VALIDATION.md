# Phase 4: Saved Listings and Alerts - Validation Strategy

**Created:** 2026-03-06
**Source:** 04-RESEARCH.md Validation Architecture section

## Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + happy-dom |
| Config file | `apps/web/vitest.config.ts`, `packages/ai/vitest.config.ts`, `services/scraper/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/web test -- --run` |
| Full suite command | `pnpm -r test` |

## Phase Requirements Test Map
| Req ID | Behavior | Test Type | Automated Command | Target |
|--------|----------|-----------|-------------------|--------|
| LIST-01 | Save/unsave toggle creates/deletes DB row | unit | `pnpm --filter @campusnest/web test -- --run lib/__tests__/saved-listings.test.ts` | Wave 1 |
| LIST-01 | Saved listings page fetches user's saves | integration | Manual Playwright | Wave 1 |
| LIST-02 | Price change detector identifies changes | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/price-change-detector.test.ts` | Wave 2 |
| LIST-02 | Notification creation for saved listing users | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/price-change-detector.test.ts` | Wave 2 |
| LIST-02 | Bell badge shows unread count | unit | `pnpm --filter @campusnest/web test -- --run components/__tests__/notification-bell.test.tsx` | Wave 2 |
| LIST-03 | Detail page renders photo gallery, map, amenities | unit | `pnpm --filter @campusnest/web test -- --run __tests__/listing-detail.test.tsx` | Wave 1 |
| LIST-04 | Freshness badge displays correctly | unit | Already tested via FreshnessBadge | Existing |
| AI-TOOL | get_saved_listings returns user's saves | unit | `pnpm --filter @campusnest/ai test -- --run tools/__tests__/get-saved-listings.test.ts` | Wave 2 |

## Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/web test -- --run`
- **Per wave merge:** `pnpm -r test`
- **Phase gate:** Full suite green before verify

## UAT Criteria
- [ ] User can click heart on listing card, see animation, see toast
- [ ] Saved listings page shows all favorited listings
- [ ] After nightly scrape with price change, user sees notification bell badge
- [ ] Notification page shows old price -> new price with color-coded arrows
- [ ] Listing detail page shows photo gallery, map, similar listings
- [ ] "Ask CribAI" button on detail page opens chat with listing context
- [ ] CribAI responds to "show my saved listings" correctly
