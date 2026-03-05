<!-- Generated: 2026-03-04 | Files scanned: ~10 | Token estimate: ~300 -->
# Dependencies

## External Services

| Service | Purpose | Config |
|---------|---------|--------|
| Supabase | PostgreSQL + PostGIS + Auth + Edge Functions | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY |
| Google Gemini 2.5-Flash | PageIndex + CribAI streaming | GEMINI_API_KEY |
| Stripe | Subscription billing | STRIPE_SECRET_KEY (webhook) |
| GitHub Actions | Nightly scrape cron (2am CT) | Repository secrets |
| Vercel | Frontend deployment | Automatic via git push |

## Shared Libraries (workspace packages)

```
@campusnest/types     → used by: utils, supabase, ai, web, scraper
@campusnest/utils     → used by: web
@campusnest/supabase  → used by: ai, web
@campusnest/ai        → used by: web (API route)
```

## Key NPM Dependencies

| Package | Version | Used In |
|---------|---------|---------|
| next | 15.5 | apps/web |
| react | 19 | apps/web |
| tailwindcss | v4 | apps/web |
| @supabase/supabase-js | 2.x | packages/supabase |
| @supabase/ssr | 0.x | packages/supabase |
| @google/genai | latest | packages/ai |
| crawlee | 3.12 | services/scraper |
| playwright | 1.49 | services/scraper |
| zod | 3.x | packages/types |
| vitest | 2.1 | packages/utils, services/scraper |
| turborepo | 2.x | root |
| pnpm | 9.15 | root |
