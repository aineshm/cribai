/**
 * PDR-004 Track A Days 5-6 (AIN-9) — eval corpus invariants.
 *
 * Asserts the synthetic corpus is well-formed: 30 seeds, 5 per bucket, all
 * schema-valid, unique ids, and the tour-confirm bucket carries BOTH HITL
 * phases (positive confirm + negative non-confirm) so the integrity gate is
 * actually exercised in both directions.
 */

import { describe, expect, it } from 'vitest';
import { loadCorpus, corpusByBucket } from '../corpus';
import { EVAL_BUCKETS, evalSeedSchema } from '../types';

describe('eval corpus — shape + invariants', () => {
  const corpus = loadCorpus();

  it('has exactly 30 seeds', () => {
    expect(corpus).toHaveLength(30);
  });

  it('has 5 seeds per bucket across all 6 buckets', () => {
    const grouped = corpusByBucket();
    for (const bucket of EVAL_BUCKETS) {
      expect(grouped[bucket], `bucket ${bucket}`).toHaveLength(5);
    }
  });

  it('every seed is schema-valid', () => {
    for (const seed of corpus) {
      expect(evalSeedSchema.safeParse(seed).success, `seed ${seed.id}`).toBe(true);
    }
  });

  it('all seed ids are unique', () => {
    const ids = corpus.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every seed is synthetic and has at least one turn', () => {
    for (const seed of corpus) {
      expect(seed.source).toBe('synthetic');
      expect(seed.turns.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('tour-confirm bucket has BOTH phases: 3 confirm + 2 non-confirm', () => {
    const tourConfirm = corpusByBucket()['tour-confirm'];
    const confirmPhase = tourConfirm.filter((s) => s.expected.hitlPhase === 'confirm');
    const nonConfirm = tourConfirm.filter((s) => s.expected.hitlPhase !== 'confirm');
    expect(confirmPhase.length).toBe(3);
    expect(nonConfirm.length).toBe(2);
  });

  it('tour-prep seeds are preview-phase (never confirm)', () => {
    for (const seed of corpusByBucket()['tour-prep']) {
      expect(seed.expected.hitlPhase).toBe('preview');
    }
  });

  it('confirm-phase seeds expect a schedule_tour or create_sublease call', () => {
    const confirms = loadCorpus().filter((s) => s.expected.hitlPhase === 'confirm');
    for (const seed of confirms) {
      const hasHitlTool = seed.expected.toolSequence.some(
        (t) => t === 'schedule_tour' || t === 'create_sublease',
      );
      expect(hasHitlTool, `seed ${seed.id}`).toBe(true);
    }
  });

  it('non-confirm seeds never expect a confirmed HITL dispatch as the only path', () => {
    // The negative tour-confirm seeds must NOT expect schedule_tour in a
    // non-confirm phase (that would itself be the leak we are guarding against).
    const negatives = corpusByBucket()['tour-confirm'].filter(
      (s) => s.expected.hitlPhase !== 'confirm',
    );
    for (const seed of negatives) {
      expect(seed.expected.toolSequence).not.toContain('schedule_tour');
    }
  });
});
