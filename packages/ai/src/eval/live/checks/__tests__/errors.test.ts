import { describe, expect, it } from 'vitest';
import { checkNoErrors } from '../errors';
import type { LiveSseEvent } from '../../http-turn';

describe('checkNoErrors', () => {
  it('passes a clean turn', () => {
    const events: LiveSseEvent[] = [
      { type: 'text', content: 'Here is what I found.' },
      { type: 'done' },
    ];
    expect(checkNoErrors({ events, httpStatus: 200 }).pass).toBe(true);
  });

  it('fails on a non-200 HTTP status', () => {
    const result = checkNoErrors({ events: [], httpStatus: 503 });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/503/);
  });

  it('fails on an SSE error frame', () => {
    const events: LiveSseEvent[] = [{ type: 'error', message: 'quota exceeded' }];
    const result = checkNoErrors({ events, httpStatus: 200 });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/quota exceeded/);
  });

  it.each([
    'Sorry, something went wrong on our end.',
    'The AI is temporarily unavailable — please try again shortly.',
    'Please try again later.',
  ])('fails when assistant text matches the error-bubble marker: %s', (content) => {
    const events: LiveSseEvent[] = [{ type: 'text', content }];
    const result = checkNoErrors({ events, httpStatus: 200 });
    expect(result.pass).toBe(false);
  });

  it('does not false-positive on unrelated text containing similar words', () => {
    const events: LiveSseEvent[] = [
      { type: 'text', content: 'This place has great natural light and a nice try at a garden.' },
    ];
    expect(checkNoErrors({ events, httpStatus: 200 }).pass).toBe(true);
  });
});
