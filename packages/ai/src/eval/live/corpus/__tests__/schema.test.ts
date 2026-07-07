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

  it('accepts an omitted expectTranscript (undefined, not defaulted to an empty constraint)', () => {
    const parsed = liveScenarioSchema.parse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [{ query: 'hi', expect: {} }],
    });
    expect(parsed.turns[0]!.expect.expectTranscript).toBeUndefined();
  });

  it('accepts expectTranscript with mustMentionAll', () => {
    const parsed = liveScenarioSchema.parse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [{ query: 'hi', expect: { expectTranscript: { mustMentionAll: ['deposit'] } } }],
    });
    expect(parsed.turns[0]!.expect.expectTranscript).toEqual({ mustMentionAll: ['deposit'] });
  });

  it('accepts expectTranscript with mustMentionAtLeast', () => {
    const parsed = liveScenarioSchema.parse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [
        {
          query: 'hi',
          expect: { expectTranscript: { mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] } } },
        },
      ],
    });
    expect(parsed.turns[0]!.expect.expectTranscript).toEqual({
      mustMentionAtLeast: { count: 2, of: ['1,300', '1,800', '2,400'] },
    });
  });

  it('accepts expectTranscript with both constraints set independently', () => {
    const parsed = liveScenarioSchema.parse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [
        {
          query: 'hi',
          expect: {
            expectTranscript: {
              mustMentionAll: ['deposit'],
              mustMentionAtLeast: { count: 1, of: ['1,800', '1800'] },
            },
          },
        },
      ],
    });
    expect(parsed.turns[0]!.expect.expectTranscript).toEqual({
      mustMentionAll: ['deposit'],
      mustMentionAtLeast: { count: 1, of: ['1,800', '1800'] },
    });
  });

  it('rejects an empty mustMentionAll array', () => {
    const result = liveScenarioSchema.safeParse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [{ query: 'hi', expect: { expectTranscript: { mustMentionAll: [] } } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty mustMentionAtLeast.of array', () => {
    const result = liveScenarioSchema.safeParse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [{ query: 'hi', expect: { expectTranscript: { mustMentionAtLeast: { count: 1, of: [] } } } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive mustMentionAtLeast.count', () => {
    const result = liveScenarioSchema.safeParse({
      id: 's1',
      bucket: 'plain_info_ask',
      description: 'test',
      turns: [
        { query: 'hi', expect: { expectTranscript: { mustMentionAtLeast: { count: 0, of: ['x'] } } } },
      ],
    });
    expect(result.success).toBe(false);
  });
});
