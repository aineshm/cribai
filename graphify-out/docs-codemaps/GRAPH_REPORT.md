# Graph Report - /Users/aineshmohan/Developer/ai-real-estate-agent/docs/CODEMAPS  (2026-04-22)

## Corpus Check
- Deterministic graph regenerated from current product docs/CODEMAPS markdown after runtime rebuild doc updates.

## Summary
- 56 nodes · 123 edges · 6 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Runtime Rebuild Status` - 10 edges
2. `Data Flow` - 9 edges
3. `API Routes (apps/web/app/api/)` - 9 edges
4. `System Diagram` - 8 edges
5. `Backend` - 8 edges
6. `External Services` - 8 edges
7. `Architecture` - 6 edges
8. `Runtime Tables And Migrations` - 6 edges
9. `Data` - 6 edges
10. `Frontend (apps/web/)` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Runtime Rebuild Code Maps` --references--> `Backend`  [EXTRACTED]
   → backend.md  _Bridges community 3 → community 5_
- `Runtime Rebuild Code Maps` --references--> `Data`  [EXTRACTED]
   → data.md  _Bridges community 3 → community 2_
- `Runtime Rebuild Code Maps` --references--> `Dependencies`  [EXTRACTED]
   → dependencies.md  _Bridges community 3 → community 1_
- `Runtime Rebuild Code Maps` --references--> `Frontend (apps/web/)`  [EXTRACTED]
   → frontend.md  _Bridges community 3 → community 0_
- `Google Gemini` --powers--> `CribAI model fallback`  [EXTRACTED]
   →   _Bridges community 4 → community 1_

## Communities

### Community 0 - "mission queue"
Cohesion: 0.25
Nodes (14): mission queue, mission status UI, Oracle Cloud worker, statePatch, Supabase migration 033, ToolResult.machineData, typed chat blocks, Frontend (apps/web/) (+6 more)

### Community 1 - "mission worker"
Cohesion: 0.33
Nodes (11): GitHub Actions worker, Google Gemini, mission worker, Supabase PostgreSQL, Vercel, Dependencies, Mission Worker Entrypoints, External Services (+3 more)

### Community 2 - "Data"
Cohesion: 0.24
Nodes (10): claim_next_mission_job, lease/retry metadata, Supabase migration 032, Data, Runtime Tables And Migrations, Key Indexes, Queue Helpers, RLS: Enabled on all tables (+2 more)

### Community 3 - "deterministic chat runtime"
Cohesion: 0.31
Nodes (9): deterministic chat runtime, Next.js 16, pgvector, PostGIS, Architecture, Runtime Rebuild Code Maps, Build Pipeline (turbo.json), Monorepo Layout (pnpm 9 + Turborepo) (+1 more)

### Community 4 - "conversation_state"
Cohesion: 0.46
Nodes (8): conversation_state, CribAI model fallback, explore viewport API, public listing detail API, search listings API, Data Flow, API Routes (apps/web/app/api/), State Management

### Community 5 - "Backend"
Cohesion: 0.5
Nodes (4): Backend, Edge Functions (supabase/functions/), Scraper Pipeline (services/scraper/), Supabase Clients (packages/supabase/)

## Knowledge Gaps
- **7 isolated node(s):** `Build Pipeline (turbo.json)`, `Edge Functions (supabase/functions/)`, `Scraper Pipeline (services/scraper/)`, `Supabase Clients (packages/supabase/)`, `RLS: Enabled on all tables` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Backend` connect `Backend` to `mission queue`, `mission worker`, `Data`, `deterministic chat runtime`, `conversation_state`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `API Routes (apps/web/app/api/)` connect `conversation_state` to `mission queue`, `mission worker`, `deterministic chat runtime`, `Backend`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `Data` connect `Data` to `deterministic chat runtime`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **What connects `Build Pipeline (turbo.json)`, `Edge Functions (supabase/functions/)`, `Scraper Pipeline (services/scraper/)` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._