import coreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...coreWebVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**'],
  },
  {
    // eslint-config-next v16 added stricter react-hooks rules that flag pre-existing
    // patterns (setState in effects, Date.now in handlers, useCallback wrapping props).
    // Disabling here until these are addressed in a dedicated cleanup phase.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
  // Test files and vitest setup use anonymous mock components — display names not needed
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'vitest.setup.ts'],
    rules: {
      'react/display-name': 'off',
    },
  },
];

export default config;
