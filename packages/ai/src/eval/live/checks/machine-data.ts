/**
 * AIN-93 — shared `machineData` extraction for the grounding + show_card
 * checks. A `tool_result` event carries a CRM `machineData` payload
 * (`kind: 'add_listing' | 'first_save_analysis' | 'rank_compare' | 'infer_profile'`)
 * only on the CRM tools' success path (AIN-65) — absence means the legacy
 * text-block fallback (sign-in gate, error, non-CRM tool).
 */
import type { CrmMachineData } from '../../../crm';
import type { LiveSseEvent } from '../http-turn';

function isCrmMachineData(value: unknown): value is CrmMachineData {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === 'string'
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
