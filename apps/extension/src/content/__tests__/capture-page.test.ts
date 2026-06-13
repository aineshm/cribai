/**
 * Unit tests for capture-page.ts (AIN-72).
 *
 * capturePage is a pure function that accepts doc+location objects —
 * tested here without a real DOM by constructing minimal stubs.
 */
import { describe, it, expect } from 'vitest';
import { capturePage } from '../capture-page';
import { MAX_INNER_TEXT_CHARS, MAX_IFRAMES, MAX_IFRAME_HTML_CHARS } from '../../config/constants';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeDoc(opts: {
  outerHtml?: string;
  title?: string;
  bodyInnerText?: string;
  iframes?: Array<{ src: string; html: string; crossOrigin?: boolean }>;
}): Document {
  const iframeEls = (opts.iframes ?? []).map((f) => ({
    src: f.src,
    contentDocument: f.crossOrigin
      ? null // cross-origin — throws on real DOM; null simulates that
      : ({
          documentElement: { outerHTML: f.html },
        } as unknown as Document),
  }));

  return {
    documentElement: { outerHTML: opts.outerHtml ?? '<html></html>' },
    title: opts.title ?? 'Test Page',
    body: { innerText: opts.bodyInnerText ?? '' },
    querySelectorAll: (sel: string) => {
      if (sel === 'iframe') return iframeEls;
      return [];
    },
  } as unknown as Document;
}

function makeLoc(href: string): Location {
  return { href } as unknown as Location;
}

// ---------------------------------------------------------------------------
// Basic capture
// ---------------------------------------------------------------------------

describe('capturePage — basic fields', () => {
  it('captures html, sourceUrl, title, innerText', () => {
    const doc = makeDoc({
      outerHtml: '<html><body>hello</body></html>',
      title: 'Listing',
      bodyInnerText: 'hello world',
    });
    const result = capturePage(doc, makeLoc('https://zillow.com/homedetails/foo/123_zpid/'));

    expect(result.html).toBe('<html><body>hello</body></html>');
    expect(result.sourceUrl).toBe('https://zillow.com/homedetails/foo/123_zpid/');
    expect(result.title).toBe('Listing');
    expect(result.innerText).toBe('hello world');
  });

  it('captures zero iframes when there are none', () => {
    const result = capturePage(makeDoc({}), makeLoc('https://example.com/'));
    expect(result.iframes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// innerText cap
// ---------------------------------------------------------------------------

describe('capturePage — innerText cap', () => {
  it(`caps innerText at MAX_INNER_TEXT_CHARS (${MAX_INNER_TEXT_CHARS})`, () => {
    const longText = 'a'.repeat(MAX_INNER_TEXT_CHARS + 1000);
    const doc = makeDoc({ bodyInnerText: longText });
    const result = capturePage(doc, makeLoc('https://example.com/'));
    expect(result.innerText.length).toBe(MAX_INNER_TEXT_CHARS);
  });

  it('does not cap innerText when under the limit', () => {
    const shortText = 'hello world';
    const doc = makeDoc({ bodyInnerText: shortText });
    const result = capturePage(doc, makeLoc('https://example.com/'));
    expect(result.innerText).toBe(shortText);
  });
});

// ---------------------------------------------------------------------------
// iframe capture
// ---------------------------------------------------------------------------

describe('capturePage — iframes', () => {
  it('captures up to MAX_IFRAMES iframes', () => {
    const frames = Array.from({ length: MAX_IFRAMES + 5 }, (_, i) => ({
      src: `https://example.com/frame${i}`,
      html: `<html>${i}</html>`,
    }));
    const doc = makeDoc({ iframes: frames });
    const result = capturePage(doc, makeLoc('https://example.com/'));
    expect(result.iframes.length).toBe(MAX_IFRAMES);
  });

  it('captures iframe src and html', () => {
    const doc = makeDoc({
      iframes: [{ src: 'https://example.com/frame', html: '<html>frame content</html>' }],
    });
    const result = capturePage(doc, makeLoc('https://example.com/'));
    expect(result.iframes[0]?.src).toBe('https://example.com/frame');
    expect(result.iframes[0]?.html).toBe('<html>frame content</html>');
  });

  it(`caps iframe html at MAX_IFRAME_HTML_CHARS (${MAX_IFRAME_HTML_CHARS})`, () => {
    const bigHtml = '<html>' + 'x'.repeat(MAX_IFRAME_HTML_CHARS) + '</html>';
    const doc = makeDoc({
      iframes: [{ src: 'https://example.com/frame', html: bigHtml }],
    });
    const result = capturePage(doc, makeLoc('https://example.com/'));
    expect(result.iframes[0]?.html.length).toBe(MAX_IFRAME_HTML_CHARS);
  });

  it('skips cross-origin iframes (null contentDocument)', () => {
    const doc = makeDoc({
      iframes: [{ src: 'https://cross.example.com/frame', html: '<html/>', crossOrigin: true }],
    });
    const result = capturePage(doc, makeLoc('https://example.com/'));
    expect(result.iframes.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// No-body fallback
// ---------------------------------------------------------------------------

describe('capturePage — no body', () => {
  it('returns empty string for innerText when body is absent', () => {
    const doc = {
      documentElement: { outerHTML: '<html></html>' },
      title: 'Empty',
      body: null,
      querySelectorAll: () => [],
    } as unknown as Document;
    const result = capturePage(doc, makeLoc('https://example.com/'));
    expect(result.innerText).toBe('');
  });
});
