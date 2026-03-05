# Technology Stack

**Analysis Date:** 2026-03-05

## Languages

**Primary:**
- TypeScript 5.7+ - All application code across monorepo (strict mode enabled)

**Secondary:**
- SQL (PostgreSQL) - Database migrations in `supabase/migrations/`
- Deno TypeScript - Supabase Edge Functions in `supabase/functions/`

## Runtime

**Environment:**
- Node.js 22 (specified in `.github/workflows/nightly-scrape.yml`)
- Deno (Supabase Edge Functions runtime)

**Package Manager:**
- pnpm 9.15.4 (declared in root `package.json` `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Next.js 15.1+ - Web application with App Router, Turbopack dev mode (`apps/web/package.json`)
- React 19 - UI rendering (`apps/web/package.json`)
- Tailwind CSS 4.0 - Styling with PostCSS integration (`@tailwindcss/postcss`)

**Testing:**
- Vitest 2.1+ - Unit/integration testing for `packages/ai`, `packages/utils`, `services/scraper`
- Playwright 1.49+ - Scraper browser automation (`services/scraper/package.json`) and E2E tests (`apps/web/playwright.config.ts`)

**Build/Dev:**
- Turborepo 2.3+ - Monorepo orchestration with task caching (`turbo.json`)
- tsc - TypeScript compilation for library packages
- Turbopack - Next.js dev server (`next dev --turbopack`)

## Monorepo Structure

**Workspace packages (defined in `pnpm-workspace.yaml`):**

| Package | Path | Purpose |
|---------|------|---------|
| `@campusnest/web` | `apps/web/` | Next.js 15 web application |
| `@campusnest/ai` | `packages/ai/` | CribAI engine, PageIndex RAG, tool system |
| `@campusnest/types` | `packages/types/` | Shared Zod schemas and TypeScript types |
| `@campusnest/utils` | `packages/utils/` | Cost calculator, fairness scorer, price model |
| `@campusnest/supabase` | `packages/supabase/` | Supabase client factories (browser + server) |
| `@campusnest/ui` | `packages/ui/` | Tamagui component library (source imports, no build) |
| `@campusnest/scraper` | `services/scraper/` | Apartments.com web scraper |

**Dependency graph:**
- `@campusnest/web` depends on `types`, `utils`, `supabase`, `ai`
- `@campusnest/ai` depends on `types`, `supabase`
- `@campusnest/utils` depends on `types`
- `@campusnest/scraper` depends on `types`, `supabase`
- `@campusnest/supabase` has no internal dependencies

## Key Dependencies

**Critical:**
- `@google/genai` ^1.43.0 - Google Gemini AI SDK for CribAI agent (`packages/ai/`)
- `@supabase/supabase-js` ^2.47.0 - Supabase client (used in `packages/supabase/`, `packages/ai/`, `services/scraper/`)
- `@supabase/ssr` ^0.5.0 - Supabase SSR cookie handling for Next.js (`packages/supabase/`, `apps/web/`)
- `zod` ^3.24.0 - Schema validation for types and AI tool args (`packages/types/`, `packages/ai/`)
- `next` ^15.1.0 - Web framework with App Router (`apps/web/`)
- `react` ^19.0.0 - UI library (`apps/web/`)

**Infrastructure:**
- `crawlee` ^3.12.0 - Web scraping framework with request queue and retry (`services/scraper/`)
- `playwright` ^1.49.0 - Browser automation for scraper (`services/scraper/`)
- `tamagui` ^1.116.0 - Cross-platform UI component library (`packages/ui/`)
- `tsx` ^4.19.0 - TypeScript execution for scraper entry point (`services/scraper/`)

## Configuration

**TypeScript:**
- Base config: `tsconfig.base.json` - ES2022 target, ESNext modules, bundler resolution, strict mode
- Key strict flags: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- Each package has its own `tsconfig.json` extending the base

**Next.js:**
- Config: `apps/web/next.config.ts` - Transpiles internal packages (`@campusnest/types`, `utils`, `supabase`)
- PostCSS: `apps/web/postcss.config.mjs`
- Middleware: `apps/web/middleware.ts` - Auth guard, rate limiting, campus cookie tracking

**Turborepo:**
- Config: `turbo.json`
- Tasks: `build` (cached, env-aware), `dev` (persistent, uncached), `test`, `typecheck`, `lint`, `clean`
- Build env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`

**Environment:**
- Template: `.env.example` - Lists all required env vars
- Required vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`
- Future (Phase 2): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Legacy: `ANTHROPIC_API_KEY` (being migrated to Gemini)

## Platform Requirements

**Development:**
- Node.js 22+
- pnpm 9.15.4+
- Supabase CLI (for local edge functions and migrations)

**Production:**
- Vercel (`.vercel/` directory present, Next.js deployment)
- Supabase hosted (PostgreSQL + PostGIS + Auth + Edge Functions)
- GitHub Actions (nightly scraper cron job)

---

*Stack analysis: 2026-03-05*
