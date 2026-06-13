# Chrome Web Store Submission Checklist

## Pre-submission (one-time)

- [ ] Create Chrome Web Store developer account: https://chrome.google.com/webstore/devconsole
  - One-time $5 USD registration fee
  - Requires a Google account
  - Takes ~1 business day to activate

## Build & Package

- [ ] Set real values in `apps/extension/.env` (copy from `.env.example`):
  - `VITE_CRIBAI_APP_DOMAIN` — production URL
  - `VITE_SUPABASE_URL` — from Supabase dashboard
  - `VITE_SUPABASE_ANON_KEY` — publishable key (NOT service-role key)
- [ ] Run production build: `cd apps/extension && pnpm build`
- [ ] Verify `dist/` contains (v0.2.0 — FIRST Web Store submission):
  - `manifest.json` (version 0.2.0)
  - `background.js`
  - `popup.js`
  - `popup.html`
  - `content.js` (NEW in v0.2.0 — in-page save button IIFE bundle)
  - `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] ZIP the contents of `dist/` (not the folder itself):
  ```bash
  cd apps/extension/dist && zip -r ../cribai-extension.zip .
  ```
- [ ] Load unpacked in Chrome and manually test all flows (see smoke steps below)

## Screenshots Required

Chrome Web Store requires at least 1 screenshot (1280x800 or 640x400 px):

- [ ] Screenshot 1: Popup in signed-out state (email input visible)
- [ ] Screenshot 2: Popup in signed-in state (Save button visible)
- [ ] Screenshot 3: Popup success state (after saving a listing)
- [ ] Screenshot 4: **In-page "Save to CribAI" floating button on a Zillow listing detail page** (NEW in v0.2.0)
- [ ] Screenshot 5: **In-page button in the "Added to CribAI" green confirmation animation state** (NEW in v0.2.0)
- [ ] Screenshot 6: My Apartments dashboard with saved listing (from cribai.app)

Tool: Load unpacked → open popup → screenshot with DevTools device emulator.

## Store Listing Fields

- [ ] **Name**: CribAI — Save to My Apartments
- [ ] **Short description**: (from `store/listing.md`) 132 chars max
- [ ] **Full description**: (from `store/listing.md`)
- [ ] **Category**: Productivity
- [ ] **Icon**: `src/public/icons/icon128.png` (replace placeholder with final branded icon)
- [ ] **Screenshots**: (see above)
- [ ] **Privacy policy URL**: Host `store/privacy-policy.md` at a public URL
  - Option A: Publish as a page on cribai.app/privacy-extension
  - Option B: GitHub raw URL (less polished but accepted)

## Permissions Justification (required fields)

When submitting, Chrome requires you to justify each permission:

| Permission | Justification |
|---|---|
| `activeTab` | Required to read the HTML of the listing page the user is actively viewing when they click "Save to CribAI" via the popup (fallback path on non-curated domains). |
| `storage` | Required to persist the user's authentication session across browser sessions without requiring sign-in on every use. |
| `scripting` | Required to inject the HTML capture function into the active tab when the user triggers a save via the popup. The script runs only on explicit user action. |

### Content Scripts Justification (v0.2.0 — first Web Store submission)

The extension declares a `content_scripts` entry matching the following rental-listing domains:

`*.zillow.com`, `*.apartments.com`, `*.trulia.com`, `*.realtor.com`, `*.craigslist.org`, `x01oncampus.com`

**Why:** Content scripts run only on the listed rental-listing domains to display a floating "Save to CribAI" button on listing detail pages. The button lets users save a listing with a single click without opening the extension popup. The extension reads the page HTML of the listing the user chooses to save; it does not track browsing, collect data in the background, or run on any other websites.

The button is mounted only on listing detail pages (detected by URL pattern per site); it does not appear on search or browse pages. On domains not in this list, the popup remains the save mechanism.

`host_permissions` remains `[]` — the `content_scripts.matches` list is the only permission surface.

## Manual Smoke Steps (v0.2.0 — founder gate before Web Store submission)

Task 7.2 from the AIN-72 implementation plan. Perform these manually after loading
`dist/` as an unpacked extension against the local dev server.

Prerequisites:
- `pnpm build` run in `apps/extension/` — `dist/content.js` present
- Dev server running with `CRM_EXTENSION_ORIGIN=chrome-extension://<your-unpacked-id>` set
- Extension loaded unpacked at `chrome://extensions` — note the extension ID
- Signed-in CribAI account available

| # | Step | Expected |
|---|------|----------|
| 1 | Navigate to `https://www.zillow.com/homedetails/` (any listing detail URL) | Floating "Save to CribAI" indigo pill button appears in bottom-right corner of the page |
| 2 | Navigate to `https://x01oncampus.com/` (any page) | Button appears |
| 3 | Navigate to `https://www.zillow.com/madison-wi/rentals/` (search page) | Button does NOT appear |
| 4 | Without signing in, click the button | Button changes to "Save to CribAI" with sublabel "Click the CribAI icon in your toolbar to sign in first" (signed_out state) |
| 5 | Sign in via the popup (CribAI toolbar icon → email → OTP) | Popup shows signed-in state |
| 6 | On a Zillow detail page not yet saved, click the button | Spinner shows → "Analyzing listing…" sublabel after ~3s → green "Added to CribAI" with checkmark draw animation (pop bounce). SW network log shows `/api/crm/saved` GET (200) and `/api/crm/ingest` POST (201). |
| 7 | On the same Zillow detail page, reload the page | Button shows "Saved ✓" with "Open My Apartments" sublabel (already_saved state). Clicking the button opens `/my-apartments` in a new tab. |
| 8 | Navigate to a different Zillow detail page (not yet saved) | Button shows "Save to CribAI" (idle state) |
| 9 | On a Zillow detail page, navigate to the search page (SPA nav) | Button disappears within ~1.5s |
| 10 | SPA-navigate from search back to a detail page | Button reappears |
| 11 | Verify popup fallback: click toolbar icon on any non-curated site (e.g. facebook.com) | Popup shows save flow as before (popup is the fallback on non-curated domains) |

Record a short screen capture of steps 6-7 for the store listing.

---

## Review Timeline

- Initial review: **3–14 business days** (typically 3–7 days for new extensions)
- If rejected: respond to reviewer feedback within 30 days or submission is closed
- Common rejection reasons:
  - Unclear single-purpose justification → use text from `store/listing.md`
  - Missing or insufficient privacy policy → host `store/privacy-policy.md`
  - Overly broad permissions → already minimized (no host_permissions)
  - Remote code execution → ensure no `eval()` or dynamic script loading

## Post-approval

- [ ] Share install link with beta users
- [ ] Monitor Chrome Web Store developer dashboard for reviews/issues
- [ ] Extension ID will be assigned on first publish — note it for CORS allow-list on the ingest API route
