/**
 * AIN-93 — `collectMachineData` / `isCrmMachineData` narrowing (CodeRabbit
 * PR #123 fix 2). Only the 4 real `CrmMachineData` kind literals should be
 * recognized — an object with a string `kind` outside that set must be
 * dropped, not passed through as if it were CRM data.
 */
import { describe, expect, it } from 'vitest';
import { collectMachineData } from '../machine-data';
import type { LiveSseEvent } from '../../http-turn';

function toolResultEvent(machineData: unknown): LiveSseEvent {
  return {
    type: 'tool_result',
    name: 'whatever',
    block: { type: 'text', content: 'ok' } as never,
    machineData: machineData as never,
  };
}

describe('collectMachineData', () => {
  it.each(['add_listing', 'first_save_analysis', 'rank_compare', 'infer_profile'])(
    'collects a tool_result whose machineData.kind is the real CRM literal %s',
    (kind) => {
      const events = [toolResultEvent({ kind })];
      const collected = collectMachineData(events);
      expect(collected).toHaveLength(1);
      expect(collected[0]).toMatchObject({ kind });
    },
  );

  it('drops a tool_result whose machineData.kind is a string but NOT a real CRM kind', () => {
    const events = [toolResultEvent({ kind: 'geocode_address' })];
    expect(collectMachineData(events)).toHaveLength(0);
  });

  it('drops a tool_result with no machineData at all', () => {
    const events: LiveSseEvent[] = [
      { type: 'tool_result', name: 'search_listings', block: { type: 'text', content: 'ok' } as never },
    ];
    expect(collectMachineData(events)).toHaveLength(0);
  });

  it('ignores non-tool_result events entirely', () => {
    const events: LiveSseEvent[] = [{ type: 'text', content: 'hi' }, { type: 'done' }];
    expect(collectMachineData(events)).toHaveLength(0);
  });
});
