import { describe, expect, it } from 'vitest';
import { liveScenarioSchema } from '../schema';

describe('liveScenarioSchema', () => {
  it('accepts a minimal valid scenario, defaulting tool/grounding/judge', () => {
    const parsed = liveScenarioSchema.parse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [{ query: 'hi', expect: {} }],
    });
    expect(parsed.turns[0]!.expect).toEqual({ tool: [], grounding: 'none', judge: false });
    expect(parsed.seedRefs).toEqual([]);
  });

  it('rejects an unknown bucket', () => {
    const result = liveScenarioSchema.safeParse({
      id: 's1',
      bucket: 'not_a_real_bucket',
      description: 'test',
      turns: [{ query: 'hi', expect: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown seedRefs key', () => {
    const result = liveScenarioSchema.safeParse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      seedRefs: ['not_a_real_key'],
      turns: [{ query: 'hi', expect: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero turns', () => {
    const result = liveScenarioSchema.safeParse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown grounding mode', () => {
    const result = liveScenarioSchema.safeParse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [{ query: 'hi', expect: { grounding: 'bogus' } }],
    });
    expect(result.success).toBe(false);
  });
});
