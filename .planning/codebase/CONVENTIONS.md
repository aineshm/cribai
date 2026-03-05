# Coding Conventions

**Analysis Date:** 2026-03-05

## Naming Patterns

**Files:**
- Use kebab-case for all files: `cost-calculator.ts`, `fairness-scorer.ts`, `chat-block-renderer.tsx`
- React components use kebab-case files but PascalCase exports: `listing-card.tsx` exports `ListingCard`
- Test files: `{module-name}.test.ts` inside `__tests__/` directories
- E2E specs: `{feature}.spec.ts` inside `tests/e2e/`
- Page objects: PascalCase `HomePage.ts`, `LoginPage.ts` inside `tests/e2e/pages/`

**Functions:**
- Use camelCase: `calculateTrueCost`, `searchListings`, `createMockContext`
- Exported functions use named exports (no default exports for utilities)
- React components use PascalCase: `ListingCard`, `CribAIChat`, `ChatBlockRenderer`
- Test helpers use `make*` or `create*` prefix: `makeRaw()`, `makeCandidate()`, `createMockContext()`, `createMockQueryBuilder()`

**Variables:**
- Use camelCase: `rentMonthly`, `campusSlug`, `toolCallCount`
- Constants use UPPER_SNAKE_CASE: `DEFAULTS`, `MAX_TOOL_CALLS`, `TOTAL_TIMEOUT_MS`, `RATE_LIMITS`, `SSE_HEADERS`
- Readonly arrays use UPPER_SNAKE_CASE: `CRIBAI_TOOLS`, `SAMPLE_LISTING_ROW`

**Types:**
- Use PascalCase for interfaces and types: `TrueCostInput`, `ToolContext`, `ChatEvent`
- Derive types from Zod schemas using `z.infer<typeof schema>`: see `packages/types/src/listing.ts`
- Prefix interfaces with descriptive purpose, not `I`: `ToolContext` not `IToolContext`
- Use discriminated unions for variant types: `ChatBlock` uses `z.discriminatedUnion('type', [...])`

**Packages:**
- Scoped under `@campusnest/`: `@campusnest/types`, `@campusnest/utils`, `@campusnest/ai`, `@campusnest/supabase`
- Service packages scoped: `@campusnest/scraper`

## Code Style

**Formatting:**
- No explicit Prettier/ESLint configuration files detected at the repo root
- Next.js app uses `next lint` (built-in ESLint)
- Indentation: 2 spaces (consistent across all files)
- Single quotes for string literals
- Trailing commas in multi-line constructs
- Semicolons required

**Linting:**
- `apps/web/`: Uses `next lint` (Next.js built-in ESLint)
- No repo-wide ESLint or Prettier config
- TypeScript strict mode enabled in `tsconfig.base.json` with:
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `forceConsistentCasingInFileNames: true`

## Import Organization

**Order:**
1. Node/framework built-ins and third-party packages (`react`, `next`, `zod`, `@google/genai`)
2. Workspace packages (`@campusnest/types`, `@campusnest/utils`, `@campusnest/supabase`)
3. Relative imports (local modules, siblings)

**Type imports:**
- Use `import type` for type-only imports: `import type { TrueCost } from '@campusnest/types'`
- Separate value and type imports on different lines

**Path Aliases:**
- No path aliases configured; all imports use package names or relative paths
- Workspace packages referenced via `workspace:*` in package.json

## Error Handling

**Patterns:**
- Throw `Error` with descriptive messages: `throw new Error('Unknown tool: ${name}')`
- Supabase errors checked explicitly: `if (error) { throw new Error(\`Search failed: ${error.message}\`) }`
- API routes return structured JSON errors via helper: `jsonError('Missing query or campusSlug', 400)` in `apps/web/app/api/ai/cribai/route.ts`
- Client-side errors caught and displayed as user-friendly text blocks: `apps/web/components/cribai-chat.tsx` lines 192-201
- AbortError handled separately (silently ignored on unmount): `if (err instanceof Error && err.name === 'AbortError') return`
- `instanceof Error` guard used before accessing `.message`
- Top-level API route wrapped in try/catch returning generic `'Internal server error'`

**Validation:**
- Input validation using Zod `parse()` at tool handler boundaries: `const parsed = inputSchema.parse(args)` in `packages/ai/src/tools/handlers/search-listings.ts`
- Manual validation for API inputs: `typeof query !== 'string'` checks in `apps/web/app/api/ai/cribai/route.ts`
- Environment variables validated at usage site: `if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing...')`

## Immutability

**Required patterns:**
- All interface properties marked `readonly`: see `ToolContext`, `CribAIConfig`, `TrueCostInput`, `CribAIChatProps`
- Arrays in types use `readonly` modifier: `readonly string[]`, `readonly ComparableListing[]`
- Object constants use `as const`: `DEFAULTS = {...} as const`, `SSE_HEADERS = {...} as const`
- State updates in React create new arrays/objects (never mutate): `setMessages(prev => [...prev, newMsg])`
- Sorted arrays created from copies: `const sortedRents = [...rents].sort((a, b) => a - b)`

## Module Design

**Exports:**
- Named exports only (no default exports for non-page/layout files)
- Barrel files (`index.ts`) re-export from submodules: `packages/types/src/index.ts`, `packages/utils/src/index.ts`, `packages/ai/src/index.ts`
- Re-export both values and types from barrel files
- Default exports used only for Next.js pages, layouts, and configs

**Barrel Files:**
- Every package has a `src/index.ts` barrel file
- Barrel files export functions, types, and constants needed by consumers
- Example from `packages/utils/src/index.ts`:
  ```typescript
  export { calculateTrueCost, type TrueCostInput } from './cost-calculator';
  export { calculateFairnessScore, calculateEnhancedFairness, type FairnessInput, type EnhancedFairnessInput } from './fairness-scorer';
  ```

## Schema-First Type Design

**Pattern:** Define Zod schemas first, derive TypeScript types via `z.infer`:
```typescript
// packages/types/src/listing.ts
export const listingSchema = z.object({
  id: z.string().uuid(),
  // ...
});
export type Listing = z.infer<typeof listingSchema>;
```

**Where applied:**
- All shared types in `packages/types/src/`: `listing.ts`, `chat.ts`, `tour.ts`, `profile.ts`, `campus.ts`
- Tool input validation in `packages/ai/src/tools/handlers/`
- Discriminated unions for variant types: `chatBlockSchema` in `packages/types/src/chat.ts`

## React Component Patterns

**Props:**
- All props interfaces use `readonly` on every property
- Components are function components (no class components)
- Client components marked with `'use client'` directive at top of file
- Server components are the default (no directive needed)

**State management:**
- Local state with `useState` and `useRef`
- `useCallback` for memoized handlers passed as props or used in dependency arrays
- `useEffect` for cleanup (abort controllers): `apps/web/components/cribai-chat.tsx`
- No global state library; state flows through component hierarchy

**Styling:**
- Tailwind CSS v4 via CSS custom properties (design tokens)
- CSS variables defined in `apps/web/app/globals.css`: `--primary-*`, `--surface-*`, `--secondary-*`
- Reference variables in classes: `bg-[var(--primary-600)]`, `text-[var(--surface-900)]`
- Font variables: `font-[family-name:var(--font-display)]`
- No component library (custom components throughout)

## API Route Conventions

**Location:** `apps/web/app/api/{domain}/{endpoint}/route.ts`

**Pattern:**
- Export named HTTP method handlers: `export async function POST(request: NextRequest)`
- Return `Response` or `NextResponse`
- SSE streaming: return `new Response(stream, { headers: SSE_HEADERS })`
- Helper functions for consistent error responses: `jsonError(message, status)`
- Input validation at the top of the handler
- Fire-and-forget logging: `void supabase.from('ai_query_logs').insert(...)`

## Exhaustive Switch Handling

Use `assertUnreachable` pattern for discriminated union switches:
```typescript
function assertUnreachable(value: never): never {
  throw new Error(`Unhandled block type: ${(value as { type: string }).type}`);
}
```
Applied in `apps/web/components/chat/chat-block-renderer.tsx`.

## Comments

**When to Comment:**
- JSDoc-style block comments on Page Object classes: `apps/web/tests/e2e/pages/HomePage.ts`
- Section dividers using `// ---` comment blocks: `apps/web/app/api/ai/cribai/route.ts`
- Inline comments explaining non-obvious logic: `// Percentile: what fraction of comparables cost more`
- Edge case explanations: `// jsonb contains is tricky`
- No JSDoc on utility functions (self-documenting via TypeScript types)

---

*Convention analysis: 2026-03-05*
