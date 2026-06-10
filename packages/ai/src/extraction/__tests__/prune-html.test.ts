/**
 * Unit tests for `pruneHtml` (AIN-47, Layer 4).
 *
 * `pruneHtml` is the pre-processing step that shrinks a raw HTML page down to
 * a token-budget-friendly text blob before it is handed to the LLM-clean rare
 * path. It strips heavyweight non-content blocks (`<script>`, `<style>`,
 * `<svg>`), drops HTML comments, collapses whitespace, and caps the result at
 * a byte budget. It is pure and must never throw — garbage in, '' or a
 * truncated string out.
 */

import { describe, it, expect } from 'vitest';

import { pruneHtml } from '../prune-html';

describe('pruneHtml', () => {
  it('strips <script> blocks including their inner content', () => {
    const html = '<p>keep</p><script>var x = 1; document.write("nope");</script><p>also</p>';
    const out = pruneHtml(html);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain('document.write');
    expect(out).not.toContain('var x = 1');
    expect(out).toContain('keep');
    expect(out).toContain('also');
  });

  it('strips <style> blocks including their inner content', () => {
    const html = '<p>keep</p><style>.a{color:red}</style>';
    const out = pruneHtml(html);
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toContain('color:red');
    expect(out).toContain('keep');
  });

  it('strips <svg> blocks including their inner content', () => {
    const html = '<p>keep</p><svg viewBox="0 0 1 1"><path d="M0 0z"/></svg>';
    const out = pruneHtml(html);
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toContain('viewBox');
    expect(out).not.toContain('M0 0z');
    expect(out).toContain('keep');
  });

  it('strips blocks case-insensitively and across newlines', () => {
    const html = '<P>keep</P>\n<SCRIPT type="text/javascript">\n  alert(1);\n</SCRIPT>\n';
    const out = pruneHtml(html);
    expect(out).not.toMatch(/script/i);
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('keep');
  });

  it('strips HTML comments', () => {
    const html = '<p>keep</p><!-- secret comment with <script> inside --><p>also</p>';
    const out = pruneHtml(html);
    expect(out).not.toContain('secret comment');
    expect(out).not.toContain('<!--');
    expect(out).toContain('keep');
    expect(out).toContain('also');
  });

  it('strips multiline HTML comments', () => {
    const html = '<p>keep</p><!--\n multi\n line\n comment\n-->end';
    const out = pruneHtml(html);
    expect(out).not.toContain('multi');
    expect(out).not.toContain('<!--');
    expect(out).toContain('keep');
    expect(out).toContain('end');
  });

  it('collapses runs of whitespace to a single space', () => {
    const html = '<p>a</p>   \n\n\t  <p>b</p>';
    const out = pruneHtml(html);
    expect(out).not.toMatch(/ {2,}/);
    expect(out).not.toMatch(/[\n\t]/);
    expect(out).toContain('<p>a</p> <p>b</p>');
  });

  it('caps output at maxBytes (UTF-8 bytes, not code units)', () => {
    // 200KB of multibyte chars (each '€' is 3 bytes in UTF-8).
    const big = '€'.repeat(200_000);
    const out = pruneHtml(big);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(50_000);
  });

  it('respects a custom maxBytes argument', () => {
    const big = 'a'.repeat(200_000);
    const out = pruneHtml(big, 100);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(100);
  });

  it('never splits a multibyte character mid-sequence when truncating', () => {
    // A cap that lands in the middle of a 3-byte glyph must drop the whole
    // glyph, not produce an invalid UTF-8 sequence. Re-encoding round-trips
    // cleanly only when no partial code unit survived.
    const big = '€'.repeat(50);
    const out = pruneHtml(big, 10); // 10 bytes => 3 full glyphs (9 bytes)
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(10);
    // Round-trip: decoding the encoded bytes must equal the string itself —
    // i.e. no replacement char (U+FFFD) introduced by a split.
    expect(out).not.toContain('�');
    expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out);
  });

  it('never splits a surrogate-pair (astral) character mid-pair when truncating', () => {
    // '😀' (U+1F600) is an astral char: two UTF-16 code units, 4 UTF-8 bytes.
    // A byte cap that lands between the two code units would, with naive
    // code-UNIT truncation, leave a LONE HIGH SURROGATE — a partial code point
    // that re-encodes to U+FFFD. Cap by code POINTS instead, so a 4-byte glyph
    // is kept or dropped whole. Test several caps that land mid-glyph (4-byte
    // boundaries fall on multiples of 4: 3, 7, 10 all bisect a pair).
    const big = '😀'.repeat(50);
    for (const cap of [3, 7, 10]) {
      const out = pruneHtml(big, cap);
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(cap);
      // Clean UTF-8 round-trip <=> no lone surrogate / partial sequence survived.
      expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out);
      expect(out).not.toContain('�');
    }
  });

  it('returns an empty string for empty input', () => {
    expect(pruneHtml('')).toBe('');
  });

  it('does not throw on malformed / non-HTML input', () => {
    expect(() => pruneHtml('<<<>>> not really html <script unterminated')).not.toThrow();
    expect(() => pruneHtml('plain text with no tags at all')).not.toThrow();
  });

  it('is pure — does not mutate its input', () => {
    const input = '<p>x</p>  <script>y</script>';
    const copy = input;
    pruneHtml(input);
    expect(input).toBe(copy);
  });
});
