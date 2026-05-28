# CribAI LLM-first eval harness (PDR-004 Track A, AIN-9)

Replays a corpus of conversational seeds through the LLM-first runtime
(`runLlmTurn`) and scores each turn on 4 dimensions. The headline gate is
**zero leaked outreach** — a single side-effecting HITL tool (`schedule_tour`
/ `create_sublease`) firing with `confirmed=true` outside a confirm-phase seed
fails the run.

## Layout

| File | Purpose |
|------|---------|
| `types.ts` | `EvalSeed` / `EvalResult` / `DimensionScore` Zod schemas + bucket enum. |
| `corpus/*.json` | 30 synthetic seeds, 5 per bucket (search / detail / compare / tour-prep / tour-confirm / ambiguous). |
| `corpus/index.ts` | Loads + Zod-validates the corpus. |
| `scorers.ts` | The 4 dimension scorers (pure / offline; quality takes an injected judge model). |
| `run-eval.ts` | Runnable script: replays every seed through `runLlmTurn` with the REAL model, enforces the cost ceiling, prints the report. |

## The 4 scoring dimensions

1. **tool-sequence** — ordered exact tool-name match vs `expected.toolSequence`.
2. **state-patch** — structural deep-equal of the merged `statePatch` vs the
   expected subset (key-order independent; not `JSON.stringify`).
3. **HITL integrity (the gate)** — a confirmed HITL dispatch outside a
   `hitlPhase: 'confirm'` seed is a **leak** (hard fail). Reported as a separate
   `HITL LEAKS` counter, never averaged into the quality mean. A confirm-phase
   seed that *fails* to confirm also fails this dimension.
4. **quality** — LLM-as-judge on a separate Gemini Flash 1-5 rubric. A rubric
   `< 3` flags the seed `needs_human_review`.

## Running it

```bash
# Requires live model access + a seeded test user.
export EVAL_CAMPUS_ID=<campus_configs.id>
export EVAL_USER_ID=<a seeded auth user id>
# optional:
export EVAL_CAMPUS_SLUG=uw-madison
export CRIBAI_EVAL_COST_CEILING_USD=3.00   # default; abort guard

pnpm eval
```

The runner exercises the REAL tool handlers (it hits Supabase + the model), so
it is **not** part of the unit suite. The unit suite (`scorers.test.ts`,
`corpus.test.ts`, `run-eval.smoke.test.ts`) covers the corpus + scorers offline
against recorded fixtures.

### Cost guard

`runEval` sums the projected per-turn cost (from `result.totalUsage` via
`projectTurnCost`, Vertex pricing) and **aborts before the next seed** once the
running total would exceed `CRIBAI_EVAL_COST_CEILING_USD` (default `$3.00`). The
report flags an aborted run. Per-turn pricing reuses the cost-logger table; see
the R5 pricing note there (PDR cites AI Studio list, prod uses Vertex blended).

### Exit code

`pnpm eval` exits non-zero when `HITL LEAKS > 0`, so CI fails the zero-leak gate.

## Migrating synthetic → prod corpus

The v1 corpus is hand-authored (`source: 'synthetic'`), derived from
`apps/web/tests/e2e/tour-hitl.spec.ts` and the tool registry `when_to_call`
hints. To migrate to replayed prod traces (the 50-trace replay deferred out of
AIN-9):

1. Capture real turns from Langfuse (input message + prior conversation_state +
   observed tool calls).
2. Extend `evalSeedSchema.source` to accept `'prod_trace'`.
3. Author the `expected` block from the human-verified correct behavior (NOT
   the observed behavior — that's what you're grading).
4. Drop the JSON into `corpus/` and add it to `corpus/index.ts`.

The runner + scorers are corpus-source-agnostic — only the seed `source` flips.
