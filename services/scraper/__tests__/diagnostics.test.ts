import { describe, it, expect } from 'vitest';
import { createDiagnostic, formatDiagnosticReport, type SourceDiagnostic } from '../diagnostics';

describe('createDiagnostic', () => {
  it('creates a diagnostic with all fields populated', () => {
    const startTime = Date.now() - 1500;
    const diag = createDiagnostic('zillow', startTime, {
      found: 25,
      upserted: 20,
    });

    expect(diag.source).toBe('zillow');
    expect(diag.itemsFound).toBe(25);
    expect(diag.itemsUpserted).toBe(20);
    expect(diag.durationMs).toBeGreaterThanOrEqual(1000);
    expect(diag.failureReason).toBeUndefined();
  });

  it('captures error in failureReason', () => {
    const diag = createDiagnostic('craigslist', Date.now() - 500, {
      found: 0,
      upserted: 0,
      error: 'HTTP 403 — blocked by datacenter IP filter',
      responseCode: 403,
    });

    expect(diag.failureReason).toBe('HTTP 403 — blocked by datacenter IP filter');
    expect(diag.responseCode).toBe(403);
    expect(diag.itemsFound).toBe(0);
  });
});

describe('formatDiagnosticReport', () => {
  it('produces markdown table with correct columns', () => {
    const diagnostics: readonly SourceDiagnostic[] = [
      {
        source: 'zillow',
        requestCount: 1,
        responseCode: 200,
        itemsFound: 30,
        itemsUpserted: 25,
        durationMs: 2000,
      },
      {
        source: 'craigslist',
        requestCount: 1,
        responseCode: 200,
        itemsFound: 15,
        itemsUpserted: 12,
        durationMs: 1500,
      },
    ];

    const report = formatDiagnosticReport(diagnostics);

    expect(report).toContain('Per-Source Diagnostics');
    expect(report).toContain('Source');
    expect(report).toContain('Status');
    expect(report).toContain('Found');
    expect(report).toContain('Upserted');
    expect(report).toContain('Duration');
    expect(report).toContain('Notes');
    expect(report).toContain('zillow');
    expect(report).toContain('OK');
    expect(report).toContain('30');
    expect(report).toContain('25');
  });

  it('shows FAILED status with reason in Notes for failed source', () => {
    const diagnostics: readonly SourceDiagnostic[] = [
      {
        source: 'craigslist',
        requestCount: 1,
        responseCode: 403,
        itemsFound: 0,
        itemsUpserted: 0,
        durationMs: 500,
        failureReason: 'Blocked by datacenter IP filter',
      },
    ];

    const report = formatDiagnosticReport(diagnostics);

    expect(report).toContain('FAILED');
    expect(report).toContain('Blocked by datacenter IP filter');
  });

  it('shows "No listings found" for 0 items with no error', () => {
    const diagnostics: readonly SourceDiagnostic[] = [
      {
        source: 'zillow',
        requestCount: 1,
        responseCode: 200,
        itemsFound: 0,
        itemsUpserted: 0,
        durationMs: 1000,
      },
    ];

    const report = formatDiagnosticReport(diagnostics);

    expect(report).toContain('No listings found');
  });
});
