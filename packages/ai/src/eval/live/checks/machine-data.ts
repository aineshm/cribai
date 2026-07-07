/**
 * AIN-93 — shared `machineData` extraction for the grounding + show_card
 * checks. A `tool_result` event carries a CRM `machineData` payload
 * (`kind: 'add_listing' | 'first_save_analysis' | 'rank_compare' | 'infer_profile'`)
 * only on the CRM tools' success path (AIN-65) — absence means the legacy
 * text-block fallback (sign-in gate, error, non-CRM tool).
 */
import type { CrmMachineData } from '../../../crm';
import type { LiveSseEvent } from '../http-turn';

/**
 * The only `kind` literals `CrmMachineData` can carry (CodeRabbit PR #123
 * fix 2). Narrowing to this set — rather than "any object with a string
 * `kind`" — stops an unrelated tool's `machineData`-shaped payload (or a
 * future non-CRM `kind` string) from being misread as CRM data downstream.
 */
const CRM_MACHINE_DATA_KINDS = [
  'add_listing',
  'first_save_analysis',
  'rank_compare',
  'infer_profile',
] as const;

function isCrmMachineData(value: unknown): value is CrmMachineData {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    typeof kind === 'string' &&
    (CRM_MACHINE_DATA_KINDS as readonly string[]).includes(kind)
  );
}

/** Every recognizable CRM `machineData` payload emitted this turn, in event order. */
export function collectMachineData(events: readonly LiveSseEvent[]): CrmMachineData[] {
  const out: CrmMachineData[] = [];
  for (const event of events) {
    if (event.type === 'tool_result' && isCrmMachineData(event.machineData)) {
      out.push(event.machineData);
    }
  }
  return out;
}
