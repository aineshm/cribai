# CribAI Chrome Extension (MV3)

Save any rental listing page to your CribAI apartment CRM with one click.

**Linear:** AIN-62 | **Sprint:** CRM v1 (WS3b)

---

## Architecture

```
apps/extension/
├── src/
│   ├── config/
│   │   └── constants.ts        # Single source of truth for URLs + limits
│   ├── lib/
│   │   ├── ingest.ts           # Pure: payload assembly, size guard, HTTP call
│   │   ├── messages.ts         # Type-safe popup↔SW message contract
│   │   ├── storage-adapter.ts  # chrome.storage.local ↔ Supabase storage interface
│   │   └── __tests__/          # Vitest unit tests (no browser APIs needed)
│   ├── background/
│   │   ├── index.ts            # Service worker: auth + save orchestration
│   │   └── supabase-client.ts  # Supabase singleton for SW context
│   ├── popup/
│   │   ├── popup.html          # Popup UI (no framework — plain HTML)
│   │   └── popup.ts            # Popup controller (view state machine)
│   ├── public/
│   │   └── icons/              # icon16/48/128.png
│   └── manifest.json           # MV3 manifest
├── store/
│   ├── listing.md              # Web Store copy: short desc, full desc, justification
│   ├── privacy-policy.md       # Privacy policy draft
│   └── SUBMISSION.md           # Submission checklist
├── .env.example                # Build env template
├── vite.config.ts
├── vitest.config.ts
└── package.json
```

### Key design decisions

**Content script injected on click (not declared in manifest)**

Using `chrome.scripting.executeScript` from the service worker rather than a manifest-declared content script means:
- No `<all_urls>` host permission needed
- Script runs only when the user explicitly clicks "Save"
- Eases Web Store review (narrower permission footprint)

**Auth: magic-link OTP (not email/password)**

The web app already uses `signInWithOtp` + `verifyOtp`. Reusing this flow means:
- No separate password storage in the extension
- Same Supabase project, same session JWT, same RLS policies
- Supabase's 6-digit OTP code is simple to type into the popup

**Session in chrome.storage.local**

Service workers have no `localStorage`. `@supabase/supabase-js` accepts a custom `storage` implementation — we inject a `chrome.storage.local` adapter. The adapter is a thin seam, fully tested with mocks.

**Single config module (`src/config/constants.ts`)**

All URLs and limits live in one file, injected at build time via Vite `define`. No hardcoded values in business logic.

---

## Dev Setup

### Prerequisites

```bash
# From monorepo root
pnpm install
```

### Environment

```bash
cp apps/extension/.env.example apps/extension/.env
# Edit .env — set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_CRIBAI_APP_DOMAIN
```

For local dev against the Next.js app:
```
VITE_CRIBAI_APP_DOMAIN=http://localhost:3000
VITE_CRIBAI_API_BASE=http://localhost:3000
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from .env.local>
```

### Build

```bash
# Development build (with source maps, watch mode)
cd apps/extension
pnpm dev

# Production build
pnpm build

# Output: apps/extension/dist/
```

### Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select `apps/extension/dist/`
5. The CribAI icon appears in the toolbar

After any code change: `pnpm build` → click the refresh icon on the extension card in `chrome://extensions`.

### Run tests

```bash
cd apps/extension
pnpm test

# Watch mode
pnpm test:watch
```

---

## Manual Test Checklist

These require a real browser (cannot be automated in unit tests):

### Auth flow

- [ ] **Sign-in (cold start)**: Open popup → email step appears → enter email → "Send code"
  - Expected: OTP step appears with "Check your email for the code"
- [ ] **OTP verification**: Enter 6-digit code from email
  - Expected: Transitions to save view, showing signed-in email
- [ ] **Auto-verify on 6 digits**: Type all 6 digits → should auto-submit
- [ ] **Invalid OTP**: Enter wrong code → click Verify
  - Expected: Error message from Supabase (e.g. "Token has expired or is invalid")
- [ ] **Resend code**: Click "Resend code" → should show "Sent!" briefly
- [ ] **Back navigation**: OTP step → click Back → email step, input cleared
- [ ] **Sign out**: Signed-in view → "Sign out" → email step
- [ ] **Persist across popup open/close**: Sign in, close popup, reopen → should be on save view

### Save flow

- [ ] **Successful save**: Navigate to a Zillow listing → open popup → click "Save to CribAI"
  - Expected: Success view with "View My Apartments" link
- [ ] **Deep link**: Click "View My Apartments" → opens `<APP_DOMAIN>/my-apartments` in new tab
- [ ] **Non-listing page**: Try saving google.com → ingest API may return 400 → error shown
- [ ] **Large page guard**: Test with a very large HTML page (>4MB) → size warning before sending
- [ ] **Rate limit UX**: If 429 received → friendly "wait a moment" message (not a crash)
- [ ] **Session expired mid-session**: Manually clear chrome.storage.local session → click Save → auth error, transitions to sign-in

### Error states

- [ ] **No network**: Disable Wi-Fi → click Save → "Network error" message
- [ ] **Ingest route not yet deployed**: With `VITE_CRIBAI_API_BASE` pointing to a URL without the route → 404/5xx → generic server error message

### CORS note

When testing against `localhost:3000`, the ingest route's CORS allow-list must include `chrome-extension://<extension-id>`. The extension ID is shown in `chrome://extensions` after loading unpacked. Add it to the route's CORS config before testing the save flow against local dev.

For production: the real extension ID is assigned by Chrome Web Store on first publish. Note the ID and add it to the production ingest route's CORS allow-list before releasing.

---

## Build Env Vars Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_CRIBAI_APP_DOMAIN` | Yes | App URL for deep-links, e.g. `https://cribai.app` |
| `VITE_CRIBAI_API_BASE` | No | API base URL (defaults to APP_DOMAIN) — useful for preview deploys |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Publishable anon key — safe to embed |

The service-role key (`SUPABASE_SECRET_KEY`) must **never** appear in extension code.

---

## Packaging for Web Store

```bash
pnpm build
cd dist
zip -r ../cribai-extension.zip .
```

Upload `cribai-extension.zip` at https://chrome.google.com/webstore/devconsole

See `store/SUBMISSION.md` for the full checklist.
