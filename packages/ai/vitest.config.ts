import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Coverage is currently scoped to the listing extraction service
      // (AIN-13). As other modules add coverage requirements they can be
      // added here. Scoping keeps `--coverage` runs fast and signal-rich.
      include: ['src/extraction/**'],
      exclude: [
        'src/extraction/**/__tests__/**',
        'src/extraction/**/__fixtures__/**',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: {
        // Task spec: 90%+ statement coverage on the extraction module.
        // Function coverage is held to 100% (every public/internal helper
        // is exercised). Branch coverage is set at 80 — defensive null /
        // typeof checks on optional schema fields trip the remaining
        // branches without adding signal.
        statements: 90,
        branches: 80,
        functions: 100,
        lines: 90,
      },
    },
  },
});
