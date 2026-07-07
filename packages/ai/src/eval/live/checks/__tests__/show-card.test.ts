import { describe, expect, it } from 'vitest';
import { checkShowCard } from '../show-card';
import type { LiveSseEvent } from '../../http-turn';

function toolResultWithShowCard(show_card: boolean): LiveSseEvent {
  return {
    type: 'tool_result',
    name: 'rank_compare',
    block: { type: 'text', content: 'ok' } as never,
    machineData: { kind: 'rank_compare', result: { mode: 'rank', ranked: [] }, show_card } as never,
  };
}

describe('checkShowCard', () => {
  it('passes vacuously when the scenario makes no show_card claim', () => {
    expect(checkShowCard({ events: [], expected: undefined }).pass).toBe(true);
  });

  it('passes when show_card matches the expectation (true)', () => {
    const events = [toolResultWithShowCard(true)];
    expect(checkShowCard({ events, expected: true }).pass).toBe(true);
  });

  it('fails when show_card is true but false was expected', () => {
    const events = [toolResultWithShowCard(true)];
    expect(checkShowCard({ events, expected: false }).pass).toBe(false);
  });

  it('passes a plain-info turn (no CRM tool fired) when false was expected', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'A good ratio is 30%.' }];
    expect(checkShowCard({ events, expected: false }).pass).toBe(true);
  });

  it('fails a plain-info turn when true was expected but nothing emitted show_card', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'A good ratio is 30%.' }];
    expect(checkShowCard({ events, expected: true }).pass).toBe(false);
  });
});
