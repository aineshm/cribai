/**
 * AIN-93 hard check — no fabricated listing ids.
 *
 * Scans every `tool_call.args` and `tool_result.machineData` payload this
 * turn for listing-id-shaped fields (`id`, `listingId`, `listingIds[]`) and
 * fails if any referenced id is outside the known set — the seeded 8-row
 * fixture plus any id created earlier in the SAME scenario run (e.g. an
 * `add_listing` turn's new row, referenced by a later follow-up turn).
 */
import type { LiveSseEvent } from '../http-turn';
import type { CheckResult } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidLike(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function collectIds(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, out);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'id' || key === 'listingId') && isUuidLike(v)) {
      out.add(v);
    } else if (key === 'listingIds' && Array.isArray(v)) {
      for (const id of v) if (isUuidLike(id)) out.add(id);
    } else {
      collectIds(v, out);
    }
  }
}

export interface FabricatedIdsInput {
  readonly events: readonly LiveSseEvent[];
  readonly knownIds: ReadonlySet<string>;
}

export function checkNoFabricatedIds(input: FabricatedIdsInput): CheckResult {
  const referenced = new Set<string>();
  for (const event of input.events) {
    if (event.type === 'tool_call') collectIds(event.args, referenced);
    if (event.type === 'tool_result' && event.machineData) collectIds(event.machineData, referenced);
  }

  const fabricated = [...referenced].filter((id) => !input.knownIds.has(id));
  const pass = fabricated.length === 0;

  return {
    name: 'no_fabricated_ids',
    pass,
    detail: pass
      ? `all ${referenced.size} referenced listing id(s) are known`
      : `fabricated listing id(s): ${fabricated.join(', ')}`,
  };
}
