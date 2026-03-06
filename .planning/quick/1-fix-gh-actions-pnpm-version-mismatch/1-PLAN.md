# Quick Task 1: Fix GH Actions pnpm version mismatch

**Mode:** quick
**Created:** 2026-03-06

## Goal
Remove duplicate pnpm version specification from GitHub Actions workflow to fix `ERR_PNPM_BAD_PM_VERSION` error.

## Context
- `package.json` declares `"packageManager": "pnpm@9.15.4"`
- `.github/workflows/nightly-scrape.yml` also sets `version: 9` in `pnpm/action-setup@v4`
- `pnpm/action-setup@v4` auto-reads `packageManager` from `package.json` when no `version` is specified

## Plan 1: Fix version mismatch

### Task 1: Remove version key from workflow
- **files:** `.github/workflows/nightly-scrape.yml`
- **action:** Remove `version: 9` from the `pnpm/action-setup@v4` step (lines 17-18). Keep the step but without the `with.version` key so it reads from `package.json`.
- **verify:** YAML is valid, no duplicate version specs remain
- **done:** Workflow uses only `packageManager` from `package.json`
