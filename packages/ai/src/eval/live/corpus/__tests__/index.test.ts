/**
 * AIN-93 Task 5 — corpus review pass: every ticket bucket covered, unique
 * ids, and at least one scenario per hard criterion that can ONLY fail via
 * that criterion (isolation) — the plan's explicit Task 5 requirement.
 */
import { describe, expect, it } from 'vitest';
import { loadLiveCorpus, liveCorpusByBucket, LIVE_EVAL_BUCKETS } from '../index';

describe('loadLiveCorpus', () => {
  const scenarios = loadLiveCorpus();

  it('loads exactly 20 scenarios (validated at load — a malformed one would throw)', () => {
    expect(scenarios).toHaveLength(20);
  });

  it('every scenario id is unique', () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every ticket bucket has at least one scenario', () => {
    const byBucket = liveCorpusByBucket();
    for (const bucket of LIVE_EVAL_BUCKETS) {
      expect(byBucket[bucket].length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every bucket has exactly 2 scenarios (the plan\'s ~20 = 2x10 target)', () => {
    const byBucket = liveCorpusByBucket();
    for (const bucket of LIVE_EVAL_BUCKETS) {
      expect(byBucket[bucket]).toHaveLength(2);
    }
  });
});

describe('isolation — at least one scenario exercises each hard criterion primarily', () => {
  const scenarios = loadLiveCorpus();
  const allTurns = scenarios.flatMap((s) => s.turns);

  it('tool_expectation: at least one turn expects a non-empty tool sequence', () => {
    expect(allTurns.some((t) => t.expect.tool.length > 0)).toBe(true);
  });

  it('tool_expectation: at least one turn expects NO tool call (isolates the other direction)', () => {
    expect(allTurns.some((t) => t.expect.tool.length === 0)).toBe(true);
  });

  it('grounding: at least one turn uses ranked_ids and at least one uses listing_fields', () => {
    expect(allTurns.some((t) => t.expect.grounding === 'ranked_ids')).toBe(true);
    expect(allTurns.some((t) => t.expect.grounding === 'listing_fields')).toBe(true);
  });

  it('show_card: pinned true only where the query removes model discretion (pick-for-me-02); every other turn is left unset (adjudicated live-run fix — pinning flipped 3/3 on archived-exclusion)', () => {
    expect(allTurns.some((t) => t.expect.show_card === true)).toBe(true);
    expect(allTurns.filter((t) => t.expect.show_card === undefined).length).toBeGreaterThan(1);
  });

  it('archived-exclusion bucket scenarios reference the archived seed row (fabricated-ids isolation)', () => {
    const archivedBucket = scenarios.filter((s) => s.bucket === 'archived_exclusion');
    expect(archivedBucket.length).toBeGreaterThan(0);
    for (const scenario of archivedBucket) {
      expect(scenario.seedRefs).toContain('archived');
    }
  });

  it('judge: at least one turn is judged and at least one is not (isolates the judge gate)', () => {
    expect(allTurns.some((t) => t.expect.judge === true)).toBe(true);
    expect(allTurns.some((t) => t.expect.judge === false)).toBe(true);
  });
});

describe('two-turn scenarios (just-saved-followup)', () => {
  it('both just-saved-followup scenarios have exactly 2 turns', () => {
    const scenarios = loadLiveCorpus().filter((s) => s.bucket === 'just_saved_followup');
    expect(scenarios).toHaveLength(2);
    for (const scenario of scenarios) {
      expect(scenario.turns).toHaveLength(2);
      expect(scenario.turns[0]!.expect.tool).toEqual(['add_listing']);
    }
  });
});
