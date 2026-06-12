# Chrome Web Store Listing Copy

## Short Description (132 chars max)

Save any rental listing to your CribAI apartment CRM with one click. Track, compare, and organize your housing search.

## Full Description (up to 16,000 chars)

**CribAI — Save to My Apartments**

Apartment hunting is overwhelming. Zillow, Apartments.com, Craigslist, Facebook Marketplace — listings are everywhere, and you lose track fast.

CribAI is an AI-powered student housing platform that helps you search, compare, and decide. This extension connects your browser to your CribAI account so you can capture any listing page with one click and have CribAI automatically extract the details into your personal apartment tracker.

**How it works:**

**Option A — In-page button (fastest):**
1. Browse any rental listing on Zillow, Apartments.com, Trulia, Realtor.com, or Craigslist
2. Click the floating "Save to CribAI" button in the bottom-right corner of the page
3. CribAI reads the page and adds the listing to your My Apartments dashboard

**Option B — Extension popup (works on any site):**
1. Browse any rental listing
2. Click the CribAI extension icon in your toolbar
3. Click "Save to CribAI"
4. CribAI reads the page and adds the listing to your My Apartments dashboard

Compare saved listings side-by-side with AI-generated summaries.

**What gets sent:**
The HTML of the listing page you are viewing is sent to CribAI's servers ONLY when you explicitly click "Save to CribAI." Nothing is captured in the background. No browsing history. No tracking.

**Requirements:**
- A free CribAI account (sign up at cribai.app)
- University or personal email address

**Single purpose:**
This extension has exactly one purpose: capture the HTML of a listing page the user is actively viewing and submit it to CribAI's ingest API, authenticated with the user's CribAI session. No other functionality.

---

*CribAI is an AI-native student housing platform built for UW-Madison students, expanding to more campuses soon.*

## Single-Purpose Justification

This extension has a single purpose: capture the HTML of a rental listing page the user is viewing and save it to the user's CribAI apartment CRM. This happens in two ways:
1. Via the in-page "Save to CribAI" button (content script on curated listing domains only), which the user must click explicitly.
2. Via the popup "Save to CribAI" button (activeTab + scripting, on any page), which the user must click explicitly.

No background data collection occurs. The content script only displays a button and reads the page when the button is clicked. Captured HTML is sent only to CribAI servers and only upon explicit user action.

## Category

Productivity

## Tags

housing, apartment, rental, student, AI, CRM, real estate
