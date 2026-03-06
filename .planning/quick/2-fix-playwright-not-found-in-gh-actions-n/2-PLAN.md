# Quick Task 2: Fix Playwright not found in GH Actions nightly scrape

**Mode:** quick
**Created:** 2026-03-06

## Goal
Fix `sh: 1: playwright: not found` error in nightly-scrape workflow by using pnpm exec instead of npx.

## Context
- `playwright` is a dependency of `@campusnest/scraper` (services/scraper/package.json)
- In pnpm monorepos, `npx` can't resolve binaries from workspace packages
- `pnpm --filter @campusnest/scraper exec playwright install chromium --with-deps` properly resolves the binary

## Plan 1: Fix playwright install command

### Task 1: Replace npx with pnpm exec
- **files:** `.github/workflows/nightly-scrape.yml`
- **action:** Change `npx playwright install chromium --with-deps` to `pnpm --filter @campusnest/scraper exec playwright install chromium --with-deps`
- **verify:** YAML valid, command uses pnpm exec scoped to scraper package
- **done:** Playwright binary found via pnpm in CI
