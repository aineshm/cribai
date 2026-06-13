# CribAI Extension — Privacy Policy

**Effective date:** 2026-06-11

## What data is collected

This extension collects:

- **Page HTML**: When you click "Save to CribAI," the full HTML source of the active browser tab is captured and transmitted to CribAI servers (`*.supabase.co` for auth, your configured CribAI app domain for the ingest API).
- **Page URL and title**: Captured alongside the HTML to identify the listing source.
- **Automatic already-saved check**: When the extension is installed and you are signed in, visiting a rental listing page on a supported site (Zillow, Apartments.com, Trulia, Realtor.com, Craigslist) automatically sends that page's URL — never its content — to CribAI's servers to check whether you have already saved the listing. This is used solely to display the correct button state (e.g., "Saved ✓") without requiring you to click first.
- **Authentication session**: Your CribAI auth token (a Supabase JWT) is stored locally in `chrome.storage.local` to keep you signed in across browser sessions. It is never transmitted to any third party other than CribAI's Supabase project for session validation.
- **Email address**: Used during sign-in via Supabase's OTP (magic-link) flow. Not stored locally beyond the auth session.

## What data is NOT collected

- **No HTML captured in the background**: The extension does not capture page HTML or content unless you explicitly click "Save to CribAI." Only the page URL is sent automatically (see "Automatic already-saved check" above).
- **No browsing history beyond supported listing sites**: The automatic URL check only fires on curated listing domains (Zillow, Apartments.com, Trulia, Realtor.com, Craigslist). No data is sent when you visit any other site.
- **No analytics or tracking pixels** within the extension itself.
- **No sale of data**: CribAI does not sell your data to any third party.

## Where data is sent

- **CribAI servers**: Page HTML, URL, and title are sent to `<your configured CribAI API base>/api/crm/ingest`.
- **Supabase**: Authentication tokens are managed via Supabase (supabase.co). See [Supabase's privacy policy](https://supabase.com/privacy) for details on how they handle auth data.

## Data retention

Captured listing data is retained in your CribAI account until you delete it. You can delete your account and all associated data from your CribAI profile settings.

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read the HTML of the tab you are actively viewing, only when you click the extension action. |
| `storage` | Store your CribAI authentication session locally so you stay signed in. |
| `scripting` | Inject a capture function into the active tab when you click "Save to CribAI." |

The extension declares content scripts that run on the following curated listing domains only: `zillow.com`, `apartments.com`, `trulia.com`, `realtor.com`, `craigslist.org`, and `x01oncampus.com`. These content scripts display the in-page "Save to CribAI" button and perform the automatic already-saved URL check described above. No content script or host permission applies to any other domain.

## Contact

Questions about this privacy policy: aineshmohan@gmail.com
