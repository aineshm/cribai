<!-- Updated: 2026-04-22 | Runtime rebuild dependency map -->
# Dependencies

## External Services

| Service | Purpose | Config |
|---------|---------|--------|
| Supabase | PostgreSQL + PostGIS + Auth + Edge Functions | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY |
| Google Gemini 2.5-Flash | PageIndex + CribAI streaming | GEMINI_API_KEY |
| Stripe | Subscription billing | STRIPE_SECRET_KEY (webhook) |
| GitHub Actions | Nightly scrape cron (2am CT) | Repository secrets |
| GitHub Actions | Optional mission worker one-shot stopgap | SUPABASE_URL, SUPABASE_SECRET_KEY, AI/provider secrets |
| Oracle Cloud Infrastructure | Planned low-cost mission worker VM | SSH key `~/.ssh/oracle-worker`; currently blocked by A1 capacity |
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
| next | 16.1.6 | apps/web |
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

## Runtime Worker Dependencies

The mission worker runs from the root script:

```bash
pnpm worker:missions
pnpm worker:missions -- --once
```

Required environment for any worker host:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

Optional mission-specific providers:

- `GEMINI_API_KEY`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `GOOGLE_PLACES_API_KEY`
- `RESEND_API_KEY`
