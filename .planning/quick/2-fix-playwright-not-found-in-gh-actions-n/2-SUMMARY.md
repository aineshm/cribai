# Quick Task 2: Fix Playwright not found in GH Actions nightly scrape — Summary

**Completed:** 2026-03-06
**Commit:** b70f963

## What changed
- Changed `npx playwright install chromium --with-deps` to `pnpm --filter @campusnest/scraper exec playwright install chromium --with-deps` in `.github/workflows/nightly-scrape.yml`

## Why
In a pnpm monorepo, `npx` can't resolve binaries from workspace package dependencies. `playwright` is a dep of `@campusnest/scraper`, so `pnpm exec` scoped to that package finds the binary correctly.

## Files modified
- `.github/workflows/nightly-scrape.yml` — line 26: replaced npx with pnpm exec
