/**
 * Unit tests for isCapturableUrl helper.
 *
 * TDD — these tests were written before the implementation.
 * Only http: and https: pages can accept content-script injection;
 * everything else must short-circuit with a friendly error.
 */

import { describe, it, expect } from 'vitest';
import { isCapturableUrl } from '../capturable-url';

describe('isCapturableUrl', () => {
  // --- TRUE cases ---

  it('returns true for an http: URL', () => {
    expect(isCapturableUrl('http://example.com/listing')).toBe(true);
  });

  it('returns true for an https: URL', () => {
    expect(isCapturableUrl('https://www.zillow.com/homedetails/123')).toBe(true);
  });

  it('returns true for http: URL with port', () => {
    expect(isCapturableUrl('http://localhost:3000/listing')).toBe(true);
  });

  it('returns true for https: URL with query string', () => {
    expect(isCapturableUrl('https://apartments.com/listing?id=42&ref=cribai')).toBe(true);
  });

  // --- FALSE cases ---

  it('returns false for chrome:// URL', () => {
    expect(isCapturableUrl('chrome://newtab/')).toBe(false);
  });

  it('returns false for chrome://extensions', () => {
    expect(isCapturableUrl('chrome://extensions')).toBe(false);
  });

  it('returns false for chrome://settings', () => {
    expect(isCapturableUrl('chrome://settings')).toBe(false);
  });

  it('returns false for chrome-extension:// URL (any extension page)', () => {
    expect(isCapturableUrl('chrome-extension://abcdef123/popup.html')).toBe(false);
  });

  it('returns false for about:blank', () => {
    expect(isCapturableUrl('about:blank')).toBe(false);
  });

  it('returns false for about:newtab', () => {
    expect(isCapturableUrl('about:newtab')).toBe(false);
  });

  it('returns false for file:// URL (extension has no file access permission)', () => {
    expect(isCapturableUrl('file:///Users/ainesh/listing.html')).toBe(false);
  });

  it('returns false for edge:// URL', () => {
    expect(isCapturableUrl('edge://newtab/')).toBe(false);
  });

  it('returns false for view-source: URL', () => {
    expect(isCapturableUrl('view-source:https://example.com')).toBe(false);
  });

  it('returns false for Chrome Web Store URL', () => {
    expect(isCapturableUrl('https://chromewebstore.google.com/detail/some-extension')).toBe(false);
  });

  it('returns false for undefined (tab has no URL yet)', () => {
    expect(isCapturableUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCapturableUrl('')).toBe(false);
  });
});
