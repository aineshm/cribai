import { describe, expect, it } from 'vitest';
import { checkToolExpectation } from '../tool-expectation';
import type { LiveSseEvent } from '../../http-turn';

describe('checkToolExpectation — containment semantics (live-run findings, AIN-93 adjudication)', () => {
  it('passes a subsequence match with extra tools before/after (extras always allowed)', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'geocode_address', args: {} },
      { type: 'tool_call', name: 'rank_compare', args: {} },
      { type: 'tool_call', name: 'search_listings', args: {} },
      { type: 'done' },
    ];
    const result = checkToolExpectation({ events, expectedTools: ['rank_compare'] });
    expect(result.pass).toBe(true);
  });

  it('passes a multi-tool required sequence even with extras interleaved', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'add_listing', args: {} },
      { type: 'tool_call', name: 'geocode_address', args: {} },
      { type: 'tool_call', name: 'rank_compare', args: {} },
    ];
    const result = checkToolExpectation({
      events,
      expectedTools: ['add_listing', 'rank_compare'],
    });
    expect(result.pass).toBe(true);
  });

  it('fails when a required tool never appears', () => {
    const events: LiveSseEvent[] = [{ type: 'tool_call', name: 'add_listing', args: {} }];
    const result = checkToolExpectation({ events, expectedTools: ['rank_compare'] });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/rank_compare/);
  });

  it('fails on wrong relative order of required tools even with no extras', () => {
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

  it('a forbidden tool present fails the check even if no tools are required', () => {
    const events: LiveSseEvent[] = [{ type: 'tool_call', name: 'add_listing', args: {} }];
    const result = checkToolExpectation({
      events,
      expectedTools: [],
      forbiddenTools: ['add_listing'],
    });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/forbidden/i);
    expect(result.detail).toMatch(/add_listing/);
  });

  it('a forbidden tool present fails even when the required subsequence is otherwise satisfied', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_call', name: 'rank_compare', args: {} },
      { type: 'tool_call', name: 'add_listing', args: {} },
    ];
    const result = checkToolExpectation({
      events,
      expectedTools: ['rank_compare'],
      forbiddenTools: ['add_listing'],
    });
    expect(result.pass).toBe(false);
  });

  it('passes vacuously (extras always allowed) when a tool fires but none is required and none is forbidden', () => {
    const events: LiveSseEvent[] = [{ type: 'tool_call', name: 'add_listing', args: {} }];
    const result = checkToolExpectation({ events, expectedTools: [] });
    expect(result.pass).toBe(true);
  });

  it('passes when no tools fire and none are expected (prose-only turn)', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'A good rent-to-income ratio is 30%.' }];
    expect(checkToolExpectation({ events, expectedTools: [] }).pass).toBe(true);
  });

  it('empty required list with no forbidden list is a vacuous pass with an EXPLICIT "no tool constraint" detail', () => {
    const events: LiveSseEvent[] = [{ type: 'tool_call', name: 'add_listing', args: {} }];
    const result = checkToolExpectation({ events, expectedTools: [] });
    expect(result.pass).toBe(true);
    expect(result.detail).toBe('no tool constraint');
  });
});
