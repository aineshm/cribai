import { describe, expect, it } from 'vitest';
import {
  scenarioRunPassed,
  buildScenarioReport,
  aggregateLiveReport,
  formatLiveReport,
  type TurnRunResult,
  type ScenarioRunResult,
  type ScenarioReport,
} from '../report';
import type { LatencyCheckResult } from '../checks/latency';
import type { CheckResult } from '../checks/types';

function passCheck(name: string): CheckResult {
  return { name, pass: true, detail: `${name} ok` };
}
function failCheck(name: string): CheckResult {
  return { name, pass: false, detail: `${name} FAILED` };
}

const OK_LATENCY: LatencyCheckResult = {
  name: 'latency',
  pass: true,
  detail: 'ok',
  totalP95Ms: 1000,
  ttftP95Ms: 500,
  throttled: false,
};
const BAD_LATENCY: LatencyCheckResult = { ...OK_LATENCY, pass: false };

function passingTurn(query = 'q'): TurnRunResult {
  return {
    query,
    httpStatus: 200,
    requestId: 'r1',
    hardChecks: {
      noErrors: passCheck('no_errors'),
      toolExpectation: passCheck('tool_expectation'),
      noFabricatedIds: passCheck('no_fabricated_ids'),
      grounding: passCheck('grounding'),
      showCard: passCheck('show_card'),
      transcriptContent: passCheck('transcript_content'),
    },
    hardChecksPassed: true,
    throttled: false,
    transcriptExcerpt: 'assistant: ok',
  };
}

function failingTurn(): TurnRunResult {
  return {
    ...passingTurn(),
    hardChecks: {
      noErrors: failCheck('no_errors'),
      toolExpectation: passCheck('tool_expectation'),
      noFabricatedIds: passCheck('no_fabricated_ids'),
      grounding: passCheck('grounding'),
      showCard: passCheck('show_card'),
      transcriptContent: passCheck('transcript_content'),
    },
    hardChecksPassed: false,
  };
}

function runResult(overrides: Partial<ScenarioRunResult> = {}): ScenarioRunResult {
  const turns = overrides.turns ?? [passingTurn()];
  const latency = overrides.latency ?? OK_LATENCY;
  const judgeVerdict = overrides.judgeVerdict ?? 'not_judged';
  const passed = overrides.passed ?? scenarioRunPassed(turns, latency, judgeVerdict);
  return {
    runIndex: overrides.runIndex ?? 0,
    turns,
    latency,
    judgeVerdict,
    judgeReasoning: overrides.judgeReasoning ?? null,
    passed,
  };
}

describe('scenarioRunPassed', () => {
  it('passes when all turns, latency, and judge (not_judged) are fine', () => {
    expect(scenarioRunPassed([passingTurn()], OK_LATENCY, 'not_judged')).toBe(true);
  });

  it('fails when any turn fails hard checks', () => {
    expect(scenarioRunPassed([passingTurn(), failingTurn()], OK_LATENCY, 'not_judged')).toBe(false);
  });

  it('fails when latency fails even if turns pass', () => {
    expect(scenarioRunPassed([passingTurn()], BAD_LATENCY, 'not_judged')).toBe(false);
  });

  it('fails when the judge verdict is fail', () => {
    expect(scenarioRunPassed([passingTurn()], OK_LATENCY, 'fail')).toBe(false);
  });

  it('passes when the judge verdict is pass', () => {
    expect(scenarioRunPassed([passingTurn()], OK_LATENCY, 'pass')).toBe(true);
  });
});

describe('buildScenarioReport / aggregateLiveReport pass-bar math', () => {
  it('a scenario with 2/3 passing runs meets the >=2/3 run threshold', () => {
    const runs = [runResult({ runIndex: 0 }), runResult({ runIndex: 1 }), runResult({ runIndex: 2, turns: [failingTurn()], passed: false })];
    const report = buildScenarioReport('s1', 'pick_for_me', runs);
    expect(report.passCount).toBe(2);
    expect(report.scenarioPassed).toBe(true);
  });

  it('a scenario with only 1/3 passing runs fails the threshold', () => {
    const runs = [
      runResult({ runIndex: 0 }),
      runResult({ runIndex: 1, turns: [failingTurn()], passed: false }),
      runResult({ runIndex: 2, turns: [failingTurn()], passed: false }),
    ];
    const report = buildScenarioReport('s1', 'pick_for_me', runs);
    expect(report.scenarioPassed).toBe(false);
  });

  it('overall pass bar: >=90% of scenarios must pass', () => {
    // 9 passing scenarios, 1 failing -> 90% exactly -> meets bar
    const passingScenario: ScenarioReport = {
      scenarioId: 'ok',
      bucket: 'b',
      runs: [],
      passCount: 3,
      scenarioPassed: true,
    };
    const failingScenario: ScenarioReport = {
      scenarioId: 'bad',
      bucket: 'b',
      runs: [],
      passCount: 0,
      scenarioPassed: false,
    };
    const scenarios = [...Array(9).fill(passingScenario), failingScenario];
    const report = aggregateLiveReport(scenarios, 1.23, false);
    expect(report.scenarioPassPct).toBeCloseTo(0.9);
    expect(report.passBarMet).toBe(true);
  });

  it('overall pass bar fails below 90%', () => {
    const passingScenario: ScenarioReport = { scenarioId: 'ok', bucket: 'b', runs: [], passCount: 3, scenarioPassed: true };
    const failingScenario: ScenarioReport = { scenarioId: 'bad', bucket: 'b', runs: [], passCount: 0, scenarioPassed: false };
    const scenarios = [...Array(8).fill(passingScenario), failingScenario, failingScenario];
    const report = aggregateLiveReport(scenarios, 0, false);
    expect(report.passBarMet).toBe(false);
  });

  it('carries the aborted flag through', () => {
    const report = aggregateLiveReport([], 0, true);
    expect(report.aborted).toBe(true);
  });
});

describe('formatLiveReport', () => {
  it('renders the pass-bar verdict and per-scenario matrix', () => {
    const scenario = buildScenarioReport('pick-for-me-01', 'pick_for_me', [runResult()]);
    const report = aggregateLiveReport([scenario], 0.05, false);
    const text = formatLiveReport(report);
    expect(text).toContain('pick-for-me-01');
    expect(text).toContain('pick_for_me');
    expect(text).toMatch(/PASS/);
  });

  it('includes the FULL transcript for every failing run', () => {
    const failingRun = runResult({ runIndex: 0, turns: [failingTurn()], passed: false });
    const scenario = buildScenarioReport('unknown-listing-01', 'unknown_listing', [
      failingRun,
      runResult({ runIndex: 1 }),
      runResult({ runIndex: 2 }),
    ]);
    const report = aggregateLiveReport([scenario], 0, false);
    const text = formatLiveReport(report);
    expect(text).toContain('## Failure transcripts');
    expect(text).toContain('unknown-listing-01 — run 1');
    expect(text).toContain('noErrors: FAIL');
    expect(text).toContain('assistant: ok');
  });

  it('flags an aborted run distinctly', () => {
    const text = formatLiveReport(aggregateLiveReport([], 5.0, true));
    expect(text).toMatch(/RUN ABORTED/);
  });

  it('labels a throttled failing run distinctly from a plain FAIL in the matrix', () => {
    const throttledTurn: TurnRunResult = { ...failingTurn(), throttled: true };
    const scenario = buildScenarioReport('s1', 'b', [
      runResult({ runIndex: 0, turns: [throttledTurn], passed: false }),
      runResult({ runIndex: 1 }),
      runResult({ runIndex: 2 }),
    ]);
    const text = formatLiveReport(aggregateLiveReport([scenario], 0, false));
    expect(text).toContain('THROTTLED');
  });
});
