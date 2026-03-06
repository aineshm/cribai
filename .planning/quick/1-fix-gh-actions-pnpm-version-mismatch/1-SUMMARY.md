# Quick Task 1: Fix GH Actions pnpm version mismatch — Summary

**Completed:** 2026-03-06
**Commit:** 2e1a6dc

## What changed
- Removed `version: 9` from `pnpm/action-setup@v4` step in `.github/workflows/nightly-scrape.yml`
- `pnpm/action-setup@v4` now reads the version from `packageManager: "pnpm@9.15.4"` in `package.json`

## Why
GitHub Actions was failing with `ERR_PNPM_BAD_PM_VERSION` because two different pnpm versions were specified:
- `version: 9` (workflow) vs `pnpm@9.15.4` (package.json)

## Files modified
- `.github/workflows/nightly-scrape.yml` — removed `with.version` block (2 lines deleted)
