/**
 * HTML pruning for the LLM-clean rare path (AIN-47, Layer 4).
 *
 * Before pruned page text is handed to Gemini, it has to be shrunk: a raw
 * listing page is mostly markup the model doesn't need (inline scripts, CSS,
 * SVG icon sprites, tracking comments) and routinely exceeds a sensible token
 * budget. `pruneHtml`:
 *   1. Removes `<script>`, `<style>`, and `<svg>` blocks (content included).
 *   2. Removes HTML comments.
 *   3. Collapses runs of whitespace to a single space.
 *   4. Caps the result at a UTF-8 BYTE budget (not code units) so a page full
 *      of multibyte glyphs can't blow past the token budget.
 *
 * This module deliberately uses regex/string ops only — the extraction package
 * intentionally has NO HTML-parser dependency (no cheerio). It is pure and
 * never throws; garbage in yields '' or a truncated string.
 */

/**
 * Default byte budget for pruned output. ~50KB of cleaned text is a generous
 * envelope for a single listing while staying well inside the model's context
 * window once tokenized. Callers can override per-call.
 */
const DEFAULT_MAX_BYTES = 50_000;

/**
 * Heavyweight, non-content tags to strip wholesale (open tag, inner content,
 * close tag). Stripping is done by `stripTagBlocks` below — a linear
 * `indexOf` scanner, NOT a `<tag\b[^>]*>[\s\S]*?<\/tag\s*>` regex. The lazy
 * regex shape rescans O(n) from every open-tag position when the closing tag
 * never appears (regex-DoS hardening, review fix, security HIGH: 512KB of
 * repeated `<script >` with no closers took ~6.6s; unterminated `<script `
 * walls ~12s at 256KB).
 */
const BLOCK_STRIP_TAGS: readonly string[] = ['script', 'style', 'svg'];

/** Any run of whitespace (spaces, tabs, newlines) collapses to one space. */
const WHITESPACE_RUN_PATTERN = /\s+/g;

/** `\w` equivalent for the `<tag\b` word-boundary check, on a lowercased char. */
function isWordCharCode(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z (input is lowercased)
    (code >= 48 && code <= 57) || // 0-9
    code === 95 // _
  );
}

/**
 * Strip every `<tag …> … </tag>` block (open tag, content, close tag) from
 * `html`, replacing each block with a single space — the same semantics as
 * the previous `/<tag\b[^>]*>[\s\S]*?<\/tag\s*>/gi` regex:
 *
 *   - the open tag is `<tag` + word boundary + anything up to the first `>`;
 *   - the close tag is `</tag` + optional whitespace + `>`;
 *   - the block ends at the FIRST valid close tag (lazy);
 *   - unterminated opens / unclosed blocks are left in place.
 *
 * Linear: every `indexOf` scan resumes past the previous one, so hostile
 * walls of open tags are walked once instead of O(n²).
 */
function stripTagBlocks(html: string, tag: string): string {
  const lower = html.toLowerCase();
  const open = '<' + tag;
  const close = '</' + tag;
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf(open, cursor);
    if (start === -1) break;
    const boundary = start + open.length;
    if (isWordCharCode(lower.charCodeAt(boundary))) {
      // `<scriptx…` — not this tag (`\b` fails). Keep the text, move on.
      out += html.slice(cursor, boundary);
      cursor = boundary;
      continue;
    }
    const gt = lower.indexOf('>', boundary);
    // Unterminated open tag: no later open can terminate either — keep rest.
    if (gt === -1) break;
    // Find the first `</tag` followed by optional whitespace then `>`.
    let end = -1;
    let searchFrom = gt + 1;
    while (end === -1) {
      const c = lower.indexOf(close, searchFrom);
      if (c === -1) break;
      let p = c + close.length;
      while (p < lower.length && /\s/.test(lower[p]!)) p += 1;
      if (lower[p] === '>') end = p + 1;
      else searchFrom = c + 1;
    }
    // No valid close anywhere after this open: later opens can't close
    // either (closers are shared) — keep the rest verbatim.
    if (end === -1) break;
    out += html.slice(cursor, start) + ' ';
    cursor = end;
  }
  return out + html.slice(cursor);
}

/**
 * Strip HTML comments (`<!-- … -->`, multiline bodies included), replacing
 * each with a single space. Same linear-`indexOf` rationale as
 * `stripTagBlocks` — the previous `/<!--[\s\S]*?-->/g` lazy regex was
 * quadratic on walls of unterminated `<!-- ` openers (~12s at 512KB).
 */
function stripComments(html: string): string {
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<!--', cursor);
    if (start === -1) break;
    const end = html.indexOf('-->', start + 4);
    // Unterminated comment: nothing later can close — keep the rest.
    if (end === -1) break;
    out += html.slice(cursor, start) + ' ';
    cursor = end + 3;
  }
  return out + html.slice(cursor);
}

/**
 * Truncate a string so its UTF-8 encoding is at most `maxBytes` bytes, without
 * splitting a Unicode character. We accumulate whole CODE POINTS (not UTF-16
 * code units) until adding the next one would exceed the budget — a code point
 * may be 1–4 UTF-8 bytes, so dropping whole code points guarantees we never
 * emit a partial sequence (which would decode to U+FFFD).
 *
 * Iterating UTF-16 code units would be wrong: an astral character (emoji,
 * CJK extension, etc.) is a surrogate PAIR of two code units, and cutting
 * between them leaves a lone surrogate — exactly the partial code point this
 * function promises never to emit. `[...value]` / `Array.from` iterate by code
 * point, so each element is a complete 1–4 byte character.
 *
 * Fast path: input already within budget is returned untouched.
 */
function capBytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;

  let out = '';
  let bytes = 0;
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (bytes + charBytes > maxBytes) break;
    out += char;
    bytes += charBytes;
  }
  return out;
}

/**
 * Strip scripts/styles/svgs/comments, collapse whitespace, and cap the result
 * at `maxBytes` UTF-8 bytes. Pure; never throws; returns '' on empty/garbage
 * input.
 *
 * @param html    Raw HTML (or any string).
 * @param maxBytes UTF-8 byte cap on the output. Defaults to 50KB.
 */
export function pruneHtml(html: string, maxBytes = DEFAULT_MAX_BYTES): string {
  if (typeof html !== 'string' || html.length === 0) return '';

  let out = html;
  for (const tag of BLOCK_STRIP_TAGS) {
    out = stripTagBlocks(out, tag);
  }
  out = stripComments(out);
  out = out.replace(WHITESPACE_RUN_PATTERN, ' ').trim();

  return capBytes(out, maxBytes);
}
