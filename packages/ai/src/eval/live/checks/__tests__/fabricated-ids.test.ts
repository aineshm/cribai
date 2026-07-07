import { describe, expect, it } from 'vitest';
import { checkNoFabricatedIds } from '../fabricated-ids';
import type { LiveSseEvent } from '../../http-turn';

const KNOWN_1 = '11111111-1111-4111-8111-111111111111';
const KNOWN_2 = '22222222-2222-4222-8222-222222222222';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

describe('checkNoFabricatedIds', () => {
  it('passes when every referenced id is known', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'rank_compare', args: { listingIds: [KNOWN_1, KNOWN_2] } },
      {
        type: 'tool_result',
        name: 'rank_compare',
        block: { type: 'text', content: 'ok' } as never,
        machineData: {
          kind: 'rank_compare',
          result: { mode: 'rank', ranked: [{ listingId: KNOWN_1, title: 't', score: 90, breakdown: {} }] },
        },
      },
    ];
    const result = checkNoFabricatedIds({ events, knownIds: new Set([KNOWN_1, KNOWN_2]) });
    expect(result.pass).toBe(true);
  });

  it('fails when a tool_call arg references an unknown id', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'rank_compare', args: { listingIds: [KNOWN_1, UNKNOWN] } },
    ];
    const result = checkNoFabricatedIds({ events, knownIds: new Set([KNOWN_1]) });
    expect(result.pass).toBe(false);
    expect(result.detail).toContain(UNKNOWN);
  });

  it('fails when machineData references an unknown id', () => {
    const events: LiveSseEvent[] = [
      {
        type: 'tool_result',
        name: 'rank_compare',
        block: { type: 'text', content: 'ok' } as never,
        machineData: {
          kind: 'add_listing',
          result: { alreadySaved: false },
          listing: { id: UNKNOWN } as never,
          show_card: true,
        } as never,
      },
    ];
    const result = checkNoFabricatedIds({ events, knownIds: new Set([KNOWN_1]) });
    expect(result.pass).toBe(false);
    expect(result.detail).toContain(UNKNOWN);
  });

  it('ignores non-UUID-shaped id-like fields (no false positive)', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'schedule_tour', args: { id: 'not-a-uuid' } },
    ];
    const result = checkNoFabricatedIds({ events, knownIds: new Set() });
    expect(result.pass).toBe(true);
  });

  it('passes vacuously when no ids are referenced at all', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'A good ratio is 30%.' }];
    expect(checkNoFabricatedIds({ events, knownIds: new Set() }).pass).toBe(true);
  });
});
