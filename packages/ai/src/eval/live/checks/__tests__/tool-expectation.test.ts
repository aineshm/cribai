import { describe, expect, it } from 'vitest';
import { checkToolExpectation } from '../tool-expectation';
import type { LiveSseEvent } from '../../http-turn';

describe('checkToolExpectation', () => {
  it('passes an exact ordered match', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'rank_compare', args: {} },
      { type: 'tool_result', name: 'rank_compare', block: { type: 'text', content: 'ok' } as never },
      { type: 'done' },
    ];
    const result = checkToolExpectation({ events, expectedTools: ['rank_compare'] });
    expect(result.pass).toBe(true);
  });

  it('fails when no tool fired but one was expected', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'Sure!' }];
    const result = checkToolExpectation({ events, expectedTools: ['rank_compare'] });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/expected \[rank_compare\], got \[\]/);
  });

  it('fails when a tool fired but none was expected', () => {
    const events: LiveSseEvent[] = [{ type: 'tool_call', name: 'add_listing', args: {} }];
    const result = checkToolExpectation({ events, expectedTools: [] });
    expect(result.pass).toBe(false);
  });

  it('fails on wrong order', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'add_listing', args: {} },
      { type: 'tool_call', name: 'rank_compare', args: {} },
    ];
    const result = checkToolExpectation({
      events,
      expectedTools: ['rank_compare', 'add_listing'],
    });
    expect(result.pass).toBe(false);
  });

  it('passes when no tools fire and none are expected (prose-only turn)', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'A good rent-to-income ratio is 30%.' }];
    expect(checkToolExpectation({ events, expectedTools: [] }).pass).toBe(true);
  });
});
