# Contributing to CampusNest

Welcome to CampusNest! This guide covers development setup, testing, and code standards.

## Stack Overview

- **Monorepo**: pnpm 9 + Turborepo
- **Frontend**: Next.js 15 (App Router) + Tailwind v4 + TypeScript
- **Database**: Supabase (PostgreSQL + PostGIS + Auth + Edge Functions)
- **AI**: Anthropic Claude API
- **Scraper**: Crawlee + Playwright
- **UI Components**: Tamagui (Phase 2)
- **Testing**: Vitest + Playwright
- **Node**: 22.x

## Project Structure

```
campusnest/
├── apps/
│   └── web/                    # Next.js 15 app (App Router)
├── packages/
│   ├── types/                  # Zod schemas + TypeScript types
│   ├── utils/                  # Utilities (cost-calculator, fairness-scorer)
│   ├── supabase/               # Supabase client/server SDK wrappers
│   ├── ai/                     # Claude AI integration (PageIndex, CribAI)
│   └── ui/                     # Tamagui components (Phase 2)
├── services/
│   └── scraper/                # Apartments.com scraper (Crawlee + Playwright)
└── supabase/
    ├── migrations/             # Database schema
    ├── seed/                   # Seed data (campus configs)
    └── functions/              # Edge functions (rate-limiter, verify-edu, etc.)
```

## Getting Started

### Prerequisites

```bash
# Install Node.js 22.x
# Install pnpm 9.15.4
npm install -g pnpm@9.15.4

# Verify installations
node --version    # v22.x.x
pnpm --version    # 9.15.4
```

### Local Development

<!-- AUTO-GENERATED: Dev Setup -->

1. **Clone and install dependencies**
   ```bash
   git clone <repo>
   cd campusnest
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   # See docs/ENV.md for details
   ```

3. **Start development servers**
   ```bash
   pnpm dev
   ```
   This runs all dev servers in parallel using Turborepo:
   - Next.js app on http://localhost:3000
   - Scraper ready for manual runs

4. **Build all packages**
   ```bash
   pnpm build
   ```

5. **Type checking**
   ```bash
   pnpm typecheck
   ```

6. **Run tests**
   ```bash
   pnpm test
   ```

7. **Linting**
   ```bash
   pnpm lint
   ```

<!-- END AUTO-GENERATED -->

## Development Scripts

<!-- AUTO-GENERATED: Monorepo Scripts -->

### Root Level (pnpm workspace)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `turbo dev` | Start all dev servers |
| `build` | `turbo build` | Build all packages |
| `test` | `turbo test` | Run all test suites |
| `lint` | `turbo lint` | Lint with Next.js linter |
| `typecheck` | `turbo typecheck` | TypeScript type checking |
| `clean` | `turbo clean` | Remove build artifacts |

### Next.js App (apps/web)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev --turbopack` | Dev server with Turbopack |
| `build` | `next build` | Production build |
| `start` | `next start` | Run production server |
| `lint` | `next lint` | ESLint checking |
| `typecheck` | `tsc --noEmit` | TypeScript checking |

### Packages

**@campusnest/types** (Zod + TypeScript)
- `build` - Compile TypeScript
- `typecheck` - Check types only
- `clean` - Remove dist/

**@campusnest/utils** (Utilities)
- `build` - Compile TypeScript
- `test` - Run Vitest suite
- `test:watch` - Watch mode testing
- `typecheck` - Check types only
- `clean` - Remove dist/

**@campusnest/supabase** (SDK Wrappers)
- `build` - Compile TypeScript
- `typecheck` - Check types only
- `clean` - Remove dist/

**@campusnest/ai** (Claude Integration)
- `build` - Compile TypeScript
- `test` - Run Vitest suite
- `typecheck` - Check types only
- `clean` - Remove dist/

**@campusnest/ui** (Tamagui Components)
- `build` - No-op (source imports)
- `typecheck` - Check types only
- `clean` - No-op

### Services

**@campusnest/scraper** (Crawlee + Playwright)
- `start` - Run scraper (production-like)
- `build` - Compile TypeScript
- `test` - Run Vitest suite
- `typecheck` - Check types only
- `clean` - Remove dist/

<!-- END AUTO-GENERATED -->

## Testing

CampusNest requires 80%+ test coverage. Use test-driven development (TDD):

### Running Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (for specific package)
pnpm --filter @campusnest/utils test:watch

# Run specific test file
pnpm --filter @campusnest/utils test -- cost-calculator.test.ts
```

### Test Locations

- **Utils tests**: `packages/utils/src/**/*.test.ts`
- **AI tests**: `packages/ai/src/**/*.test.ts`
- **Scraper tests**: `services/scraper/src/**/*.test.ts`

### Test-Driven Development Workflow

1. **RED**: Write failing test first
   ```bash
   pnpm --filter @campusnest/utils test -- my-feature.test.ts
   # Test fails ✓
   ```

2. **GREEN**: Implement minimal code to pass
   ```typescript
   // Write implementation in src/my-feature.ts
   ```

3. **IMPROVE**: Run tests again
   ```bash
   pnpm --filter @campusnest/utils test -- my-feature.test.ts
   # Test passes ✓
   ```

4. **VERIFY**: Check coverage
   ```bash
   # Coverage is displayed in test output
   ```

## Code Style & Standards

### TypeScript

- **Strict mode**: Always enabled (tsconfig.json)
- **No implicit any**: Forbidden
- **Type annotations**: Required for function parameters and returns
- **Imports**: Use absolute imports from package exports

### Immutability (CRITICAL)

Always create new objects, never mutate:

```typescript
// WRONG - mutates original
function addRole(user: User, role: string) {
  user.roles.push(role);
  return user;
}

// CORRECT - returns new object
function addRole(user: User, role: string) {
  return {
    ...user,
    roles: [...user.roles, role]
  };
}
```

### File Organization

- Aim for 200-400 lines per file, max 800
- Organize by feature/domain, not by type
- Extract utilities into separate files when files grow
- One exported main component per file

### Error Handling

Every function must handle errors:

```typescript
// WRONG - no error handling
export async function fetchListings() {
  const response = await fetch('...');
  return response.json();
}

// CORRECT - explicit error handling
export async function fetchListings() {
  try {
    const response = await fetch('...');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.error('Failed to fetch listings:', error);
    throw error;
  }
}
```

### Input Validation

Validate at system boundaries (API routes, external services):

```typescript
// API route - validate all inputs
export async function POST(request: Request) {
  const body = await request.json();

  // Validate using Zod
  const parsed = CreateListingSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid listing data' },
      { status: 400 }
    );
  }

  // Use validated data
  return createListing(parsed.data);
}
```

### Naming Conventions

- **Files**: kebab-case for files (my-component.ts)
- **Components**: PascalCase (MyComponent)
- **Functions**: camelCase (myFunction)
- **Constants**: UPPER_SNAKE_CASE (MAX_RETRIES)
- **Types/Interfaces**: PascalCase (UserProfile)
- **Private/Internal**: Leading underscore (_internalHelper)

## Git Workflow

### Commit Messages

Follow conventional commits format:

```
<type>: <description>

<optional body with details>
```

**Types**: feat, fix, refactor, docs, test, chore, perf, ci

Examples:
```
feat: add cost calculator to fairness scorer

fix: handle null campus_id in venue index

test: add coverage for edge cases in cost-calculator

docs: update setup instructions
```

### Creating Pull Requests

1. Create feature branch
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make changes and test thoroughly
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

3. Push and create PR
   ```bash
   git push -u origin feat/my-feature
   ```

4. PR must include:
   - Clear description of changes
   - Link to related issues
   - Test plan (what was tested)
   - Any deployment notes

## Common Tasks

### Adding a New Package

```bash
# Create directory
mkdir packages/my-package
cd packages/my-package

# Create package.json (use existing as template)
# Add to pnpm-workspace.yaml automatically picked up

# Install dependencies
pnpm install
```

### Adding a Dependency

```bash
# Add to specific package
pnpm add --filter @campusnest/utils zod

# Add to root (for dev tools only)
pnpm add -D -w turbo
```

### Running a Single Package's Commands

```bash
# Run specific package script
pnpm --filter @campusnest/utils test

# Run scraper specifically
pnpm --filter @campusnest/scraper start
```

### Debugging

```bash
# Enable debug output
DEBUG=* pnpm dev

# Inspect with Node debugger
node --inspect-brk node_modules/.bin/vitest run
```

## Troubleshooting

### Build Fails with Type Errors

```bash
# Clean and rebuild
pnpm clean
pnpm typecheck
pnpm build
```

### Tests Failing After New Dependencies

```bash
# Ensure lock file is up to date
pnpm install

# Clear test cache
rm -rf .reports
pnpm test
```

### Supabase Connection Issues

```bash
# Check env vars are set
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SECRET_KEY

# Verify Supabase is accessible
curl -i $NEXT_PUBLIC_SUPABASE_URL
```

## Phase Roadmap

- **Phase 1** (Complete): Foundation - monorepo, schema, packages, auth, edge functions
- **Phase 2**: Real scrapers (apartments.com with Crawlee/Playwright)
- **Phase 3**: Pricing engine wired to real data
- **Phase 4**: Search/detail UI components, TrueCostCalculator
- **Phase 5**: CribAI PageIndex + streaming chat

## Getting Help

- Check [docs/ENV.md](./ENV.md) for environment setup
- Check [docs/RUNBOOK.md](./RUNBOOK.md) for deployment/troubleshooting
- Check [docs/CODEMAPS/](./CODEMAPS/) for architecture details
- Open an issue with reproduction steps

## Code Review Checklist

Before submitting a PR, ensure:

- [ ] Code compiles without errors (`pnpm typecheck`)
- [ ] All tests pass (`pnpm test`)
- [ ] New code has test coverage (80%+ target)
- [ ] No hardcoded secrets or credentials
- [ ] Error handling is comprehensive
- [ ] Input validation at system boundaries
- [ ] No mutations of existing objects
- [ ] Files under 800 lines
- [ ] Functions under 50 lines
- [ ] Commit messages follow conventional format
- [ ] No console.log statements left in production code
