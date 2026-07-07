/**
 * AIN-93 hard check — the `show_card` contract (AIN-88/PR #116 decision:
 * the model, not tool success, decides per turn whether a REAL card should
 * render). A scenario asserts the expected boolean; `undefined` means this
 * turn makes no claim either way (vacuous pass).
 */
import type { CrmMachineData } from '../../../crm';
import type { LiveSseEvent } from '../http-turn';
import { collectMachineData } from './machine-data';
import type { CheckResult } from './types';

export interface ShowCardInput {
  readonly events: readonly LiveSseEvent[];
  readonly expected: boolean | undefined;
}

type ShowCardBearing = CrmMachineData & { show_card: boolean };

function hasShowCard(md: CrmMachineData): md is ShowCardBearing {
  return typeof (md as { show_card?: unknown }).show_card === 'boolean';
}

export function checkShowCard(input: ShowCardInput): CheckResult {
  if (input.expected === undefined) {
    return { name: 'show_card', pass: true, detail: 'no show_card expectation for this turn' };
  }

  const cardBearing = collectMachineData(input.events).filter(hasShowCard);

  if (cardBearing.length === 0) {
    // No CRM tool emitted a show_card-bearing payload this turn — that's
    // only consistent with expecting `false` (no card).
    const pass = input.expected === false;
    return {
      name: 'show_card',
      pass,
      detail: pass
        ? 'no CRM machineData emitted this turn — matches expected show_card=false'
        : 'expected show_card=true but no CRM tool_result carried a show_card flag',
    };
  }

  const mismatched = cardBearing.filter((md) => md.show_card !== input.expected);
  const pass = mismatched.length === 0;
  return {
    name: 'show_card',
    pass,
    detail: pass
      ? `show_card=${input.expected} matched on all ${cardBearing.length} card-bearing result(s)`
      : `expected show_card=${input.expected}, got ${mismatched.map((m) => m.show_card).join(', ')}`,
  };
}
