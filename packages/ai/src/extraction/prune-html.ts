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
 * Heavyweight, non-content blocks to strip wholesale (open tag, inner content,
 * close tag). Flags: `g` (all occurrences), `i` (case-insensitive tag names),
 * `s` (`.` spans newlines so multiline blocks match). The inner `[\s\S]` form
 * is used instead of `.` for the comment regex below, which predates the `s`
 * flag convention here; both are equivalent for our purposes.
 */
const BLOCK_STRIP_PATTERNS: readonly RegExp[] = [
  /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
  /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,
  /<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi,
];

/** HTML comments — `<!-- ... -->`, including multiline bodies. */
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/** Any run of whitespace (spaces, tabs, newlines) collapses to one space. */
const WHITESPACE_RUN_PATTERN = /\s+/g;

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
  for (const pattern of BLOCK_STRIP_PATTERNS) {
    out = out.replace(pattern, ' ');
  }
  out = out.replace(COMMENT_PATTERN, ' ');
  out = out.replace(WHITESPACE_RUN_PATTERN, ' ').trim();

  return capBytes(out, maxBytes);
}
