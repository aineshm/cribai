import { describe, expect, it } from 'vitest';
import { runTurnHardChecks, turnPassedHardChecks } from '../index';
import type { LiveSseEvent } from '../../http-turn';
import { SEED_LISTINGS } from '../../seed-truth';

const TRUTH_MAP = new Map([['db-id-1', SEED_LISTINGS.studio]]);

describe('runTurnHardChecks / turnPassedHardChecks', () => {
  it('reports all-pass for a clean, fully-matching turn', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'rank_compare', args: {} },
      {
        type: 'tool_result',
        name: 'rank_compare',
        block: { type: 'text', content: 'ok' } as never,
        machineData: {
          kind: 'rank_compare',
          result: { mode: 'rank', ranked: [{ listingId: 'db-id-1', title: 't', score: 90, breakdown: {} }] },
          show_card: true,
        } as never,
      },
      { type: 'text', content: 'Here is my pick.' },
      { type: 'done' },
    ];

    const results = runTurnHardChecks({
      events,
      httpStatus: 200,
      expectedTools: ['rank_compare'],
      knownIds: new Set(['db-id-1']),
      groundingMode: 'ranked_ids',
      truthByListingId: TRUTH_MAP,
      expectedShowCard: true,
    });

    expect(turnPassedHardChecks(results)).toBe(true);
    for (const r of Object.values(results)) expect(r.pass).toBe(true);
  });

  it('fails overall when just ONE dimension fails (isolation)', () => {
    const events: LiveSseEvent[] = [{ type: 'error', message: 'boom' }];
    const results = runTurnHardChecks({
      events,
      httpStatus: 200,
      expectedTools: [],
      knownIds: new Set(),
      groundingMode: 'none',
      truthByListingId: new Map(),
      expectedShowCard: undefined,
    });
    expect(results.noErrors.pass).toBe(false);
    expect(turnPassedHardChecks(results)).toBe(false);
  });

  it('vacuously passes transcriptContent when expectTranscript is absent (isolation)', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'anything' }, { type: 'done' }];
    const results = runTurnHardChecks({
      events,
      httpStatus: 200,
      expectedTools: [],
      knownIds: new Set(),
      groundingMode: 'none',
      truthByListingId: new Map(),
      expectedShowCard: undefined,
    });
    expect(results.transcriptContent.pass).toBe(true);
    expect(results.transcriptContent.detail).toBe('no transcript expectation');
  });

  it('fails overall on a transcriptContent miss alone, with every other dimension passing (isolation, AIN-99/AIN-101)', () => {
    const events: LiveSseEvent[] = [
      { type: 'text', content: 'There is one floor plan, priced at $1,050.' },
      { type: 'done' },
    ];
    const results = runTurnHardChecks({
      events,
      httpStatus: 200,
      expectedTools: [],
      knownIds: new Set(),
      groundingMode: 'none',
      truthByListingId: new Map(),
      expectedShowCard: undefined,
      expectTranscript: { mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] } },
    });
    expect(results.transcriptContent.pass).toBe(false);
    expect(results.noErrors.pass).toBe(true);
    expect(turnPassedHardChecks(results)).toBe(false);
  });
});
