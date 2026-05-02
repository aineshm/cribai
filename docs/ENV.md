# Environment Variables

Reference for all required and optional environment variables in CampusNest.

## Quick Start

```bash
cp .env.example .env.local
# Edit .env.local with your values
```

## Required Variables

<!-- AUTO-GENERATED: Environment Variables -->

### Supabase

**NEXT_PUBLIC_SUPABASE_URL**
- **Type**: String (URL)
- **Required**: Yes
- **Scope**: Frontend & Backend
- **Description**: Supabase project URL
- **Example**: `https://your-project.supabase.co`
- **Where to get**: Supabase Dashboard → Settings → API → Project URL

**NEXT_PUBLIC_SUPABASE_ANON_KEY**
- **Type**: String (JWT)
- **Required**: Yes
- **Scope**: Frontend & Backend
- **Description**: Supabase anonymous key for public access
- **Security**: Public safe (prefixed with NEXT_PUBLIC_)
- **Where to get**: Supabase Dashboard → Settings → API → anon key

**SUPABASE_SECRET_KEY**
- **Type**: String (JWT)
- **Required**: Yes
- **Scope**: Backend only (server/Edge Functions)
- **Description**: Supabase service role key for admin operations
- **Security**: SECRETS ONLY - Never expose publicly
- **Where to get**: Supabase Dashboard → Settings → API → service_role key
- **Used by**:
  - Next.js server components and API routes
  - Supabase Edge Functions
  - GitHub Actions workflows
  - Scraper service

### Google Gemini API

**GEMINI_API_KEY**
- **Type**: String (Token)
- **Required**: Yes for AI Studio auth; alternatively set `GOOGLE_CLOUD_PROJECT` for Vertex AI
- **Scope**: Backend only
- **Description**: API key for Gemini models via Google AI Studio
- **Security**: SECRETS ONLY - Never expose publicly
- **Where to get**: Google AI Studio → API Keys
- **Used by**:
  - CribAI
  - embedding generation
  - mission steering/content generation
- **Rate limits**: Check Google AI Studio or Google Cloud quota dashboard

**GOOGLE_CLOUD_PROJECT**
- **Type**: String
- **Required**: Required only for Vertex AI auth
- **Scope**: Backend only
- **Description**: Google Cloud project for Vertex AI Gemini access

**GOOGLE_APPLICATION_CREDENTIALS_JSON**
- **Type**: JSON string
- **Required**: Optional, used when Vertex AI credentials are provided inline
- **Scope**: Backend only
- **Security**: SECRETS ONLY - Never expose publicly

### Stripe (Phase 2)

**STRIPE_SECRET_KEY**
- **Type**: String (Token)
- **Required**: Phase 2+
- **Scope**: Backend only
- **Description**: Stripe secret key for payment processing
- **Security**: SECRETS ONLY - Never expose publicly
- **Where to get**: [Stripe Dashboard](https://dashboard.stripe.com) → Developers → API Keys

**STRIPE_WEBHOOK_SECRET**
- **Type**: String (Token)
- **Required**: Phase 2+
- **Scope**: Backend only
- **Description**: Webhook signing secret for Stripe events
- **Security**: SECRETS ONLY - Never expose publicly
- **Where to get**: Stripe Dashboard → Developers → Webhooks → [Endpoint] → Signing secret

**NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY**
- **Type**: String (Token)
- **Required**: Phase 2+
- **Scope**: Frontend safe
- **Description**: Stripe publishable key for client-side operations
- **Security**: Public safe (prefixed with NEXT_PUBLIC_)
- **Where to get**: Stripe Dashboard → Developers → API Keys

<!-- END AUTO-GENERATED -->

## Environment by Stage

### Local Development (.env.local)

```bash
# Supabase - Use development project
NEXT_PUBLIC_SUPABASE_URL=https://dev-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_dev_anon_key
SUPABASE_SECRET_KEY=your_dev_service_role_key

# Gemini - Use development key or Vertex AI project credentials
GEMINI_API_KEY=your_dev_gemini_key

# Stripe - Use test keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

### Staging

Set in `.env.staging` or via deployment platform environment variables:

```bash
# Same structure as production but with staging credentials
NEXT_PUBLIC_SUPABASE_URL=https://staging-project.supabase.co
SUPABASE_SECRET_KEY=staging_service_role_key
GEMINI_API_KEY=staging_gemini_key
```

### Production

Set via secret management (never in .env files):

```bash
# Vercel Deployment
# Go to Vercel Project → Settings → Environment Variables

# GitHub Actions
# Go to Repository → Settings → Secrets and variables → Actions
```

## Variable Prefixes & Scope

### NEXT_PUBLIC_ (Frontend Visible)

Variables with this prefix are bundled into the browser and visible:
- `NEXT_PUBLIC_SUPABASE_URL` - Safe: public endpoint
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Safe: limited scope token
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Safe: limited scope token

Never put secrets here (API keys, service role keys, webhook secrets).

### Backend Only (Server Environment)

Variables without prefix are server-only:
- `SUPABASE_SECRET_KEY` - Admin access, never expose
- `GEMINI_API_KEY` - Rate limited, authentication required
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` - service-account credentials, never expose
- `STRIPE_SECRET_KEY` - Full payment access, never expose
- `STRIPE_WEBHOOK_SECRET` - Webhook verification, never expose

Access in:
- Next.js server components
- API routes (`/app/api/`)
- Supabase Edge Functions
- GitHub Actions
- Scraper service

## Setup Instructions

### 1. Supabase

```bash
# Create free account at supabase.com
# Create new project
# Wait for database initialization (~2 min)

# Get credentials from Settings → API
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your_anon_key"
export SUPABASE_SECRET_KEY="your_service_role_key"

# Verify connection
curl -i $NEXT_PUBLIC_SUPABASE_URL
```

### 2. Google Gemini API

```bash
# Get API key from Google AI Studio, or configure Vertex AI

export GEMINI_API_KEY="..."

# Or for Vertex AI
export GOOGLE_CLOUD_PROJECT="your-project"
export GOOGLE_CLOUD_LOCATION="us-central1"
```

### 3. Stripe (Phase 2)

```bash
# Create account at stripe.com
# Go to Developers → API Keys

export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
export STRIPE_SECRET_KEY="sk_test_..."

# Create webhook endpoint
# Developers → Webhooks → Add endpoint
export STRIPE_WEBHOOK_SECRET="whsec_test_..."
```

## Validation

Environment variables are validated at startup in specific packages:

### packages/supabase

```typescript
// src/server.ts validates:
if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error('SUPABASE_SECRET_KEY is required');
}
```

### packages/ai

```typescript
// Requires GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT for model calls
```

### apps/web

```typescript
// src/lib/auth.ts validates Supabase URLs
```

## Security Checklist

- [ ] Never commit .env.local to git
- [ ] .env.local is in .gitignore
- [ ] Secrets never logged to console
- [ ] No secret keys in error messages
- [ ] Rotation plan for compromised keys
- [ ] Different keys per environment (dev/staging/prod)
- [ ] API keys have minimal required scopes
- [ ] Webhook secrets only used for verification
- [ ] Rate limits monitored in dashboards

## Troubleshooting

### "SUPABASE_SECRET_KEY is not defined"

```bash
# Verify variable is set
echo $SUPABASE_SECRET_KEY

# Check .env.local exists
ls -la .env.local

# Reload shell environment
source .env.local

# For Next.js, restart dev server
pnpm dev
```

### "Unauthorized" from Supabase

```bash
# Verify keys match your project
NEXT_PUBLIC_SUPABASE_URL=your_url
curl -i $NEXT_PUBLIC_SUPABASE_URL

# Check service role key (not anon key) for admin operations
# Test with correct key
```

### "Invalid API key" from Gemini

```bash
# Verify one Gemini auth path is configured
echo $GEMINI_API_KEY | head -c 6
echo $GOOGLE_CLOUD_PROJECT

# Check key is active in Google AI Studio or Vertex AI credentials are valid
# Regenerate if needed
```

### "Invalid Stripe credentials"

```bash
# Use test keys in development, not live keys
echo $STRIPE_SECRET_KEY | grep test

# Verify webhook secret is from correct endpoint
# Check webhook logs in Stripe dashboard
```

## Local Development Workflow

```bash
# 1. Copy example
cp .env.example .env.local

# 2. Fill in credentials
vim .env.local

# 3. Source environment (some shells auto-load .env.local)
source .env.local

# 4. Start development
pnpm dev

# 5. Verify in browser console (check for Supabase errors)
# 6. Check server logs for API errors
```

## CI/CD Integration

### GitHub Actions

Set secrets in Repository → Settings → Secrets and variables → Actions

```yaml
# .github/workflows/nightly-scrape.yml
env:
  NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
```

### Vercel Deployment

Settings → Environment Variables

```
Name: SUPABASE_SECRET_KEY
Value: <your-secret-key>
Environments: Production, Preview, Development
```

## References

- [Supabase API Documentation](https://supabase.com/docs/guides/api)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
