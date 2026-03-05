import { describe, it, expect, vi, beforeEach } from 'vitest';
import { outputMetrics, type ScrapeMetrics } from '../metrics';

describe('outputMetrics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes correct JSON to stdout with ::metrics:: prefix', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const metrics: ScrapeMetrics = {
      upserted: 42,
      staleMarked: 3,
      archived: 1,
      deleted: 1,
      errors: 0,
    };

    outputMetrics(metrics);

    const metricsCall = consoleSpy.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('::metrics::'),
    );
    expect(metricsCall).toBeDefined();

    const jsonStr = (metricsCall![0] as string).replace('::metrics::', '');
    const parsed = JSON.parse(jsonStr);
    expect(parsed).toEqual(metrics);
  });

  it('calls process.exit(1) when upserted is 0', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const metrics: ScrapeMetrics = {
      upserted: 0,
      staleMarked: 0,
      archived: 0,
      deleted: 0,
      errors: 2,
    };

    outputMetrics(metrics);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not call process.exit when upserted > 0', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const metrics: ScrapeMetrics = {
      upserted: 10,
      staleMarked: 0,
      archived: 0,
      deleted: 0,
      errors: 0,
    };

    outputMetrics(metrics);

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
