/**
 * AIN-93 live-eval harness — shared hard-check types + event-narrowing helper.
 */
import type { ChatEvent } from '../../../cribai';
import type { LiveSseEvent } from '../http-turn';

/** Uniform pass/fail + human detail, mirroring `DimensionScore` in `../types.ts`. */
export interface CheckResult {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

/**
 * Narrow the wire-level `LiveSseEvent` union (which adds an `error` frame
 * on top of `ChatEvent`) back to `ChatEvent[]` so this module can reuse the
 * in-process eval's pure scorers (`extractToolSequence`, `extractAssistantText`)
 * unmodified. Safe at runtime: those scorers only ever filter on specific
 * `type` discriminants (`tool_call`, `text`), so dropping `error` frames
 * changes nothing they read.
 */
export function toChatEvents(events: readonly LiveSseEvent[]): readonly ChatEvent[] {
  return events.filter((e): e is ChatEvent => e.type !== 'error');
}
