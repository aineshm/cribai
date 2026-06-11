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
- [ ] Verify `dist/` contains:
  - `manifest.json`
  - `background.js`
  - `popup.js`
  - `popup.html`
  - `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] ZIP the contents of `dist/` (not the folder itself):
  ```bash
  cd apps/extension/dist && zip -r ../cribai-extension.zip .
  ```
- [ ] Load unpacked in Chrome and manually test all flows (see README.md test checklist)

## Screenshots Required

Chrome Web Store requires at least 1 screenshot (1280x800 or 640x400 px):

- [ ] Screenshot 1: Popup in signed-out state (email input visible)
- [ ] Screenshot 2: Popup in signed-in state (Save button visible)
- [ ] Screenshot 3: Popup success state (after saving a listing)
- [ ] Screenshot 4: My Apartments dashboard with saved listing (from cribai.app)

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
| `activeTab` | Required to read the HTML of the listing page the user is actively viewing when they click "Save to CribAI." |
| `storage` | Required to persist the user's authentication session across browser sessions without requiring sign-in on every use. |
| `scripting` | Required to inject the HTML capture function into the active tab when the user triggers a save. The script runs only on explicit user action. |

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
