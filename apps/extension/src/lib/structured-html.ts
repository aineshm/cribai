/**
 * Structured-first HTML capture — pure string utilities (AIN-76).
 *
 * `buildStructuredHtmlFromString` reduces a full browser-captured
 * `document.documentElement.outerHTML` (which can exceed 3.9 MB on Zillow)
 * to a compact structured HTML that contains only the signals the server
 * extraction pipeline needs:
 *
 *   1. <meta>, <title>, <link rel="canonical"> from the <head>
 *   2. All <script type="application/ld+json"> blocks (verbatim)
 *   3. <script id="__NEXT_DATA__"> (verbatim)
 *   4. A stripped <body> (scripts/styles/svgs removed) capped at a char budget
 *
 * This keeps the total payload at ~1–1.5 MB for the largest Zillow pages
 * instead of 3.9 MB, resolving the 4 MiB extension guard false-positives
 * that blocked real listings from being saved.
 *
 * DESIGN NOTES
 * ============
 * • All extraction uses linear `indexOf` scanning (same technique as
 *   json-ld.ts and prune-html.ts in @campusnest/ai). The previous whole-document
 *   `<tag[^>]*>[\s\S]*?</tag>` lazy-regex form is O(n²) on adversarial input
 *   (walls of repeated open tags with no matching close). Linear indexOf is O(n).
 *
 * • This file has NO imports. It is a pure string utility that can be imported
 *   from anywhere in the monorepo — including the AI package's parity tests —
 *   without pulling in extension-specific Vite globals or type declarations.
 *   `buildStructuredHtml(doc)` in capture-page.ts wraps this by passing
 *   `doc.documentElement?.outerHTML ?? ''`.
 *
 * • The inlined version in background/index.ts (`captureAndSendInline`) must
 *   stay in sync with the logic here. If you change this file, update that
 *   function too.
 */

/** Default character cap on the stripped body content. */
const DEFAULT_MAX_BODY_CHARS = 500_000;

// ---------------------------------------------------------------------------
// Section finders (linear indexOf — O(n) each)
// ---------------------------------------------------------------------------

/**
 * Extract the inner content of the `<head>` element (between the closing `>`
 * of the opening tag and the start of `</head>`). Returns '' when no head is
 * found so callers degrade gracefully.
 */
function extractHeadContent(html: string): string {
  const lower = html.toLowerCase();
  const headOpen = lower.indexOf('<head');
  if (headOpen === -1) return '';
  const headTagClose = lower.indexOf('>', headOpen + 5);
  if (headTagClose === -1) return '';
  const headClose = lower.indexOf('</head>', headTagClose + 1);
  if (headClose === -1) return html.slice(headTagClose + 1);
  return html.slice(headTagClose + 1, headClose);
}

/**
 * Extract the inner content of the `<body>` element. Uses `lastIndexOf`
 * for the closing `</body>` so the entire body is captured even when inline
 * scripts contain the string `</body>` (harmless in practice but belt-and-
 * braces). Returns '' when no body is found.
 */
function extractBodyContent(html: string): string {
  const lower = html.toLowerCase();
  const bodyOpen = lower.indexOf('<body');
  if (bodyOpen === -1) return '';
  const bodyTagClose = lower.indexOf('>', bodyOpen + 5);
  if (bodyTagClose === -1) return '';
  // lastIndexOf so stray `</body>` inside scripts don't truncate early
  const bodyClose = lower.lastIndexOf('</body>');
  if (bodyClose === -1) return html.slice(bodyTagClose + 1);
  return html.slice(bodyTagClose + 1, bodyClose);
}

// ---------------------------------------------------------------------------
// Tag-block strippers (linear indexOf — O(n) each)
// ---------------------------------------------------------------------------

/**
 * Word-boundary check on a lowercased character code.
 * Returns true for a-z, 0-9, _ — the same set as `\w` on a lowercased char.
 * Used to distinguish `<script` from `<scriptx` at the tag-name boundary.
 */
function isWordCharCode(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 // _
  );
}

/**
 * Strip every `<tag …> … </tag>` block from `html`, replacing each block
 * with a single space. Identical semantics to the same function in
 * prune-html.ts (@campusnest/ai):
 *
 *   - open tag: `<tag` + word boundary + attrs up to first `>`
 *   - close tag: `</tag` + optional whitespace + `>`
 *   - unterminated open or unclosed block: left in place and scanning stops
 *
 * Linear: every `indexOf` resumes past the previous match. Adversarial
 * input (megabytes of repeated `<script `) is walked once, not O(n²).
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
    // Require word boundary: `<script` but not `<scriptx`
    if (boundary < lower.length && isWordCharCode(lower.charCodeAt(boundary))) {
      out += html.slice(cursor, boundary);
      cursor = boundary;
      continue;
    }
    const gt = lower.indexOf('>', boundary);
    if (gt === -1) break; // unterminated open tag — stop scanning
    // Find the matching close tag (first `</tag` followed by optional ws + `>`)
    let end = -1;
    let searchFrom = gt + 1;
    while (end === -1) {
      const c = lower.indexOf(close, searchFrom);
      if (c === -1) break;
      let p = c + close.length;
      while (p < lower.length && /\s/.test(lower[p]!)) p += 1;
      if (lower[p] === '>') {
        end = p + 1;
      } else {
        searchFrom = c + 1;
      }
    }
    if (end === -1) break; // no matching close — stop scanning
    out += html.slice(cursor, start); // omit the whole block (replaced by '')
    cursor = end;
  }
  return out + html.slice(cursor);
}

/**
 * Strip body content of all block-level junk tags (those with open + close
 * pairs). `<link>` is a void element in HTML5 so it has no `</link>` close
 * tag and is handled separately below.
 */
const BLOCK_STRIP_TAGS = ['script', 'style', 'svg', 'noscript', 'template'] as const;

/**
 * Strip the body content:
 *   1. Remove all block-level junk tags (script, style, svg, noscript, template)
 *   2. Remove `<link>` void elements (self-closing, matched by open-tag regex)
 *
 * Returns the stripped body inner HTML.
 */
function stripBodyTags(bodyHtml: string): string {
  let out = bodyHtml;
  for (const tag of BLOCK_STRIP_TAGS) {
    out = stripTagBlocks(out, tag);
  }
  // <link> is void in HTML5 — strip just the open tags.
  // `[^>]*` is safe here (stops at the first `>`, can't backtrack).
  out = out.replace(/<link\b[^>]*\/?>/gi, '');
  return out;
}

// ---------------------------------------------------------------------------
// Structured-signal extractors (JSON-LD blocks, __NEXT_DATA__, head metadata)
// ---------------------------------------------------------------------------

/**
 * Whether an `<script` open tag (from `<script` to the first `>`, inclusive)
 * is a JSON-LD script. Allows the MIME type to have optional parameters
 * (e.g. `; charset=utf-8`) — same leniency as SCRIPT_OPEN_TAG_REGEX in
 * json-ld.ts.
 */
const JSON_LD_OPEN_TAG_REGEX =
  /^<script[^>]*type\s*=\s*["']application\/ld\+json\s*(?:;[^"']*)?["'][^>]*>$/i;

/**
 * Extract ALL `<script type="application/ld+json">…</script>` blocks from
 * `html` as verbatim strings (open tag + content + close tag). Returns an
 * empty array when none are found.
 *
 * Uses the same linear-`indexOf` scanning strategy as `parseAllJsonLdBlocks`
 * in json-ld.ts to avoid ReDoS.
 */
function extractJsonLdScriptBlocks(html: string): readonly string[] {
  const blocks: string[] = [];
  const lower = html.toLowerCase();
  const OPEN = '<script';
  const CLOSE = '</script>';
  let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf(OPEN, cursor);
    if (start === -1) break;
    const tagEnd = lower.indexOf('>', start + OPEN.length);
    if (tagEnd === -1) break;
    if (!JSON_LD_OPEN_TAG_REGEX.test(html.slice(start, tagEnd + 1))) {
      cursor = tagEnd + 1;
      continue;
    }
    const closeIdx = lower.indexOf(CLOSE, tagEnd + 1);
    if (closeIdx === -1) break;
    blocks.push(html.slice(start, closeIdx + CLOSE.length));
    cursor = closeIdx + CLOSE.length;
  }
  return blocks;
}

/**
 * Extract the verbatim `<script id="__NEXT_DATA__" …>…</script>` block.
 * Returns `null` when the page has no `__NEXT_DATA__` blob (non-Next.js pages).
 *
 * Uses linear `indexOf` scanning for the open tag, then finds the first
 * `</script>` after it (the `__NEXT_DATA__` blob is always a single block).
 */
function extractNextDataScriptBlock(html: string): string | null {
  const lower = html.toLowerCase();
  const OPEN = '<script';
  const CLOSE = '</script>';
  let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf(OPEN, cursor);
    if (start === -1) break;
    const tagEnd = lower.indexOf('>', start + OPEN.length);
    if (tagEnd === -1) break;
    const openTag = html.slice(start, tagEnd + 1);
    if (/\bid\s*=\s*["']__NEXT_DATA__["']/.test(openTag)) {
      const closeIdx = lower.indexOf(CLOSE, tagEnd + 1);
      if (closeIdx === -1) break;
      return html.slice(start, closeIdx + CLOSE.length);
    }
    cursor = tagEnd + 1;
  }
  return null;
}

/**
 * Extract `<meta>` tags from a string (typically the `<head>` section).
 * Uses a simple regex — `[^>]*` is safe because meta tags are self-closing
 * with no content between angle brackets.
 */
function extractMetaTags(headHtml: string): readonly string[] {
  const tags: string[] = [];
  const re = /<meta\b[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(headHtml)) !== null) {
    tags.push(m[0]);
  }
  return tags;
}

/**
 * Extract the `<title>…</title>` element from the head section.
 * Returns `null` when not present.
 */
function extractTitleTag(headHtml: string): string | null {
  const m = /<title\b[^>]*>[\s\S]*?<\/title>/i.exec(headHtml);
  return m ? m[0] : null;
}

/**
 * Extract `<link rel="canonical" …>` from the head section.
 * Returns `null` when not present.
 */
function extractCanonicalLink(headHtml: string): string | null {
  const m = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*\/?>/i.exec(headHtml);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a compact structured HTML string from a full browser-captured HTML
 * page (e.g. `document.documentElement.outerHTML`).
 *
 * The output is a valid `<!doctype html>` document containing only:
 *   1. Head metadata: `<meta>`, `<title>`, `<link rel="canonical">`
 *   2. All `<script type="application/ld+json">` blocks verbatim
 *   3. The `<script id="__NEXT_DATA__">` block verbatim (if present)
 *   4. Stripped body HTML (script/style/svg/noscript/template/link removed)
 *      capped at `maxBodyChars` characters
 *
 * @param html          Full page HTML (`document.documentElement.outerHTML`)
 * @param maxBodyChars  Cap on stripped body characters (default 500_000)
 */
export function buildStructuredHtmlFromString(
  html: string,
  maxBodyChars: number = DEFAULT_MAX_BODY_CHARS,
): string {
  if (typeof html !== 'string' || html.length === 0) {
    return '<!doctype html><html><head></head><body></body></html>';
  }

  const headSection = extractHeadContent(html);
  const headParts: string[] = [];

  // 1. <title>, <meta>, <link rel="canonical"> from the head section
  const titleTag = extractTitleTag(headSection);
  if (titleTag) headParts.push(titleTag);

  const metaTags = extractMetaTags(headSection);
  for (const tag of metaTags) headParts.push(tag);

  const canonicalTag = extractCanonicalLink(headSection);
  if (canonicalTag) headParts.push(canonicalTag);

  // 2. All JSON-LD script blocks (verbatim) — search entire HTML so they
  //    are found regardless of whether they appear in <head> or <body>
  const jsonLdBlocks = extractJsonLdScriptBlocks(html);
  for (const block of jsonLdBlocks) headParts.push(block);

  // 3. __NEXT_DATA__ block (verbatim) — search entire HTML
  const nextDataBlock = extractNextDataScriptBlock(html);
  if (nextDataBlock) headParts.push(nextDataBlock);

  // 4. Stripped body content, capped at budget
  const bodyRaw = extractBodyContent(html);
  const bodyStripped = stripBodyTags(bodyRaw);
  const bodyContent = bodyStripped.slice(0, maxBodyChars);

  const headContent = headParts.join('\n');
  return `<!doctype html><html><head>\n${headContent}\n</head><body>${bodyContent}</body></html>`;
}
